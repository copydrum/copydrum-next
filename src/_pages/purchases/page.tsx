'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import MainHeader from '../../components/common/MainHeader';
import PurchaseHistoryContent from '../../components/purchase/PurchaseHistoryContent';
import { useTranslation } from 'react-i18next';
import MobileHeader from '../../components/mobile/MobileHeader';

export default function PurchasesPage() {
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!currentUser) {
          router.push('/auth/login');
          return;
        }

        setUser(currentUser);
      } catch (error) {
        console.error('인증 확인 오류:', error);
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.push('/auth/login');
      } else {
        setUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <MainHeader user={user} />
        <div className="py-16 text-center text-gray-500">
          <i className="ri-loader-4-line text-4xl animate-spin text-blue-500 mb-4" />
          <p className="font-medium">{t('purchaseHistory.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <MainHeader user={user} />
      <MobileHeader user={user} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('purchaseHistory.title')}</h1>
          <p className="text-sm text-gray-500">{t('purchaseHistory.description')}</p>
        </div>
        <PurchaseHistoryContent user={user} />
      </div>
    </div>
  );
}





















