'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { removeLocaleFromPathname } from '@/lib/localeUrl';
import { isChatOnline } from '@/lib/chat/online';
import { getChatStrings } from '@/lib/chat/strings';
import {
  getChatWelcomeMessage,
  getChatOfflineMessage,
  getPayBotButtonLabel,
  getBusinessHoursHint,
} from '@/lib/chat/messages';
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
  runPaymentBot,
  type GuestSession,
} from '@/lib/chat/client';
import type { ChatMessage } from '@/lib/chat/types';

type View = 'loading' | 'live' | 'offline' | 'offline_sent';

const FLOATING_GAP = 12; // 구매 바와 채팅 버튼 사이 여백(px)
const DEFAULT_BOTTOM = 20; // bottom-5 기본 위치(px)

function isMobilePurchaseFlowPage(pathname: string): boolean {
  const path = removeLocaleFromPathname(pathname);
  if (path === '/cart' || path.startsWith('/cart/')) return true;
  if (path.startsWith('/drum-sheet/')) return true;
  if (path.startsWith('/sheet-detail/')) return true;
  return false;
}

export default function ChatWidget() {
  const { i18n } = useTranslation();
  const pathname = usePathname();
  const t = useMemo(() => getChatStrings(i18n.language), [i18n.language]);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const welcomeText = useMemo(
    () => getChatWelcomeMessage(i18n.language, settings),
    [i18n.language, settings],
  );
  const offlineText = useMemo(
    () => getChatOfflineMessage(i18n.language, settings),
    [i18n.language, settings],
  );
  const payBotLabel = useMemo(() => getPayBotButtonLabel(i18n.language), [i18n.language]);
  const businessHoursHint = useMemo(
    () => getBusinessHoursHint(i18n.language, settings),
    [i18n.language, settings],
  );
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  // 모바일 구매 바와 겹치지 않도록 동적으로 계산되는 하단 오프셋(px)
  const [bottomOffset, setBottomOffset] = useState(DEFAULT_BOTTOM);
  const [online, setOnline] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [view, setView] = useState<View>('loading');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [botRunning, setBotRunning] = useState(false);
  const [offBotMessage, setOffBotMessage] = useState<string | null>(null);
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
  const realtimeUnsubRef = useRef<(() => void) | null>(null);

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

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user?.id ?? null);
      setUserEmail(session?.user?.email ?? null);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  // 1분마다 온라인 상태 재계산(운영시간 경계 반영)
  useEffect(() => {
    if (!settings) return;
    const t = setInterval(() => setOnline(isChatOnline(settings)), 60_000);
    return () => clearInterval(t);
  }, [settings]);

  // 모바일 여부 (Tailwind md 미만: 767px 이하)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // 상황 인지형 위치: 모바일 하단 구매 바가 보이면 채팅 버튼을 그 위로 자동 이동
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const measure = () => {
      const bar = document.querySelector<HTMLElement>('[data-mobile-purchase-bar]');
      if (bar) {
        const rect = bar.getBoundingClientRect();
        // lg 이상에서는 구매 바가 display:none 이라 height 가 0 → 기본 위치 유지
        if (rect.height > 0 && rect.bottom > 0) {
          const fromBottom = window.innerHeight - rect.top + FLOATING_GAP;
          setBottomOffset(Math.max(DEFAULT_BOTTOM, Math.round(fromBottom)));
          return;
        }
      }
      setBottomOffset(DEFAULT_BOTTOM);
    };

    measure();

    let rafId = 0;
    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    window.addEventListener('resize', scheduleMeasure);
    const observer = new MutationObserver(scheduleMeasure);
    observer.observe(document.body, { childList: true, subtree: true });

    // 구매 바가 데이터 로드 후 비동기로 렌더되는 경우를 대비해 내비게이션 직후 재측정
    const timers = [
      window.setTimeout(measure, 150),
      window.setTimeout(measure, 500),
      window.setTimeout(measure, 1200),
    ];

    return () => {
      window.removeEventListener('resize', scheduleMeasure);
      observer.disconnect();
      cancelAnimationFrame(rafId);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [pathname]);

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

  const attachRealtime = useCallback(
    (convId: string) => {
      realtimeUnsubRef.current?.();
      realtimeUnsubRef.current = subscribeToConversation(convId, (msg) => appendUnique([msg]));
    },
    [appendUnique],
  );

  // 라이브 채팅 초기화
  const initLive = useCallback(async () => {
    setLiveReady(false);
    setSendError(null);
    try {
      if (userId) {
        const conv = await getOrCreateUserConversation(userId, 'live');
        if (userEmail) {
          await supabase.from('chat_conversations').update({ guest_email: userEmail }).eq('id', conv.id);
        }
        setConversationId(conv.id);
        const msgs = await listUserMessages(conv.id);
        setMessages(msgs);
        scrollToBottom();
        attachRealtime(conv.id);
        setLiveReady(true);
        return () => realtimeUnsubRef.current?.();
      }
      const session = readGuestSession();
      guestSessionRef.current = session;
      if (session) {
        setConversationId(session.conversationId);
        const msgs = await guestFetch(session);
        setMessages(msgs);
        scrollToBottom();
        setLiveReady(true);
      }
      return undefined;
    } catch (err) {
      console.error('[chat] initLive failed', err);
      setSendError(t.sendFailed);
      return undefined;
    }
  }, [userId, userEmail, attachRealtime, scrollToBottom, t.sendFailed]);

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
      setLiveReady(false);
      // 게스트이면서 세션 없으면 시작 폼만, 있으면 초기화
      if (!userId && !readGuestSession()) {
        setMessages([]);
        setConversationId(null);
      } else {
        initLive().then((unsub) => {
          cleanup = unsub;
        });
      }
    } else {
      setView('offline');
      setLiveReady(false);
      setConversationId(null);
      setOffName('');
      setOffEmail(userEmail ?? '');
    }
    return () => {
      cleanup?.();
      realtimeUnsubRef.current?.();
      realtimeUnsubRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, online, settings, userId]);

  const handleSend = useCallback(async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      if (userId) {
        let convId = conversationId;
        if (!convId) {
          const conv = await getOrCreateUserConversation(userId, 'live');
          convId = conv.id;
          setConversationId(conv.id);
          attachRealtime(conv.id);
          setLiveReady(true);
        }
        const msg = await sendUserMessage(convId, userId, body);
        appendUnique([msg]);
      } else {
        const session = guestSessionRef.current;
        if (!session) return;
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
    } catch (err) {
      console.error('[chat] send failed', err);
      setSendError(t.sendFailed);
    } finally {
      setSending(false);
    }
  }, [input, sending, userId, conversationId, appendUnique, attachRealtime, t.sendFailed]);

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
      setLiveReady(true);
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

  const handleBotLive = useCallback(async () => {
    if (botRunning) return;
    const session = guestSessionRef.current;
    const email = userEmail ?? session?.email ?? null;
    if (!email && !userId) return;
    setBotRunning(true);
    try {
      await runPaymentBot({ email, userId, conversationId, guestToken: session?.token ?? null });
      // 봇 메시지는 Realtime(로그인) 또는 폴링(게스트)으로 도착. 게스트는 즉시 한 번 더 조회.
      if (!userId && session) {
        const last = messages.length ? messages[messages.length - 1].created_at : null;
        const fresh = await guestFetch(session, last);
        if (fresh.length) appendUnique(fresh);
      }
    } catch {
      /* noop */
    } finally {
      setBotRunning(false);
    }
  }, [botRunning, userEmail, userId, conversationId, messages, appendUnique]);

  const handleBotOffline = useCallback(async () => {
    const email = (offEmail || userEmail || '').trim();
    if (!email) {
      setOffBotMessage(t.payBotNeedEmail);
      return;
    }
    setBotRunning(true);
    setOffBotMessage(null);
    try {
      const r = await runPaymentBot({ email, userId });
      setOffBotMessage(r.message ?? r.error ?? null);
    } catch {
      /* noop */
    } finally {
      setBotRunning(false);
    }
  }, [offEmail, userEmail, userId, t]);

  if (!settings || !settings.enabled) return null;

  // 모바일: 장바구니·상품 상세에서는 가격/구매 UI를 가리지 않도록 숨김
  if (isMobile && isMobilePurchaseFlowPage(pathname)) return null;

  const hasGuestSession = !userId && !!guestSessionRef.current;
  const needsGuestStart = view === 'live' && !userId && !hasGuestSession;

  return (
    <div
      className="fixed right-5 z-[9999] flex flex-col items-end transition-[bottom] duration-200 ease-out"
      style={{ bottom: bottomOffset }}
    >
      {open && (
        <div className="mb-3 flex h-[520px] max-h-[calc(100vh-7rem)] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* 헤더 */}
          <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">{t.headerTitle}</p>
              <p className="flex items-center gap-1 text-xs text-indigo-100">
                <span className={`inline-block h-2 w-2 rounded-full ${online ? 'bg-green-400' : 'bg-gray-300'}`} />
                {online ? t.statusOnline : t.statusOffline}
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t.close} className="rounded p-1 hover:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 본문 */}
          <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
            {view === 'offline' && (
              <div className="flex flex-1 flex-col overflow-y-auto p-4">
                <div className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 whitespace-pre-wrap">
                  {offlineText}
                  {businessHoursHint && (
                    <p className="mt-1 text-xs text-amber-600">{businessHoursHint}</p>
                  )}
                </div>

                {/* 결제 자동복구 봇 (오프라인에서도 즉시 해결) */}
                <button
                  onClick={handleBotOffline}
                  disabled={botRunning}
                  className="mb-2 w-full rounded-lg border border-emerald-300 bg-emerald-50 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {botRunning ? t.payBotRunning : payBotLabel}
                </button>
                {offBotMessage && (
                  <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">{offBotMessage}</div>
                )}

                <div className="space-y-2">
                  <input
                    value={offName}
                    onChange={(e) => setOffName(e.target.value)}
                    placeholder={t.name}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={offEmail}
                    onChange={(e) => setOffEmail(e.target.value)}
                    placeholder={t.emailForReply}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={offCategory}
                    onChange={(e) => setOffCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="payment">{t.catPayment}</option>
                    <option value="download">{t.catDownload}</option>
                    <option value="refund">{t.catRefund}</option>
                    <option value="etc">{t.catEtc}</option>
                  </select>
                  <textarea
                    value={offMessage}
                    onChange={(e) => setOffMessage(e.target.value)}
                    placeholder={t.offlinePlaceholder}
                    rows={4}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleOfflineSubmit}
                    disabled={sending}
                    className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {t.offlineSubmit}
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
                <p className="text-sm font-semibold text-gray-800">{t.offlineSentTitle}</p>
                <p className="mt-1 text-xs text-gray-500">{t.offlineSentDesc}</p>
              </div>
            )}

            {view === 'live' && needsGuestStart && (
              <div className="flex flex-1 flex-col overflow-y-auto p-4">
                <div className="mb-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800 whitespace-pre-wrap">
                  {welcomeText}
                </div>
                <p className="mb-2 text-xs text-gray-500">{t.guestStartHint}</p>
                <div className="space-y-2">
                  <input
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder={t.name}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder={t.email}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleGuestStart}
                    disabled={sending}
                    className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {t.startChat}
                  </button>
                </div>
              </div>
            )}

            {view === 'live' && !needsGuestStart && (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  <div className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800 whitespace-pre-wrap">
                    {welcomeText}
                  </div>
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t border-gray-100 bg-white px-2 pt-2">
                  <button
                    onClick={handleBotLive}
                    disabled={botRunning}
                    className="mb-1 w-full rounded-lg border border-emerald-300 bg-emerald-50 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {botRunning ? t.payBotRunning : payBotLabel}
                  </button>
                  {messages.length === 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.quickReplies.map((q) => (
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
                </div>
                <div className="border-t border-gray-200 bg-white p-2">
                  {sendError && (
                    <p className="mb-1 text-xs text-red-600">{sendError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={t.inputPlaceholder}
                      disabled={!!userId && !liveReady && !conversationId}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-gray-50"
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !input.trim() || (!!userId && !liveReady && !conversationId)}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {t.send}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={t.ariaOpen}
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
