'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { removeLocaleFromPathname } from '@/lib/localeUrl';
import { isChatOnline } from '@/lib/chat/online';
import { OPEN_CHAT_EVENT } from '@/lib/chat/openChat';
import { getChatStrings } from '@/lib/chat/strings';
import {
  getChatWelcomeMessage,
  getChatOfflineMessage,
  getBusinessHoursHint,
} from '@/lib/chat/messages';
import type { ChatSettings } from '@/lib/settings';
import {
  loadChatSettings,
  findUserConversation,
  getOrCreateUserConversation,
  listUserMessages,
  sendUserMessage,
  markUserConversationSeen,
  getUserUnreadCount,
  subscribeToConversation,
  readGuestSession,
  writeGuestSession,
  guestStart,
  guestSetEmail,
  guestSend,
  guestFetch,
  guestUnreadCount,
  uploadChatImage,
  MAX_ATTACHMENT_BYTES,
  type GuestSession,
} from '@/lib/chat/client';
import type { ChatMessage } from '@/lib/chat/types';

const FLOATING_GAP = 12; // 구매 바와 채팅 버튼 사이 여백(px)
const DEFAULT_BOTTOM = 20; // bottom-5 기본 위치(px)
const LOCAL_PREFIX = 'local-';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEASER_STORAGE_KEY = 'cd_chat_teaser_dismissed_v1';
const TEASER_DELAY_MS = 4000;
const TEASER_MOBILE_AUTO_HIDE_MS = 6000;
const GUEST_POLL_MS = 3500;
const UNREAD_POLL_MS = 30_000;
const SEEN_HEARTBEAT_MS = 30_000;

type EmailCardMode = 'required' | 'optional' | null;

function isMobilePurchaseFlowPage(pathname: string): boolean {
  const path = removeLocaleFromPathname(pathname);
  if (path === '/cart' || path.startsWith('/cart/')) return true;
  if (path.startsWith('/drum-sheet/')) return true;
  if (path.startsWith('/sheet-detail/')) return true;
  return false;
}

