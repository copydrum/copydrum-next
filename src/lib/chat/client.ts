'use client';

import { supabase } from '@/lib/supabase';
import { getPublicChatSettings, type ChatSettings } from '@/lib/settings';
import type { ChatConversation, ChatMessage, GuestIdentity } from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const GUEST_STORAGE_KEY = 'cd_chat_guest_v1';

const CONVERSATION_FIELDS =
  'id, user_id, guest_token, guest_name, guest_email, status, channel, subject, last_message_at, last_message_preview, unread_for_admin, unread_for_user, assigned_admin_id, rating, created_at, updated_at';

export async function loadChatSettings(): Promise<ChatSettings> {
  return getPublicChatSettings();
}

export interface BotResult {
  success: boolean;
  recovered?: number;
  message?: string;
  error?: string;
}

/** 룰 기반 결제 자동복구 봇 호출 */
export async function runPaymentBot(params: {
  email?: string | null;
  userId?: string | null;
  conversationId?: string | null;
  guestToken?: string | null;
}): Promise<BotResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-bot-recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(params),
  });
  try {
    return (await res.json()) as BotResult;
  } catch {
    return { success: false, error: 'request failed' };
  }
}

// ── 게스트 로컬 식별 정보 ─────────────────────────────────────────────────────
export interface GuestSession {
  token: string;
  conversationId: string;
  name: string;
  email: string;
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

// ── 로그인 사용자: 직접 RLS 접근 ──────────────────────────────────────────────
export async function getOrCreateUserConversation(
  userId: string,
  channel: 'live' | 'offline_message',
): Promise<ChatConversation> {
  const { data: existing } = await supabase
    .from('chat_conversations')
    .select(CONVERSATION_FIELDS)
    .eq('user_id', userId)
    .neq('status', 'closed')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as ChatConversation;

  const { data: created, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: userId, channel, status: 'open' })
    .select(CONVERSATION_FIELDS)
    .single();

  if (error) throw error;
  return created as ChatConversation;
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
): Promise<ChatMessage> {
  const trimmed = body.trim();
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'user',
      sender_id: userId,
      body: trimmed,
    })
    .select('*')
    .single();
  if (error) throw error;

  // 대화 메타 갱신(실패해도 메시지 전송은 성공으로 간주)
  await supabase
    .from('chat_conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: trimmed.slice(0, 120),
      status: 'open',
      unread_for_admin: 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  return data as ChatMessage;
}

/** 로그인 사용자: 해당 대화의 신규 메시지를 Realtime 으로 구독 */
export function subscribeToConversation(
  conversationId: string,
  onInsert: (msg: ChatMessage) => void,
) {
  const channel = supabase
    .channel(`chat:${conversationId}`)
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
async function callGuestFn<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-guest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `chat-guest ${action} failed`);
  }
  return json as T;
}

export async function guestStart(
  identity: GuestIdentity,
  channel: 'live' | 'offline_message',
  firstMessage?: string,
): Promise<GuestSession> {
  const data = await callGuestFn<{ conversationId: string; token: string }>('start', {
    name: identity.name,
    email: identity.email,
    channel,
    firstMessage: firstMessage ?? null,
  });
  const session: GuestSession = {
    token: data.token,
    conversationId: data.conversationId,
    name: identity.name,
    email: identity.email,
  };
  writeGuestSession(session);
  return session;
}

export async function guestSend(session: GuestSession, body: string): Promise<void> {
  await callGuestFn('send', {
    token: session.token,
    conversationId: session.conversationId,
    body: body.trim(),
  });
}

export async function guestFetch(
  session: GuestSession,
  sinceIso?: string | null,
): Promise<ChatMessage[]> {
  const data = await callGuestFn<{ messages: ChatMessage[] }>('fetch', {
    token: session.token,
    conversationId: session.conversationId,
    since: sinceIso ?? null,
  });
  return data.messages ?? [];
}
