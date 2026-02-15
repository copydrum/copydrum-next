'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileQuickNav from '@/components/mobile/MobileQuickNav';
import MobileMenuSidebar from '@/components/mobile/MobileMenuSidebar';
import MobileSearchOverlay from '@/components/mobile/MobileSearchOverlay';
import { recordPageView } from '@/lib/dashboardAnalytics';

/**
 * 페이지뷰 추적 컴포넌트
 * - 세션 ID를 localStorage에 저장하여 고유 방문자를 식별
 * - 페이지 전환 시 page_views 테이블에 기록
 * - 관리자 페이지는 추적하지 않음
 */
function PageViewTracker({ user }: { user: User | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionIdRef = useRef<string | null>(null);
  const previousPathRef = useRef<string>('');
  const isAdminPage = pathname.startsWith('/admin');

  // 세션 ID 생성 또는 가져오기
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SESSION_ID_KEY = 'copydrum_session_id';
    const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30분

    const stored = localStorage.getItem(SESSION_ID_KEY);
    if (stored) {
      try {
        const { sessionId, timestamp } = JSON.parse(stored);
        const now = Date.now();
        if (now - timestamp < SESSION_EXPIRY_MS) {
          sessionIdRef.current = sessionId;
          // 세션 타임스탬프 갱신 (활동 중이면 만료 연장)
          localStorage.setItem(SESSION_ID_KEY, JSON.stringify({ sessionId, timestamp: Date.now() }));
          return;
        }
      } catch {
        // 파싱 실패 시 새로 생성
      }
    }

    // UUID 생성
    let newSessionId: string;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      newSessionId = crypto.randomUUID();
    } else {
      // UUID v4 형식의 폴백 생성
      newSessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }

    sessionIdRef.current = newSessionId;
    localStorage.setItem(SESSION_ID_KEY, JSON.stringify({ sessionId: newSessionId, timestamp: Date.now() }));
  }, []);

  // 페이지뷰 기록
  useEffect(() => {
    if (isAdminPage) return;
    if (typeof window === 'undefined') return;

    const currentPath = pathname + (searchParams?.toString() ? '?' + searchParams.toString() : '');

    // 동일 경로 중복 기록 방지
    if (previousPathRef.current === currentPath && previousPathRef.current !== '') {
      return;
    }
    previousPathRef.current = currentPath;

    const logPageView = async () => {
      try {
        const pageUrl = window.location.href;
        const referrer = document.referrer || null;
        const userAgent = navigator.userAgent || null;
        const country = navigator.language || null;

        await recordPageView({
          user_id: user?.id ?? null,
          session_id: sessionIdRef.current,
          page_url: pageUrl,
          referrer,
          user_agent: userAgent,
          country,
        });
      } catch (error) {
        // 페이지뷰 기록 실패는 사용자 경험에 영향을 주지 않도록 조용히 처리
        console.warn('[PageView] 기록 실패:', error);
      }
    };

    // 약간의 딜레이를 두어 초기 렌더링에 영향을 주지 않도록 함
    const timeoutId = setTimeout(() => {
      void logPageView();
    }, 100);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [pathname, searchParams, user?.id, isAdminPage]);

  return null;
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const pathname = usePathname();
  const isAdminPage = pathname.startsWith('/admin');

  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (isMounted) {
          setUser(currentUser ?? null);
        }
      } catch (error) {
        console.error('사용자 정보 로드 오류:', error);
        if (isMounted) {
          setUser(null);
        }
      }
    };

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <>
      {/* 페이지뷰 추적 */}
      <Suspense fallback={null}>
        <PageViewTracker user={user} />
      </Suspense>

      {/* 모바일 헤더 (md 이하에서만 표시) */}
      {!isAdminPage && (
        <MobileHeader
          user={user}
          onMenuToggle={() => setIsMobileMenuOpen(true)}
          onSearchToggle={() => setIsMobileSearchOpen(true)}
        />
      )}

      {/* 모바일 퀵 네비게이션 (헤더 바로 아래, md 이하에서만 표시) */}
      {!isAdminPage && <MobileQuickNav />}

      {/* 모바일 사이드바 메뉴 */}
      <MobileMenuSidebar
        user={user}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* 모바일 검색 오버레이 */}
      <MobileSearchOverlay
        isOpen={isMobileSearchOpen}
        onClose={() => setIsMobileSearchOpen(false)}
      />

      {/* 메인 콘텐츠 - 모바일에서는 헤더(~180px) + 퀵네비(~52px) 높이만큼 패딩 */}
      <div className={`${isAdminPage ? '' : 'pt-[240px]'} md:pt-0`}>
        {children}
      </div>
    </>
  );
}
