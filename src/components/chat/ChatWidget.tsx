'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isChatOnline, nextOpeningHint } from '@/lib/chat/online';
import type { ChatSettings } from '@/lib/settings';
import {
  loadChatSettings,
  getOrCreateUserConversation,
  listUserMessages,
  sendUserMessage,
  subscribeToConversation,
  readGuestSession,
  guestStart,
  guestSend,
  guestFetch,
  type GuestSession,
} from '@/lib/chat/client';
import type { ChatMessage } from '@/lib/chat/types';

type View = 'loading' | 'live' | 'offline' | 'offline_sent';

const QUICK_REPLIES = [
  '결제했는데 악보가 안 보여요',
  '다운로드가 안 돼요',
  '환불 문의드려요',
  '주문번호를 알려드릴게요',
];

export default function ChatWidget() {
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [view, setView] = useState<View>('loading');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const guestSessionRef = useRef<GuestSession | null>(null);

  // 게스트 시작 폼
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  // 오프라인 문의 폼
  const [offName, setOffName] = useState('');
  const [offEmail, setOffEmail] = useState('');
  const [offCategory, setOffCategory] = useState('payment');
  const [offMessage, setOffMessage] = useState('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 초기 로드: 설정 + 사용자
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [chat, { data }] = await Promise.all([
          loadChatSettings(),
          supabase.auth.getUser(),
        ]);
        if (!active) return;
        setSettings(chat);
        setOnline(isChatOnline(chat));
        setUserId(data.user?.id ?? null);
        setUserEmail(data.user?.email ?? null);
        guestSessionRef.current = readGuestSession();
      } catch {
        // 설정 로드 실패 시 위젯 숨김
        if (active) setSettings(null);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 1분마다 온라인 상태 재계산(운영시간 경계 반영)
  useEffect(() => {
    if (!settings) return;
    const t = setInterval(() => setOnline(isChatOnline(settings)), 60_000);
    return () => clearInterval(t);
  }, [settings]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  const appendUnique = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      for (const m of incoming) {
        if (!seen.has(m.id)) merged.push(m);
      }
      merged.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return merged;
    });
    scrollToBottom();
  }, [scrollToBottom]);

  // 라이브 채팅 초기화
  const initLive = useCallback(async () => {
    if (userId) {
      // 로그인 사용자: 직접 RLS + Realtime
      const conv = await getOrCreateUserConversation(userId, 'live');
      setConversationId(conv.id);
      const msgs = await listUserMessages(conv.id);
      setMessages(msgs);
      scrollToBottom();
      const unsub = subscribeToConversation(conv.id, (msg) => appendUnique([msg]));
      return unsub;
    }
    // 게스트: 기존 세션 있으면 폴링 시작, 없으면 시작 폼 노출(여기선 메시지 비움)
    const session = readGuestSession();
    guestSessionRef.current = session;
    if (session) {
      setConversationId(session.conversationId);
      const msgs = await guestFetch(session);
      setMessages(msgs);
      scrollToBottom();
    }
    return undefined;
  }, [userId, appendUnique, scrollToBottom]);

  // 게스트 폴링
  useEffect(() => {
    if (view !== 'live' || userId || !conversationId) return;
    const session = guestSessionRef.current;
    if (!session) return;
    pollRef.current = setInterval(async () => {
      try {
        const last = messages.length ? messages[messages.length - 1].created_at : null;
        const fresh = await guestFetch(session, last);
        if (fresh.length) appendUnique(fresh);
      } catch {
        /* ignore */
      }
    }, 3500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [view, userId, conversationId, messages, appendUnique]);

  // 위젯 열림/온라인에 따라 뷰 결정 + 초기화
  useEffect(() => {
    if (!open || !settings) return;
    let cleanup: (() => void) | undefined;
    if (online) {
      setView('live');
      // 게스트이면서 세션 없으면 시작 폼만, 있으면 초기화
      if (!userId && !readGuestSession()) {
        setMessages([]);
      } else {
        initLive().then((unsub) => {
          cleanup = unsub;
        });
      }
    } else {
      setView('offline');
      setOffName('');
      setOffEmail(userEmail ?? '');
    }
    return () => {
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, online, settings, userId]);

  const handleSend = useCallback(async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (userId && conversationId) {
        const msg = await sendUserMessage(conversationId, userId, body);
        appendUnique([msg]);
      } else if (!userId) {
        let session = guestSessionRef.current;
        if (!session) {
          // 게스트가 폼 없이 보낼 수 없음 — 시작 폼에서 처리
          setSending(false);
          return;
        }
        await guestSend(session, body);
        appendUnique([
          {
            id: `local-${Date.now()}`,
            conversation_id: session.conversationId,
            sender_type: 'user',
            sender_id: null,
            body,
            attachment_url: null,
            read_at: null,
            created_at: new Date().toISOString(),
          },
        ]);
      }
      setInput('');
    } catch {
      /* noop */
    } finally {
      setSending(false);
    }
  }, [input, sending, userId, conversationId, appendUnique]);

  const handleGuestStart = useCallback(async () => {
    if (!guestName.trim() || !guestEmail.trim()) return;
    setSending(true);
    try {
      const session = await guestStart(
        { name: guestName.trim(), email: guestEmail.trim() },
        'live',
      );
      guestSessionRef.current = session;
      setConversationId(session.conversationId);
      setMessages([]);
    } catch {
      /* noop */
    } finally {
      setSending(false);
    }
  }, [guestName, guestEmail]);

  const handleOfflineSubmit = useCallback(async () => {
    const name = offName.trim();
    const email = offEmail.trim();
    const content = offMessage.trim();
    if (!name || !email || !content) return;
    setSending(true);
    try {
      const { error } = await supabase.from('customer_inquiries').insert({
        user_id: userId,
        name,
        email,
        category: offCategory,
        title: '[채팅] 운영시간 외 문의',
        content,
        status: 'pending',
      });
      if (!error) {
        setView('offline_sent');
        setOffMessage('');
      }
    } catch {
      /* noop */
    } finally {
      setSending(false);
    }
  }, [offName, offEmail, offCategory, offMessage, userId]);

  if (!settings || !settings.enabled) return null;

  const hasGuestSession = !userId && !!guestSessionRef.current;
  const needsGuestStart = view === 'live' && !userId && !hasGuestSession;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col items-end">
      {open && (
        <div className="mb-3 flex h-[520px] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* 헤더 */}
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">CopyDrum 상담</p>
              <p className="flex items-center gap-1 text-xs text-indigo-100">
                <span className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-green-400' : 'bg-gray-300'}`} />
                {online ? '상담 가능' : '운영시간 외'}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="닫기" className="rounded p-1 hover:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 본문 */}
          <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
            {view === 'offline' && (
              <div className="flex flex-1 flex-col overflow-y-auto p-4">
                <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  {settings.offlineMessage}
                  {nextOpeningHint(settings) && (
                    <p className="mt-1 text-xs text-amber-600">{nextOpeningHint(settings)}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <input
                    value={offName}
                    onChange={(e) => setOffName(e.target.value)}
                    placeholder="이름"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={offEmail}
                    onChange={(e) => setOffEmail(e.target.value)}
                    placeholder="이메일 (답변 받을 주소)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={offCategory}
                    onChange={(e) => setOffCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="payment">결제/주문 문의</option>
                    <option value="download">다운로드 문의</option>
                    <option value="refund">환불 문의</option>
                    <option value="etc">기타</option>
                  </select>
                  <textarea
                    value={offMessage}
                    onChange={(e) => setOffMessage(e.target.value)}
                    placeholder="문의 내용을 남겨주세요. (결제 문의는 주문번호를 함께 적어주세요)"
                    rows={4}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleOfflineSubmit}
                    disabled={sending}
                    className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    문의 남기기
                  </button>
                </div>
              </div>
            )}

            {view === 'offline_sent' && (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-800">문의가 접수되었습니다.</p>
                <p className="mt-1 text-xs text-gray-500">운영시간에 순차적으로 확인 후 입력하신 이메일로 답변드리겠습니다.</p>
              </div>
            )}

            {view === 'live' && needsGuestStart && (
              <div className="flex flex-1 flex-col overflow-y-auto p-4">
                <div className="mb-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800">
                  {settings.welcomeMessage}
                </div>
                <p className="mb-2 text-xs text-gray-500">상담을 시작하려면 정보를 입력해 주세요.</p>
                <div className="space-y-2">
                  <input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="이름"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="이메일"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleGuestStart}
                    disabled={sending}
                    className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    상담 시작
                  </button>
                </div>
              </div>
            )}

            {view === 'live' && !needsGuestStart && (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  <div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800">
                    {settings.welcomeMessage}
                  </div>
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                {messages.length === 0 && (
                  <div className="flex flex-wrap gap-1 border-t border-gray-100 bg-white px-2 pt-2">
                    {QUICK_REPLIES.map((q) => (
                      <button
                        key={q}
                        onClick={() => setInput(q)}
                        className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700 hover:bg-indigo-100"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 border-t border-gray-200 bg-white p-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="메시지를 입력하세요"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    전송
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="고객 상담 채팅"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg transition hover:scale-105"
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.sender_type === 'user';
  const isSystem = message.sender_type === 'system' || message.sender_type === 'bot';
  if (isSystem) {
    return (
      <div className="mx-auto max-w-[90%] rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-500">
        {message.body}
      </div>
    );
  }
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
          isUser ? 'bg-indigo-600 text-white' : 'border border-gray-200 bg-white text-gray-800'
        }`}
      >
        {message.body}
      </div>
    </div>
  );
}
