'use client';

import { supabase } from '@/lib/supabase';
import { getPublicChatSettings, type ChatSettings } from '@/lib/settings';
import type { ChatConversation, ChatMessage } from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GUEST_STORAGE_KEY = 'cd_chat_guest_v1';
const ATTACH_BUCKET = 'chat-attachments';

const CONVERSATION_FIELDS =
  'id, user_id, guest_token, guest_name, guest_email, status, channel, subject, last_message_at, last_message_preview, unread_for_admin, unread_for_user, assigned_admin_id, rating, created_at, updated_at';

export async function loadChatSettings(): Promise<ChatSettings> {
  return getPublicChatSettings();
}

// ── 게스트 로컬 식별 정보 ─────────────────────────────────────────────────────
export interface GuestSession {
  token: string;
  conversationId: string;
  name: string;
  email: string;
  /** 이메일 요청 카드를 이미 보여줬는지 (나중에 하기 선택 시 다시 묻지 않음) */
  emailAsked?: boolean;
}

export function readGuestSession(): GuestSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    return null;
  }
}

export function writeGuestSession(session: GuestSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(session));
}

export function clearGuestSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(GUEST_STORAGE_KEY);
}

async function callChatFn<T>(action: string, payload: Record<string, unknown>, bearer = ANON_KEY): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-guest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `chat-guest ${action} failed`);
  }
  return json as T;
}

async function callChatFnWithAuth<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  return callChatFn<T>(action, payload, session?.access_token ?? ANON_KEY);
}

// ── 로그인 사용자: RLS 직접 접근, 실패 시 엣지 함수(service role) ─────────────
/** 진행 중인 대화가 있으면 반환 (새로 만들지 않음) */
export async function findUserConversation(userId: string): Promise<ChatConversation | null> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select(CONVERSATION_FIELDS)
    .eq('user_id', userId)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatConversation | null) ?? null;
}

export async function getOrCreateUserConversation(
  userId: string,
  channel: 'live' | 'offline_message',
  meta: { email?: string | null; locale?: string | null } = {},
): Promise<ChatConversation> {
  let conv: ChatConversation;
  let isNew = false;
  try {
    const existing = await findUserConversation(userId);
    if (existing) return existing;

    const { data: created, error } = await supabase
      .from('chat_conversations')
      .insert({ user_id: userId, channel, status: 'open', guest_email: meta.email ?? null })
      .select(CONVERSATION_FIELDS)
      .single();

    if (error) throw error;
    conv = created as ChatConversation;
    isNew = true;
  } catch {
    const data = await callChatFnWithAuth<{ conversationId: string }>('ensureConversation', {
      locale: meta.locale ?? null,
    });
    conv = {
      id: data.conversationId,
      user_id: userId,
      channel,
      status: 'open',
    } as ChatConversation;
  }
  if (isNew && meta.locale) {
    // locale 컬럼은 마이그레이션 적용 후에만 존재
    await supabase.from('chat_conversations').update({ locale: meta.locale }).eq('id', conv.id);
  }
  return conv;
}

export async function listUserMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function sendUserMessage(
  conversationId: string,
  userId: string,
  body: string,
  attachmentUrl: string | null = null,
): Promise<ChatMessage> {
  const trimmed = body.trim();
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'user',
        sender_id: userId,
        body: trimmed,
        attachment_url: attachmentUrl,
      })
      .select('*')
      .single();
    if (error) throw error;

    await supabase
      .from('chat_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: trimmed ? trimmed.slice(0, 120) : '[사진]',
        status: 'open',
        unread_for_admin: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    return data as ChatMessage;
  } catch {
    const data = await callChatFnWithAuth<{ message: ChatMessage }>('userSend', {
      conversationId,
      body: trimmed,
      attachmentUrl,
    });
    return data.message;
  }
}

