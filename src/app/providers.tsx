'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { useRouter, usePathname } from 'next/navigation';
import GlobalDialog from '@/components/ui/GlobalDialog';
import GuestCheckoutModal from '@/components/checkout/GuestCheckoutModal';
import { supabase, IS_PASSWORD_RECOVERY_CODE_LINK } from '@/lib/supabase';

// 비밀번호 재설정 메일의 토큰은 URL 해시(#access_token=...&type=recovery)로 전달된다.
// Supabase 클라이언트의 detectSessionInUrl 가 비동기로 해시를 소비/제거하기 때문에,
// useEffect 안에서 window.location.hash 를 읽으면 이미 비어있는 경우가 있다(특히 모바일).
// 모듈 평가 시점(동기 단계)에 해시를 미리 스냅샷해 두면, 비동기로 해시가 지워져도
// 재설정 페이지로 정확히 이동시킬 수 있다.
const CAPTURED_RECOVERY_HASH: string = (() => {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash || '';
  const isRecoveryToken = hash.includes('access_token') && hash.includes('type=recovery');
  const isRecoveryError =
    hash.includes('error') && (hash.includes('otp_expired') || hash.includes('access_denied'));
  return isRecoveryToken || isRecoveryError ? hash : '';
})();

function RecoveryRedirector() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // 모듈 로드 시 캡처한 해시를 우선 사용하고, 없으면 현재 URL 해시를 확인한다.
    const hash = CAPTURED_RECOVERY_HASH || window.location.hash;
    const search = window.location.search;

    const hasConfirmationUrl = search.includes('confirmation_url');
    const hasRecoveryToken = hash.includes('access_token') && hash.includes('type=recovery');
    const hasRecoveryError =
      hash.includes('error') && (hash.includes('otp_expired') || hash.includes('access_denied'));

    if (
      (hasRecoveryToken || hasRecoveryError) &&
      !pathname.includes('/auth/reset-password') &&
      !hasConfirmationUrl
    ) {
      window.location.replace('/auth/reset-password' + hash);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (pathname.includes('/auth/reset-password')) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('token_hash') && params.get('type') === 'recovery') {
      window.location.replace('/auth/reset-password' + window.location.search);
    }
  }, [pathname]);

  // 최초 진입 시 한 번만 판단한다. (이후 클라이언트 내비게이션에서 재실행되면 오인 이동 위험)
  useEffect(() => {
    if (!IS_PASSWORD_RECOVERY_CODE_LINK || window.location.pathname.includes('/auth/reset-password')) {
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      // 교환에 성공했을 때만 Supabase 가 URL 에서 code 를 지운다.
      // (결제 실패 리다이렉트 등 다른 용도의 ?code= 로 오인하지 않기 위함)
      const codeExchanged = !new URLSearchParams(window.location.search).has('code');
      if (data.session && codeExchanged) {
        window.location.replace('/auth/reset-password');
      }
    });
  }, []);

  return null;
}

export function Providers({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  );

  // 언어 설정은 LocaleSync 컴포넌트와 i18n 모듈 초기화에서 처리
  // Providers에서 중복 설정하면 LocaleSync가 설정한 올바른 언어를 'en'으로 덮어쓰는 문제 발생
  // (React useEffect는 자식→부모 순으로 실행되므로, Providers가 마지막에 실행됨)

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <RecoveryRedirector />
        <GlobalDialog />
        <GuestCheckoutModal />
        {children}
      </I18nextProvider>
    </QueryClientProvider>
  );
}