function localMessage(conversationId: string, body: string, attachmentUrl: string | null = null): ChatMessage {
  return {
    id: `${LOCAL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conversation_id: conversationId,
    sender_type: 'user',
    sender_id: null,
    body,
    attachment_url: attachmentUrl,
    read_at: null,
    created_at: new Date().toISOString(),
  };
}

function lastServerTimestamp(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].id.startsWith(LOCAL_PREFIX)) return messages[i].created_at;
  }
  return null;
}

interface ChatWidgetProps {
  /** 모바일 메뉴 등 오버레이가 열려 있을 때 플로팅 버튼을 숨긴다 */
  hideLauncher?: boolean;
  /** 모바일에서 아래로 스크롤하는 동안 플로팅 버튼을 숨긴다 */
  hideLauncherOnMobile?: boolean;
}

export default function ChatWidget({ hideLauncher = false, hideLauncherOnMobile = false }: ChatWidgetProps = {}) {
  const { i18n } = useTranslation();
  const pathname = usePathname();
  const lang = i18n.language;
  const t = useMemo(() => getChatStrings(lang), [lang]);
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const welcomeText = useMemo(() => getChatWelcomeMessage(lang, settings), [lang, settings]);
  const offlineText = useMemo(() => getChatOfflineMessage(lang, settings), [lang, settings]);
  const businessHoursHint = useMemo(() => getBusinessHoursHint(lang, settings), [lang, settings]);
  const timeFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' });
    }
  }, [lang]);

  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  // 모바일 구매 바와 겹치지 않도록 동적으로 계산되는 하단 오프셋(px)
  const [bottomOffset, setBottomOffset] = useState(DEFAULT_BOTTOM);
  const [online, setOnline] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [showTeaser, setShowTeaser] = useState(false);
  const guestSessionRef = useRef<GuestSession | null>(null);

  // 비회원: 이메일 요청 카드 ('required' = 대화 생성 전, 'optional' = 대화 생성 후 알림용)
  const pendingRef = useRef<string[]>([]);
  const [emailCard, setEmailCard] = useState<EmailCardMode>(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSaved, setEmailSaved] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

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

  // 답변 알림 이메일의 "채팅 이어가기" 링크: ?chat=open&c=<대화ID>&t=<게스트 토큰>
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('chat') !== 'open') return;
    const c = params.get('c');
    const token = params.get('t');
    if (c && token) {
      const existing = readGuestSession();
      if (!existing || existing.conversationId !== c) {
        writeGuestSession({ token, conversationId: c, name: '', email: '', emailAsked: true });
      }
      guestSessionRef.current = readGuestSession();
    }
    setOpen(true);
    ['chat', 'c', 't'].forEach((k) => params.delete(k));
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  }, []);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_CHAT_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, handleOpen);
  }, []);

  // 로그아웃·계정 전환 시 이전 대화 정리
  useEffect(() => {
    setMessages([]);
    setConversationId(null);
    setUnread(0);
    setEmailCard(null);
    pendingRef.current = [];
  }, [userId]);

  // 1분마다 온라인 상태 재계산(운영시간 경계 반영)
  useEffect(() => {
    if (!settings) return;
    const timer = setInterval(() => setOnline(isChatOnline(settings)), 60_000);
    return () => clearInterval(timer);
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

  // 모바일 전체 화면으로 열렸을 때 배경 스크롤 잠금
  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const isPurchasePage = isMobile && isMobilePurchaseFlowPage(pathname);

  // 첫 방문 안내 말풍선 (닫거나 채팅을 열면 다시 보이지 않음)
  useEffect(() => {
    if (!settings?.enabled || open || isPurchasePage) {
      setShowTeaser(false);
      return;
    }
    try {
      if (window.localStorage.getItem(TEASER_STORAGE_KEY)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => setShowTeaser(true), TEASER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [settings, open, isPurchasePage]);

  const dismissTeaser = useCallback(() => {
    setShowTeaser(false);
    try {
      window.localStorage.setItem(TEASER_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  // 모바일에서는 말풍선이 본문 카드를 가리므로 잠시 보여준 뒤 자동으로 닫음
  useEffect(() => {
    if (!showTeaser || !isMobile) return;
    const timer = window.setTimeout(dismissTeaser, TEASER_MOBILE_AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [showTeaser, isMobile, dismissTeaser]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, []);

  const appendUnique = useCallback((incoming: ChatMessage[]) => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      let merged = [...prev];
      for (const m of incoming) {
        if (seen.has(m.id)) continue;
        // 서버에서 돌아온 내 메시지는 화면에 먼저 그려둔 임시 메시지를 대체
        if (m.sender_type === 'user' && !m.id.startsWith(LOCAL_PREFIX)) {
          const localIdx = merged.findIndex(
            (x) =>
              x.id.startsWith(LOCAL_PREFIX) &&
              x.body === m.body &&
              (x.attachment_url ?? null) === (m.attachment_url ?? null),
          );
          if (localIdx >= 0) merged = merged.filter((_, i) => i !== localIdx);
        }
        merged.push(m);
      }
      merged.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      return merged;
    });
    scrollToBottom();
  }, [scrollToBottom]);

  // 회원: 닫혀 있어도 진행 중인 대화의 미읽음 수 확인
  useEffect(() => {
    if (!settings?.enabled || !userId) return;
    let cancelled = false;
    getUserUnreadCount(userId)
      .then(({ conversationId: convId, unread: count }) => {
        if (cancelled || !convId) return;
        setConversationId((prev) => prev ?? convId);
        if (!openRef.current) setUnread(count);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings, userId]);

  // 회원: 대화 Realtime 구독 (열림/닫힘 상관없이 유지 → 닫혀 있으면 배지 증가)
  useEffect(() => {
    if (!userId || !conversationId) return;
    return subscribeToConversation(conversationId, (msg) => {
      if (openRef.current) {
        appendUnique([msg]);
        if (msg.sender_type === 'admin') markUserConversationSeen(conversationId).catch(() => {});
      } else if (msg.sender_type === 'admin') {
        setUnread((n) => n + 1);
      }
    });
  }, [userId, conversationId, appendUnique]);

  // 게스트: 닫혀 있을 때 미읽음 답변 확인 (화면이 보일 때만)
  useEffect(() => {
    if (!settings?.enabled || userId || open) return;
    const check = async () => {
      const session = guestSessionRef.current ?? readGuestSession();
      if (!session || document.hidden) return;
      try {
        setUnread(await guestUnreadCount(session));
      } catch {
        /* 엣지 함수 배포 전이면 무시 */
      }
    };
    check();
    const timer = setInterval(check, UNREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [settings, userId, open]);

  // 위젯을 열면 기존 대화 불러오기 (대화는 첫 메시지를 보낼 때 생성)
  useEffect(() => {
    if (!open || !settings) return;
    let cancelled = false;
    setSendError(null);
    setUnread(0);
    dismissTeaser();

    (async () => {
      try {
        if (userId) {
          const convId = conversationIdRef.current ?? (await findUserConversation(userId))?.id ?? null;
          if (cancelled || !convId) return;
          setConversationId(convId);
          const msgs = await listUserMessages(convId);
          if (cancelled) return;
          setMessages(msgs);
          scrollToBottom();
          markUserConversationSeen(convId).catch(() => {});
          return;
        }
        const session = readGuestSession();
        guestSessionRef.current = session;
        if (session) {
          setConversationId(session.conversationId);
          const msgs = await guestFetch(session);
          if (cancelled) return;
          setMessages(msgs);
          scrollToBottom();
        }
      } catch (err) {
        console.error('[chat] load failed', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, settings, userId, scrollToBottom, dismissTeaser]);

  // 회원: 열려 있는 동안 "보고 있음" 표시 (답변 이메일 중복 방지)
  useEffect(() => {
    if (!open || !userId || !conversationId) return;
    const timer = setInterval(() => {
      if (!document.hidden) markUserConversationSeen(conversationId).catch(() => {});
    }, SEEN_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [open, userId, conversationId]);

  // 게스트: 열려 있는 동안 새 메시지 폴링 (서버에서 읽음·보고 있음 처리)
  useEffect(() => {
    if (!open || userId || !conversationId) return;
    const timer = setInterval(async () => {
      const session = guestSessionRef.current;
      if (!session || document.hidden) return;
      try {
        const fresh = await guestFetch(session, lastServerTimestamp(messagesRef.current));
        if (fresh.length) appendUnique(fresh);
      } catch {
        /* ignore */
      }
    }, GUEST_POLL_MS);
    return () => clearInterval(timer);
  }, [open, userId, conversationId, appendUnique]);

  // 입력창 높이 자동 조절 (최대 약 4줄)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [input, open]);

  const ensureMemberConversation = useCallback(async (): Promise<string> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const conv = await getOrCreateUserConversation(userId!, 'live', { email: userEmail, locale: lang });
    setConversationId(conv.id);
    conversationIdRef.current = conv.id;
    return conv.id;
  }, [userId, userEmail, lang]);

  /** 비회원 첫 메시지: 이메일 없이 대화를 만들고, 알림용 이메일은 그다음에 선택으로 받음 */
  const startGuestConversation = useCallback(
    async (firstMessage: string) => {
      pendingRef.current.push(firstMessage);
      setMessages((prev) => [...prev, localMessage('pending', firstMessage)]);
      scrollToBottom();
      if (pendingRef.current.length > 1) return; // 이미 이메일 입력 대기 중
      try {
        const session = await guestStart({ firstMessage, locale: lang });
        guestSessionRef.current = session;
        pendingRef.current = [];
        setConversationId(session.conversationId);
        const msgs = await guestFetch(session);
        setMessages(msgs);
        scrollToBottom();
        setEmailCard('optional');
      } catch {
        // 이메일 없이 시작할 수 없는 서버(구버전)면 이메일을 먼저 받음
        setEmailCard('required');
      }
    },
    [lang, scrollToBottom],
  );

  const sendText = useCallback(
    async (raw: string) => {
      const body = raw.trim();
      if (!body || sending) return;
      setSendError(null);
      setInput('');

      if (!userId && !guestSessionRef.current) {
        setSending(true);
        try {
          await startGuestConversation(body);
        } finally {
          setSending(false);
        }
        return;
      }

      setSending(true);
      try {
        if (userId) {
          const convId = await ensureMemberConversation();
          const msg = await sendUserMessage(convId, userId, body);
          appendUnique([msg]);
        } else {
          const session = guestSessionRef.current!;
          await guestSend(session, body);
          appendUnique([localMessage(session.conversationId, body)]);
        }
      } catch (err) {
        console.error('[chat] send failed', err);
        setInput(body);
        setSendError(t.sendFailed);
      } finally {
        setSending(false);
      }
    },
    [sending, userId, startGuestConversation, ensureMemberConversation, appendUnique, t.sendFailed],
  );

  const handleEmailSubmit = useCallback(async () => {
    const email = emailInput.trim();
    if (!EMAIL_RE.test(email)) {
      setEmailError(t.emailInvalid);
      return;
    }
    setEmailError(null);
    setSending(true);
    try {
      if (emailCard === 'optional' && guestSessionRef.current) {
        guestSessionRef.current = await guestSetEmail(guestSessionRef.current, email);
      } else {
        const [first, ...rest] = pendingRef.current;
        if (!first) return;
        const session = await guestStart({ firstMessage: first, email, locale: lang });
        for (const body of rest) {
          await guestSend(session, body);
        }
        guestSessionRef.current = session;
        pendingRef.current = [];
        setConversationId(session.conversationId);
        const msgs = await guestFetch(session);
        setMessages(msgs);
        scrollToBottom();
      }
      setEmailCard(null);
      setEmailSaved(true);
    } catch (err) {
      console.error('[chat] email submit failed', err);
      setEmailError(t.startFailed);
    } finally {
      setSending(false);
    }
  }, [emailInput, emailCard, lang, scrollToBottom, t.emailInvalid, t.startFailed]);

  const handleEmailSkip = useCallback(() => {
    const session = guestSessionRef.current;
    if (session) {
      const next = { ...session, emailAsked: true };
      writeGuestSession(next);
      guestSessionRef.current = next;
    }
    setEmailCard(null);
  }, []);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setSendError(null);
      if (!file.type.startsWith('image/')) return;
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setSendError(t.attachTooLarge);
        return;
      }
      setUploading(true);
      try {
        if (userId) {
          const convId = await ensureMemberConversation();
          const url = await uploadChatImage(file, convId, null);
          const msg = await sendUserMessage(convId, userId, '', url);
          appendUnique([msg]);
        } else {
          const session = guestSessionRef.current;
          if (!session) return;
          const url = await uploadChatImage(file, session.conversationId, session);
          await guestSend(session, '', url);
          appendUnique([localMessage(session.conversationId, '', url)]);
        }
      } catch (err) {
        console.error('[chat] attach failed', err);
        setSendError(t.attachFailed);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [userId, ensureMemberConversation, appendUnique, t.attachTooLarge, t.attachFailed],
  );

  if (!settings || !settings.enabled) return null;

  const greeting = online ? welcomeText : offlineText;
  const showQuickReplies = messages.length === 0 && !emailCard;
  const statusLine = online
    ? t.statusOnline
    : businessHoursHint
      ? `${t.statusOffline} · ${businessHoursHint}`
      : t.statusOffline;
  const typicalReplyText =
    settings.typicalReply && settings.typicalReply !== 'none' ? t.typicalReply[settings.typicalReply] : null;
  const canAttach = !!userId || !!conversationId;

  const panelClass = isMobile
    ? 'fixed inset-0 z-[9999] flex h-[100dvh] w-full flex-col overflow-hidden bg-white'
    : 'mb-3 flex h-[600px] max-h-[calc(100vh-7rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl';

  const launcherHidden = !open && (hideLauncher || (isMobile && hideLauncherOnMobile));

  return (
    <div
      className={`fixed right-5 z-[9999] flex flex-col items-end transition-[bottom,opacity,transform] duration-200 ease-out ${
        launcherHidden ? 'pointer-events-none translate-y-4 opacity-0' : ''
      }`}
      style={{ bottom: bottomOffset }}
      aria-hidden={launcherHidden || undefined}
    >
      {open && (
        <div className={panelClass} role="dialog" aria-label={t.headerTitle}>
          {/* 헤더 */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3.5 text-white">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white/15">
              <i className="ri-customer-service-2-fill text-xl" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold">{t.headerTitle}</p>
              <p className="flex items-start gap-1.5 text-xs leading-4 text-indigo-100">
                <span
                  className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${online ? 'bg-emerald-400' : 'bg-gray-300'}`}
                />
                <span>{statusLine}</span>
              </p>
              {typicalReplyText && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-indigo-200">
                  <i className="ri-time-line" />
                  {typicalReplyText}
                </p>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label={t.close}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full hover:bg-white/15"
            >
              <i className={`${isMobile ? 'ri-arrow-down-s-line text-2xl' : 'ri-close-line text-xl'}`} />
            </button>
          </div>

          {/* 대화 */}
          <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-4">
            <AgentBubble name={t.agentName}>{greeting}</AgentBubble>

            {showQuickReplies && (
              <div className="pl-10">
                <p className="mb-1.5 text-xs text-gray-400">{t.quickRepliesTitle}</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.quickReplies.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendText(q)}
                      disabled={sending}
                      className="rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-sm text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                agentName={t.agentName}
                imageAlt={t.imageAlt}
                time={timeFormatter.format(new Date(m.created_at))}
              />
            ))}

            {emailCard && (
              <AgentBubble name={t.agentName}>
                <p>{emailCard === 'required' ? t.emailAsk : t.emailAskOptional}</p>
                <form
                  className="mt-2 flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleEmailSubmit();
                  }}
                >
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setEmailError(null);
                    }}
                    placeholder={t.emailPlaceholder}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    className="flex-shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {t.emailConfirm}
                  </button>
                </form>
                {emailError ? (
                  <p className="mt-1.5 text-xs text-red-600">{emailError}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-gray-400">{t.emailAskHint}</p>
                )}
                {emailCard === 'optional' && (
                  <button
                    type="button"
                    onClick={handleEmailSkip}
                    className="mt-1 text-xs text-gray-500 underline-offset-2 hover:underline"
                  >
                    {t.emailSkip}
                  </button>
                )}
              </AgentBubble>
            )}

            {emailSaved && !emailCard && (
              <p className="text-center text-xs text-gray-400">{t.emailSaved}</p>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 입력 */}
          <div className="border-t border-gray-200 bg-white px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            {sendError && <p className="mb-1.5 px-1 text-xs text-red-600">{sendError}</p>}
            {uploading && <p className="mb-1.5 px-1 text-xs text-gray-500">{t.uploading}</p>}
            <div className="flex items-end gap-1 rounded-2xl border border-gray-300 bg-white py-1.5 pl-1.5 pr-1.5 focus-within:border-indigo-500">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canAttach || uploading}
                aria-label={t.attachImage}
                title={t.attachImage}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-indigo-600 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <i className="ri-image-add-line text-lg" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    sendText(input);
                  }
                }}
                placeholder={t.inputPlaceholder}
                className="max-h-28 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-5 text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              <button
                onClick={() => sendText(input)}
                disabled={sending || !input.trim()}
                aria-label={t.send}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400"
              >
                <i className="ri-send-plane-2-fill text-base" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 첫 방문 안내 말풍선 */}
      {showTeaser && !open && (
        <div
          className={`relative mb-3 rounded-2xl rounded-br-md border border-gray-200 bg-white text-gray-800 shadow-lg ${
            isMobile ? 'max-w-[200px] py-2 pl-3 pr-7 text-xs' : 'max-w-[240px] py-3 pl-4 pr-8 text-sm'
          }`}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-left leading-snug"
          >
            {t.teaser}
          </button>
          <button
            type="button"
            onClick={dismissTeaser}
            aria-label={t.close}
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <i className="ri-close-line" />
          </button>
        </div>
      )}

      {/* 플로팅 버튼 (모바일 전체 화면일 때는 헤더의 닫기 버튼 사용) */}
      {!(open && isMobile) && (
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={unread > 0 ? `${t.ariaOpen} (${unread})` : t.ariaOpen}
          className={`relative flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg transition hover:scale-105 ${
            isPurchasePage ? 'h-12 w-12' : open || isMobile ? 'h-14 w-14' : 'h-14 px-5'
          }`}
        >
          {open ? (
            <i className="ri-close-line text-2xl" />
          ) : (
            <>
              <i className={`ri-chat-smile-3-fill ${isPurchasePage ? 'text-xl' : 'text-2xl'}`} />
              {!isMobile && <span className="text-[15px] font-semibold">{t.launcherLabel}</span>}
            </>
          )}
          {unread > 0 && !open && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[11px] font-bold leading-none text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    </div>
  );
}

function AgentAvatar() {
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
      <i className="ri-customer-service-2-fill text-sm" />
    </div>
  );
}

