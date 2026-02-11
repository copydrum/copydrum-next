'use client';

import { useState, useEffect, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileMenuSidebar from '@/components/mobile/MobileMenuSidebar';
import MobileSearchOverlay from '@/components/mobile/MobileSearchOverlay';

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
      {/* 모바일 헤더 (md 이하에서만 표시) */}
      {!isAdminPage && (
        <MobileHeader
          user={user}
          onMenuToggle={() => setIsMobileMenuOpen(true)}
          onSearchToggle={() => setIsMobileSearchOpen(true)}
        />
      )}

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

      {/* 메인 콘텐츠 - 모바일에서는 헤더 높이만큼 패딩 (헤더 약 176px) */}
      <div className={`${isAdminPage ? '' : 'pt-[180px]'} md:pt-0`}>
        {children}
      </div>
    </>
  );
}
