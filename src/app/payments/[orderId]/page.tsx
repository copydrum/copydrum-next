'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import OnePageCheckout, { type CheckoutItem } from '@/components/checkout/OnePageCheckout';

interface Order {
  id: string;
  order_number: string;
  user_id: string;
  total_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
}

interface OrderItem {
  id: string;
  drum_sheet_id: string;
  title: string;
  artist: string;
  price: number;
  thumbnail_url: string | null;
}

interface UserProfile {
  credits: number;
}

export default function PaymentPage() {
  const params = useParams();
  const router = useLocaleRouter();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // 주문 정보 및 사용자 포인트 로드
  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        alert('로그인이 필요합니다.');
        router.push('/auth/login');
        return;
      }

      try {
        // 주문 정보 조회
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .eq('user_id', user.id)
          .single();

        if (orderError || !orderData) {
          alert('주문을 찾을 수 없습니다.');
          router.push('/');
          return;
        }

        // 이미 완료된 주문인 경우
        if (orderData.status === 'completed') {
          alert('이미 결제가 완료된 주문입니다.');
          router.push('/purchases');
          return;
        }

        setOrder(orderData);

        // 주문 아이템 조회
        const { data: itemsData, error: itemsError } = await supabase
          .from('order_items')
          .select(`
            id,
            drum_sheet_id,
            price,
            drum_sheets:drum_sheet_id (
              title,
              artist,
              thumbnail_url
            )
          `)
          .eq('order_id', orderId);

        if (!itemsError && itemsData) {
          const formattedItems: CheckoutItem[] = itemsData.map((item: any) => ({
            id: item.id,
            sheet_id: item.drum_sheet_id,  // 실제 악보 ID (drum_sheets.id)
            title: item.drum_sheets?.title || '알 수 없음',
            artist: item.drum_sheets?.artist || '알 수 없음',
            price: item.price,
            thumbnail_url: item.drum_sheets?.thumbnail_url || null,
            quantity: 1,
          }));
          setCheckoutItems(formattedItems);
        }

        // 사용자 포인트 조회
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', user.id)
          .single();

        if (!profileError && profileData) {
          setUserProfile(profileData);
        }
      } catch (error) {
        console.error('[payment] 데이터 로드 오류:', error);
        alert('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, user]);

  // 결제 성공 처리
  const handlePaymentSuccess = (method: string, paymentId?: string, dbOrderId?: string) => {
    const finalOrderId = dbOrderId || orderId;
    router.push(`/payment/success?orderId=${finalOrderId}&method=${method}&paymentId=${paymentId || ''}`);
  };

  // 결제 실패 처리
  const handlePaymentError = (error: Error) => {
    console.error('[payment] Payment error:', error);
    alert('결제 중 오류가 발생했습니다: ' + error.message);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">주문 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!order || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">주문을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div>
      {/* 쇼핑 계속하기 버튼 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <i className="ri-arrow-left-line text-xl"></i>
            <span className="font-medium">{t('cartPage.continueShopping', '쇼핑 계속하기')}</span>
          </button>
        </div>
      </div>

      <OnePageCheckout
        items={checkoutItems}
        orderId={order.id}
        userId={user.id}
        userEmail={user.email || undefined}
        userName={user.user_metadata?.name || undefined}
        userPoints={userProfile?.credits || 0}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentError={handlePaymentError}
      />
    </div>
  );
}
