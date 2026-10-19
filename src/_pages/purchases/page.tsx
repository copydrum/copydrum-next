'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import PurchaseOrderList from '../../components/purchase/PurchaseOrderList';
import { useTranslation } from 'react-i18next';
import MyBookPurchaseList from '../../components/myBook/MyBookPurchaseList';

export default function PurchasesPage() {
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 로그인 후 이 페이지로 돌아오도록 현재 경로를 넘긴다
    const goLogin = () => router.push(`/auth/login?from=${encodeURIComponent(window.location.pathname)}`);

    const checkAuth = async () => {
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!currentUser) {
          goLogin();
          return;
        }

        setUser(currentUser);
      } catch (error) {
        console.error('인증 확인 오류:', error);
        goLogin();
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        goLogin();
      } else {
        setUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-5 sm:px-6 md:py-10 lg:px-8">
        <h1 className="text-2xl font-extrabold text-gray-900 md:text-3xl">{t('purchaseHistory.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('purchaseHistory.description')}</p>

        <div className="mt-5 space-y-4 md:mt-6">
          {loading || !user ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <i className="ri-loader-4-line mb-3 animate-spin text-3xl text-blue-500" />
              <p className="text-sm font-medium">{t('purchaseHistory.loading')}</p>
            </div>
          ) : (
            <>
              <MyBookPurchaseList userId={user.id} />
              <PurchaseOrderList user={user} title={t('purchaseHistory.listTitle')} />
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
