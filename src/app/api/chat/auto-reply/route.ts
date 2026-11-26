// 고객 채팅 메시지 직후 위젯이 호출하는 자동 응답 엔드포인트.
// 대화 소유자(게스트 토큰 또는 로그인 JWT)만 호출할 수 있고, 마지막 메시지가 고객 메시지일 때만 응답한다.
//   1) AI 첫 응답이 켜져 있고 답변을 만들 수 있으면 → 'bot' 메시지
//   2) 아니면, 자동 안내가 켜져 있고 최근에 안내/답변이 없었으면 → 'system' 안내 메시지
// 담당자 알림과 unread_for_admin 은 건드리지 않는다 (담당자는 그대로 확인·응대).
import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { buildAckMessage, generateAiReply, isAiReplyConfigured } from '@/lib/chat/autoReply.server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 담당자가 이 시간 안에 답했다면 직접 응대 중이므로 자동 응답하지 않음 */
const ADMIN_ACTIVE_MS = 30 * 60 * 1000;
/** 이 시간 안에 안내/답변이 있었다면 자동 안내를 다시 보내지 않음 */
const ACK_QUIET_MS = 6 * 60 * 60 * 1000;
const AI_PER_CONVERSATION_PER_HOUR = 8;
const AI_GLOBAL_PER_HOUR = 60;

const skipped = (reason: string) => NextResponse.json({ success: true, skipped: reason });

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const conversationId = String(body?.conversationId ?? '').trim();
    const guestToken = String(body?.guestToken ?? '').trim();
    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'Missing conversationId' }, { status: 400 });
    }

    const service = createServiceRoleClient();

    const { data: conv } = await service
      .from('chat_conversations')
      .select('id, user_id, guest_token, guest_email, locale, unread_for_user')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conv) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // ── 소유자 확인 ──
    let authorized = false;
    if (conv.guest_token && guestToken && conv.guest_token === guestToken) {
      authorized = true;
    } else if (conv.user_id) {
      const auth = request.headers.get('authorization') ?? '';
      const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (jwt) {
        const { data } = await service.auth.getUser(jwt);
        authorized = data.user?.id === conv.user_id;
      }
    }
    if (!authorized) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });

    // ── 설정 ──
    const { data: settingsRow } = await service
      .from('site_settings')
      .select('value')
      .eq('key', 'chat')
      .maybeSingle();
    const settings = (settingsRow?.value ?? {}) as { enabled?: boolean; autoAck?: boolean; aiReply?: boolean };
    if (settings.enabled === false) return skipped('chat-disabled');
    const autoAck = settings.autoAck !== false;
    const aiReply = settings.aiReply !== false;
    if (!autoAck && !aiReply) return skipped('auto-reply-off');

    // ── 대화 내역 ──
    const { data: recent, error: msgErr } = await service
      .from('chat_messages')
      .select('id, sender_type, body, attachment_url, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(30);
    if (msgErr || !recent || recent.length === 0) return skipped('no-messages');

    const trigger = recent[0];
    if (trigger.sender_type !== 'user') return skipped('last-message-not-from-user');

    const now = Date.now();
    const ageOf = (iso: string) => now - new Date(iso).getTime();
    if (recent.some((m) => m.sender_type === 'admin' && ageOf(m.created_at) < ADMIN_ACTIVE_MS)) {
      return skipped('admin-active');
    }

    const history = [...recent].reverse();
    let replyBody: string | null = null;
    let senderType: 'bot' | 'system' = 'bot';

    // ── 1) AI 첫 응답 ──
    if (aiReply && isAiReplyConfigured() && (trigger.body ?? '').trim()) {
      const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
      const convBotCount = recent.filter((m) => m.sender_type === 'bot' && ageOf(m.created_at) < 60 * 60 * 1000).length;
      const { count: globalBotCount } = await service
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('sender_type', 'bot')
        .gt('created_at', hourAgo);

      if (convBotCount < AI_PER_CONVERSATION_PER_HOUR && (globalBotCount ?? 0) < AI_GLOBAL_PER_HOUR) {
        replyBody = await generateAiReply(service, history, {
          locale: conv.locale ?? null,
          isMember: !!conv.user_id,
        });
      }
    }

    // ── 2) 자동 안내 ──
    if (!replyBody && autoAck) {
      const answeredRecently = recent.some(
        (m) => m.sender_type !== 'user' && ageOf(m.created_at) < ACK_QUIET_MS,
      );
      if (!answeredRecently) {
        const hasEmail = !!conv.user_id || !!conv.guest_email;
        replyBody = buildAckMessage(conv.locale, hasEmail);
        senderType = 'system';
      }
    }

    if (!replyBody) return skipped('nothing-to-send');

    // AI 응답을 만드는 동안 새 메시지가 왔으면(고객 추가 메시지, 담당자 답변) 이 응답은 버린다.
    // 고객의 새 메시지는 그 메시지에 대한 호출이 따로 답한다.
    const { data: latest } = await service
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id !== trigger.id) return skipped('superseded');

    const { error: insErr } = await service.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_type: senderType,
      body: replyBody,
    });
    if (insErr) {
      console.error('[chat auto-reply] insert failed:', insErr);
      return NextResponse.json({ success: false, error: 'Insert failed' }, { status: 500 });
    }

    await service
      .from('chat_conversations')
      .update({ unread_for_user: (conv.unread_for_user ?? 0) + 1 })
      .eq('id', conversationId);

    return NextResponse.json({ success: true, sent: senderType });
  } catch (error) {
    console.error('[chat auto-reply]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