function AgentBubble({ name, time, children }: { name: string; time?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <AgentAvatar />
      <div className="min-w-0 max-w-[80%]">
        <p className="mb-1 text-xs font-medium text-gray-500">{name}</p>
        <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-gray-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-gray-800 shadow-sm">
          {children}
        </div>
        {time && <p className="mt-1 text-[11px] text-gray-400">{time}</p>}
      </div>
    </div>
  );
}

function Attachment({ url, alt }: { url: string; alt: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className="max-h-60 w-auto max-w-full rounded-xl border border-gray-200 object-contain" />
    </a>
  );
}

function MessageBubble({
  message,
  agentName,
  imageAlt,
  time,
}: {
  message: ChatMessage;
  agentName: string;
  imageAlt: string;
  time: string;
}) {
  if (message.sender_type === 'system' || message.sender_type === 'bot') {
    return (
      <div className="mx-auto max-w-[90%] rounded-lg bg-gray-100 px-3 py-2 text-center text-xs text-gray-500 whitespace-pre-wrap">
        {message.body}
      </div>
    );
  }
  if (message.sender_type === 'admin') {
    return (
      <AgentBubble name={agentName} time={time}>
        {message.attachment_url && <Attachment url={message.attachment_url} alt={imageAlt} />}
        {message.body}
      </AgentBubble>
    );
  }
  return (
    <div className="flex flex-col items-end">
      {message.attachment_url && (
        <div className="mb-1 max-w-[80%]">
          <Attachment url={message.attachment_url} alt={imageAlt} />
        </div>
      )}
      {message.body && (
        <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-indigo-600 px-3.5 py-2.5 text-sm leading-relaxed text-white">
          {message.body}
        </div>
      )}
      <p className="mt-1 text-[11px] text-gray-400">{time}</p>
    </div>
  );
}