/** 로그인 사용자: 읽음 처리 + 지금 채팅을 보고 있다고 기록 (답변 이메일 중복 방지) */
export async function markUserConversationSeen(conversationId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('chat_conversations')
    .update({ unread_for_user: 0, user_last_seen_at: nowIso })
    .eq('id', conversationId);
  if (error) {
    // user_last_seen_at 컬럼이 아직 없을 때
    await supabase.from('chat_conversations').update({ unread_for_user: 0 }).eq('id', conversationId);
  }
}

/** 로그인 사용자: 진행 중인 대화의 미읽음 답변 수 */
export async function getUserUnreadCount(userId: string): Promise<{ conversationId: string | null; unread: number }> {
  const conv = await findUserConversation(userId);
  return { conversationId: conv?.id ?? null, unread: conv?.unread_for_user ?? 0 };
}

/** 로그인 사용자: 해당 대화의 신규 메시지를 Realtime 으로 구독 */
export function subscribeToConversation(
  conversationId: string,
  onInsert: (msg: ChatMessage) => void,
) {
  const channel = supabase
    .channel(`chat:${conversationId}:${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert(payload.new as ChatMessage),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ── 게스트: 엣지 함수 경유 ────────────────────────────────────────────────────
export async function guestStart(params: {
  firstMessage?: string | null;
  email?: string | null;
  name?: string | null;
  locale?: string | null;
}): Promise<GuestSession> {
  const email = params.email?.trim() ?? '';
  const name = params.name?.trim() || (email ? email.split('@')[0] : '');
  const data = await callChatFn<{ conversationId: string; token: string }>('start', {
    name,
    email,
    channel: 'live',
    firstMessage: params.firstMessage ?? null,
    locale: params.locale ?? null,
  });
  const session: GuestSession = {
    token: data.token,
    conversationId: data.conversationId,
    name,
    email,
    emailAsked: !!email,
  };
  writeGuestSession(session);
  return session;
}

export async function guestSetEmail(session: GuestSession, email: string): Promise<GuestSession> {
  await callChatFn('setEmail', {
    token: session.token,
    conversationId: session.conversationId,
    email: email.trim(),
  });
  const next: GuestSession = { ...session, email: email.trim(), emailAsked: true };
  writeGuestSession(next);
  return next;
}

export async function guestSend(session: GuestSession, body: string, attachmentUrl: string | null = null): Promise<void> {
  await callChatFn('send', {
    token: session.token,
    conversationId: session.conversationId,
    body: body.trim(),
    attachmentUrl,
  });
}

export async function guestFetch(
  session: GuestSession,
  sinceIso?: string | null,
): Promise<ChatMessage[]> {
  const data = await callChatFn<{ messages: ChatMessage[] }>('fetch', {
    token: session.token,
    conversationId: session.conversationId,
    since: sinceIso ?? null,
  });
  return data.messages ?? [];
}

export async function guestUnreadCount(session: GuestSession): Promise<number> {
  const data = await callChatFn<{ unread: number }>('unread', {
    token: session.token,
    conversationId: session.conversationId,
  });
  return data.unread ?? 0;
}

// ── 이미지 첨부 ───────────────────────────────────────────────────────────────
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** 이미지를 chat-attachments 버킷에 올리고 공개 URL 반환 (서명 업로드 URL은 엣지 함수가 발급) */
export async function uploadChatImage(
  file: File,
  conversationId: string,
  guestSession: GuestSession | null,
): Promise<string> {
  const ext = (file.name.split('.').pop() || file.type.split('/').pop() || 'jpg').toLowerCase();
  const payload = {
    conversationId,
    ext,
    ...(guestSession ? { token: guestSession.token } : {}),
  };
  const data = guestSession
    ? await callChatFn<{ path: string; uploadToken: string; publicUrl: string }>('attachUrl', payload)
    : await callChatFnWithAuth<{ path: string; uploadToken: string; publicUrl: string }>('attachUrl', payload);

  const { error } = await supabase.storage
    .from(ATTACH_BUCKET)
    .uploadToSignedUrl(data.path, data.uploadToken, file, { contentType: file.type || undefined });
  if (error) throw error;
  return data.publicUrl;
}
