'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import CustomOrderDetail from '@/components/customer/CustomOrderDetail';
import MainHeader from '@/components/common/MainHeader';

const CustomOrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useLocaleRouter();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  // 나만의 악보집 주문은 구매내역에서 관리한다
  const [isBook, setIsBook] = useState(false);

  useEffect(() => {
    if (!id) {
      router.replace('/custom-orders');
    }
  }, [id, router]);

  if (!id) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <MainHeader user={user} />

      <div>
        <main className="max-w-4xl mx-auto px-4 py-12">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isBook ? t('myBook.purchases.detailTitle') : t('customOrderDetail.title')}
              </h1>
              <p className="mt-1 break-keep text-sm text-gray-500">
                {isBook ? t('myBook.purchases.detailDescription') : t('customOrderDetail.description')}
              </p>
            </div>
            <button
              onClick={() => router.push(isBook ? '/purchases' : '/custom-orders')}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              <i className="ri-arrow-left-line"></i>
              {isBook ? t('myBook.purchases.backToPurchases') : t('customOrderDetail.backToList')}
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <CustomOrderDetail orderId={id} key={id} onBookOrderChange={setIsBook} />
          </div>

          {!user && (
            <div className="mt-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
              {t('customOrderDetail.loginRequired')}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default CustomOrderDetailPage;
