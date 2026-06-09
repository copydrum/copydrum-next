'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ChatConversation, ChatMessage } from '@/lib/chat/types';
import ChatCustomerContext from './ChatCustomerContext';

const QUICK_REPLIES = [
  '안녕하세요, CopyDrum입니다. 무엇을 도와드릴까요?',
  '결제 확인 후 바로 처리해 드리겠습니다. 잠시만 기다려 주세요.',
  '결제가 정상 완료되어 다운로드 가능하도록 처리했습니다. 마이페이지에서 확인해 주세요.',
  '확인해 주셔서 감사합니다. 추가로 궁금하신 점 있으시면 말씀해 주세요.',
];

const CONVERSATION_FIELDS =
  'id, user_id, guest_token, guest_name, guest_email, status, channel, subject, last_message_at, last_message_preview, unread_for_admin, unread_for_user, assigned_admin_id, rating, created_at, updated_at';

type MemberProfile = { email: string; name: string | null };

function convDisplayName(c: ChatConversation, profiles: Record<string, MemberProfile>): string {
  const member = c.user_id ? profiles[c.user_id] : null;
  return c.guest_name || member?.name || c.guest_email || member?.email || (c.user_id ? '회원' : '게스트');
}

function convDisplayEmail(c: ChatConversation, profiles: Record<string, MemberProfile>): string | null {
  return c.guest_email || (c.user_id ? profiles[c.user_id]?.email ?? null : null);
}

