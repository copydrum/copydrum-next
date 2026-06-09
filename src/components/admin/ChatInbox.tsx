'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ChatConversation, ChatMessage } from '@/lib/chat/types';

const CONVERSATION_FIELDS =
  'id, user_id, guest_token, guest_name, guest_email, status, channel, subject, last_message_at, last_message_preview, unread_for_admin, unread_for_user, assigned_admin_id, rating, created_at, updated_at';

async function callAdminChat(action: 'send' | 'close' | 'read', conversationId: string, message?: string) {
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
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    const { data } = await supabase
      .from('chat_conversations')
      .select(CONVERSATION_FIELDS)
      .order('last_message_at', { ascending: false })
      .limit(200);
    setConversations((data ?? []) as ChatConversation[]);
  }, []);

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
        <div className="flex gap-1 border-b border-gray-200 p-2">
          {(['all', 'open', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 text-xs ${filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              {f === 'all' ? '전체' : f === 'open' ? '진행중' : '종료'}
            </button>
          ))}
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
                  {c.guest_name || c.guest_email || (c.user_id ? '회원' : '게스트')}
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
                  {selected.guest_name || selected.guest_email || '회원'}
                </p>
                <p className="text-xs text-gray-400">
                  {selected.guest_email || ''} {selected.user_id ? '(회원)' : '(게스트)'}
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                대화 종료
              </button>
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

            <div className="flex items-center gap-2 border-t border-gray-200 p-2">
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
    </div>
  );
}
