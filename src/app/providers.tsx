'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { useRouter, usePathname } from 'next/navigation';
import GlobalDialog from '@/components/ui/GlobalDialog';

function RecoveryRedirector() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const hash = window.location.hash;
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
        {children}
      </I18nextProvider>
    </QueryClientProvider>
  );
}