async function callAdminChat(
  action: 'send' | 'close' | 'read' | 'block' | 'unblock',
  conversationId: string,
  message?: string,
) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await supabase.functions.invoke('admin-send-chat-message', {
    body: { action, conversationId, message },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (res.error) throw res.error;
  return res.data;
}

export default function ChatInbox() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [showContext, setShowContext] = useState(true);
  const [soundOn, setSoundOn] = useState(true);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [blockedEmails, setBlockedEmails] = useState<Set<string>>(new Set());
  const [memberProfiles, setMemberProfiles] = useState<Record<string, MemberProfile>>({});
  const endRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // 데스크톱 알림 권한 요청
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new Ctor();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
    } catch {
      /* ignore */
    }
  }, []);

  const notifyNewMessage = useCallback((body: string) => {
    if (soundOn) playBeep();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('새 채팅 메시지', { body: body.slice(0, 80) });
      }
    } catch {
      /* ignore */
    }
  }, [soundOn, playBeep]);

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from('chat_conversations')
      .select(CONVERSATION_FIELDS)
      .order('last_message_at', { ascending: false })
      .limit(200);
    const convs = (data ?? []) as ChatConversation[];
    const userIds = [...new Set(convs.map((c) => c.user_id).filter(Boolean))] as string[];

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, name')
        .in('id', userIds);
      const map: Record<string, MemberProfile> = {};
      (profiles ?? []).forEach((p: { id: string; email: string; name: string | null }) => {
        if (p.email) map[p.id] = { email: p.email, name: p.name };
      });
      setMemberProfiles(map);
    } else {
      setMemberProfiles({});
    }

    setConversations(convs);
  }, []);

  const loadBlocks = useCallback(async () => {
    const { data } = await supabase.from('chat_blocks').select('user_id, email');
    const uids = new Set<string>();
    const emails = new Set<string>();
    (data ?? []).forEach((b: { user_id: string | null; email: string | null }) => {
      if (b.user_id) uids.add(b.user_id);
      if (b.email) emails.add(b.email.toLowerCase());
    });
    setBlockedUserIds(uids);
    setBlockedEmails(emails);
  }, []);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const isConvBlocked = useCallback(
    (c: ChatConversation | null) => {
      if (!c) return false;
      if (c.user_id && blockedUserIds.has(c.user_id)) return true;
      if (c.guest_email && blockedEmails.has(c.guest_email.toLowerCase())) return true;
      return false;
    },
    [blockedUserIds, blockedEmails],
  );

  const handleToggleBlock = useCallback(
    async (c: ChatConversation) => {
      const blocked = isConvBlocked(c);
      if (!blocked && !confirm('이 사용자를 차단하시겠습니까? (대화도 종료됩니다)')) return;
      try {
        await callAdminChat(blocked ? 'unblock' : 'block', c.id);
        await loadBlocks();
        await loadConversations();
      } catch {
        alert('처리 실패');
      }
    },
    [isConvBlocked, loadBlocks, loadConversations],
  );

  // 대화 목록 + 실시간 갱신
  useEffect(() => {
    loadConversations();
    const channel = supabase
      .channel('admin-chat-conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
        loadConversations();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadConversations]);

  // 신규 고객 메시지 알림(데스크톱 + 소리)
  useEffect(() => {
    const channel = supabase
      .channel('admin-chat-notify')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: 'sender_type=eq.user' },
        (payload) => {
          const m = payload.new as ChatMessage;
          const viewingThis = selectedIdRef.current === m.conversation_id;
          if (!viewingThis || document.hidden) {
            notifyNewMessage(m.body);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [notifyNewMessage]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  // 선택된 대화 메시지 + 실시간
  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', selectedId)
        .order('created_at', { ascending: true });
      if (!mounted) return;
      setMessages((data ?? []) as ChatMessage[]);
      scrollToBottom();
      callAdminChat('read', selectedId).catch(() => {});
    })();

    const channel = supabase
      .channel(`admin-chat:${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          setMessages((prev) => {
            const m = payload.new as ChatMessage;
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m];
          });
          scrollToBottom();
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [selectedId, scrollToBottom]);

  const handleSend = async () => {
    const body = reply.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    try {
      await callAdminChat('send', selectedId, body);
      setReply('');
    } catch {
      alert('전송 실패');
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    try {
      await callAdminChat('close', selectedId);
      loadConversations();
    } catch {
      alert('처리 실패');
    }
  };

  const visible = conversations.filter((c) =>
    filter === 'all' ? true : filter === 'open' ? c.status !== 'closed' : c.status === 'closed',
  );
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-[70vh] overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* 좌측: 목록 */}
      <div className="flex w-72 shrink-0 flex-col border-r border-gray-200">
        <div className="flex items-center gap-1 border-b border-gray-200 p-2">
          {(['all', 'open', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 text-xs ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {f === 'all' ? '전체' : f === 'open' ? '진행중' : '종료'}
            </button>
          ))}
          <button
            onClick={() => setSoundOn((v) => !v)}
            title="알림음"
            className={`ml-auto rounded px-2 py-1 text-xs ${soundOn ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {visible.length === 0 && <p className="p-4 text-sm text-gray-400">대화가 없습니다.</p>}
          {visible.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex w-full flex-col items-start gap-0.5 border-b border-gray-100 px-3 py-2 text-left hover:bg-gray-50 ${
                selectedId === c.id ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="truncate text-sm font-medium text-gray-800">
                  {convDisplayName(c, memberProfiles)}
                </span>
                {c.unread_for_admin > 0 && (
                  <span className="ml-2 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                )}
              </div>
              <span className="line-clamp-1 text-xs text-gray-500">{c.last_message_preview ?? ''}</span>
              <span className="text-[10px] text-gray-400">
                {new Date(c.last_message_at).toLocaleString('ko-KR')} · {c.status}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 우측: 스레드 */}
      <div className="flex flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            왼쪽에서 대화를 선택하세요.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {convDisplayName(selected, memberProfiles)}
                </p>
                <p className="text-xs text-gray-400">
                  {convDisplayEmail(selected, memberProfiles) || '이메일 없음'}{' '}
                  {selected.user_id ? '(회원)' : '(게스트)'}
                  {isConvBlocked(selected) && <span className="ml-1 font-semibold text-red-500">· 차단됨</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowContext((v) => !v)}
                  className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {showContext ? '고객정보 숨기기' : '고객정보'}
                </button>
                <button
                  onClick={() => handleToggleBlock(selected)}
                  className={`rounded border px-3 py-1 text-xs ${
                    isConvBlocked(selected)
                      ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      : 'border-red-300 text-red-600 hover:bg-red-50'
                  }`}
                >
                  {isConvBlocked(selected) ? '차단 해제' : '차단'}
                </button>
                <button
                  onClick={handleClose}
                  className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  대화 종료
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto bg-gray-50 p-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                      m.sender_type === 'admin'
                        ? 'bg-indigo-600 text-white'
                        : m.sender_type === 'user'
                          ? 'border border-gray-200 bg-white text-gray-800'
                          : 'mx-auto bg-gray-100 text-gray-500'
                    }`}
                  >
                    {m.body}
                    <div className={`mt-1 text-[10px] ${m.sender_type === 'admin' ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {new Date(m.created_at).toLocaleTimeString('ko-KR')}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="flex flex-wrap gap-1 border-t border-gray-200 px-2 pt-2">
              {QUICK_REPLIES.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setReply(q)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100"
                  title={q}
                >
                  {q.length > 18 ? q.slice(0, 18) + '…' : q}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 p-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="답변을 입력하세요"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={sending || !reply.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                전송
              </button>
            </div>
          </>
        )}
      </div>

      {/* 우측: 고객/주문 컨텍스트 */}
      {selected && showContext && (
        <ChatCustomerContext
          key={selected.id}
          userId={selected.user_id}
          email={convDisplayEmail(selected, memberProfiles)}
          memberName={selected.user_id ? memberProfiles[selected.user_id]?.name ?? null : null}
        />
      )}
    </div>
  );
}
