'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import PaymentModal from '@/components/payments/PaymentModal';

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
  const router = useRouter();
  const { user } = useAuthStore();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // 주문 정보 및 사용자 포인트 로드
  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        alert('로그인이 필요합니다.');
        router.push('/login');
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
          const formattedItems = itemsData.map((item: any) => ({
            id: item.id,
            drum_sheet_id: item.drum_sheet_id,
            title: item.drum_sheets?.title || '알 수 없음',
            artist: item.drum_sheets?.artist || '알 수 없음',
            price: item.price,
            thumbnail_url: item.drum_sheets?.thumbnail_url || null,
          }));
          setOrderItems(formattedItems);
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
  }, [orderId, user, router]);

  // 결제 성공 처리
  const handlePaymentSuccess = (method: string) => {
    router.push(`/payment/success?orderId=${orderId}&method=${method}`);
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
    <>
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* 주문 정보 */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">주문 결제</h1>
            <div className="space-y-2 text-sm text-gray-600">
              <p>
                주문번호: <span className="font-medium text-gray-900">{order.order_number}</span>
              </p>
              <p>
                주문일시:{' '}
                <span className="font-medium text-gray-900">
                  {new Date(order.created_at).toLocaleString('ko-KR')}
                </span>
              </p>
            </div>
          </div>

          {/* 주문 아이템 목록 */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">주문 상품</h2>
            <div className="space-y-4">
              {orderItems.map((item) => (
                <div key={item.id} className="flex items-center gap-4 pb-4 border-b last:border-b-0">
                  {item.thumbnail_url && (
                    <img
                      src={item.thumbnail_url}
                      alt={item.title}
                      className="w-16 h-16 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{item.title}</p>
                    <p className="text-sm text-gray-600">{item.artist}</p>
                  </div>
                  <p className="font-semibold text-gray-900">{item.price.toLocaleString()}원</p>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t flex justify-between items-center">
              <span className="text-lg font-semibold text-gray-900">총 결제금액</span>
              <span className="text-2xl font-bold text-blue-600">
                {order.total_amount.toLocaleString()}원
              </span>
            </div>
          </div>

          {/* 결제하기 버튼 */}
          <button
            onClick={() => setModalOpen(true)}
            className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
          >
            <i className="ri-secure-payment-line text-2xl"></i>
            {order.total_amount.toLocaleString()}원 결제하기
          </button>

          {/* 안내 */}
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>안전한 결제를 위해 SSL 보안 연결을 사용합니다</p>
          </div>
        </div>
      </div>

      {/* 결제 모달 */}
      <PaymentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        orderId={order.id}
        amount={order.total_amount}
        orderName={`악보 구매 (${orderItems.length}개)`}
        userEmail={user.email || undefined}
        userName={user.user_metadata?.name || undefined}
        userId={user.id}
        userCredits={userProfile?.credits || 0}
        onSuccess={handlePaymentSuccess}
      />
    </>
  );
}

