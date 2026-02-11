'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, getSiteCurrency, convertFromKrw } from '@/lib/currency';
import DodoPaymentForm from './DodoPaymentForm';
import PayPalPaymentButton from './PayPalPaymentButton';
import KakaoPayButton from './KakaoPayButton';
import PointsPaymentForm from './PointsPaymentForm';

export interface CheckoutItem {
  id: string;
  sheet_id: string;   // drum_sheets.id (실제 악보 ID)
  title: string;
  artist?: string;
  price: number;
  thumbnail_url?: string | null;
  quantity?: number;
}

export interface OnePageCheckoutProps {
  items: CheckoutItem[];
  orderId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  userPoints?: number;
  onPaymentSuccess: (method: string, paymentId?: string, dbOrderId?: string) => void;
  onPaymentError?: (error: Error) => void;
  onRemoveItem?: (itemId: string) => void;
}

export default function OnePageCheckout({
  items,
  orderId,
  userId,
  userEmail,
  userName,
  userPoints = 0,
  onPaymentSuccess,
  onPaymentError,
  onRemoveItem,
}: OnePageCheckoutProps) {
  const { t, i18n } = useTranslation();
  const [processing, setProcessing] = useState(false);
  const [showPointsForm, setShowPointsForm] = useState(false);

  // 통화 계산
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);

  // 총액 계산
  const totalAmount = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  const convertedAmount = convertFromKrw(totalAmount, currency, i18n.language);
  const formattedTotal = formatCurrency(convertedAmount, currency);

  // 포인트 사용 가능 여부
  const hasPoints = userPoints > 0;

  const handlePaymentStart = () => {
    setProcessing(true);
  };

  const handlePaymentComplete = (method: string, paymentId?: string, dbOrderId?: string) => {
    setProcessing(false);
    onPaymentSuccess(method, paymentId, dbOrderId);
  };

  const handlePaymentFailed = (error: Error) => {
    setProcessing(false);
    onPaymentError?.(error);
    alert(t('checkout.paymentError') + ': ' + error.message);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('checkout.title')}</h1>

        {/* PC: 2-column, Mobile: 1-column */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 왼쪽: 상품 리스트 (PC), 상단 (모바일) */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              {/* 헤더 */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-800">{t('checkout.orderSummary')}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {items.length} {t('checkout.items')}
                </p>
              </div>

              {/* 상품 목록 */}
              <div className="p-6 space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-4 pb-4 border-b last:border-b-0">
                    {/* 썸네일 */}
                    <div className="w-20 h-20 flex-shrink-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg overflow-hidden">
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <i className="ri-music-2-line text-2xl text-white"></i>
                        </div>
                      )}
                    </div>

                    {/* 상품 정보 */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{item.title}</h3>
                      {item.artist && (
                        <p className="text-sm text-gray-600 mt-1">{item.artist}</p>
                      )}
                      {item.quantity && item.quantity > 1 && (
                        <p className="text-sm text-gray-500 mt-1">Qty: {item.quantity}</p>
                      )}
                    </div>

                    {/* 가격 + 삭제 */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="font-bold text-gray-900">
                        {formatCurrency(convertFromKrw(item.price * (item.quantity || 1), currency, i18n.language), currency)}
                      </p>
                      {onRemoveItem && items.length > 1 && (
                        <button
                          onClick={() => onRemoveItem(item.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('checkout.removeItem', 'Remove')}
                        >
                          <i className="ri-close-line text-lg"></i>
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* 총액 */}
                <div className="pt-4 mt-4 border-t-2 border-gray-300">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-gray-900">{t('checkout.total')}</span>
                    <span className="text-2xl font-bold text-blue-600">{formattedTotal}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 오른쪽: 결제 수단 (PC), 하단 (모바일) */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden sticky top-4">
              {/* 헤더 + 총액 */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-800">{t('checkout.paymentMethod')}</h2>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600">{t('checkout.total')}</span>
                  <span className="text-xl font-bold text-blue-600">{formattedTotal}</span>
                </div>
              </div>

              <div className="p-6 space-y-3">
                {/* ━━━ 카드 결제 버튼 (즉시 실행) ━━━ */}
                <DodoPaymentForm
                  orderId={orderId}
                  amount={totalAmount}
                  orderName={items.length === 1 ? items[0].title : `${items.length} items`}
                  items={items}
                  userId={userId}
                  customerEmail={userEmail}
                  customerName={userName}
                  onSuccess={(paymentId, dbOrderId) => handlePaymentComplete('card', paymentId, dbOrderId)}
                  onError={handlePaymentFailed}
                  onProcessing={handlePaymentStart}
                  compact
                />

                {/* ━━━ PayPal 버튼 (즉시 실행) ━━━ */}
                <PayPalPaymentButton
                  orderId={orderId}
                  amount={totalAmount}
                  items={items}
                  onSuccess={(paymentId) => handlePaymentComplete('paypal', paymentId)}
                  onError={handlePaymentFailed}
                  onProcessing={handlePaymentStart}
                  compact
                />

                {/* ━━━ 카카오페이 버튼 (즉시 실행) ━━━ */}
                <KakaoPayButton
                  orderId={orderId}
                  amount={totalAmount}
                  orderName={items.length === 1 ? items[0].title : `${items.length} items`}
                  userEmail={userEmail}
                  onSuccess={(paymentId) => handlePaymentComplete('kakaopay', paymentId)}
                  onError={handlePaymentFailed}
                  onProcessing={handlePaymentStart}
                  compact
                />

                {/* ━━━ 포인트 결제 (아코디언) ━━━ */}
                {hasPoints && (
                  <div className="border-t border-gray-200 pt-3 mt-1">
                    <button
                      onClick={() => setShowPointsForm(!showPointsForm)}
                      disabled={processing}
                      className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl hover:border-yellow-400 hover:bg-yellow-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center group-hover:bg-yellow-200 transition-colors">
                          <i className="ri-coins-line text-xl text-yellow-600"></i>
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 text-sm">{t('checkout.usePoints')}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t('checkout.usePointsDesc', { balance: formatCurrency(userPoints, 'KRW') })}
                          </p>
                        </div>
                        <i className={`ri-arrow-${showPointsForm ? 'up' : 'down'}-s-line text-xl text-gray-400 group-hover:text-yellow-600 transition-colors`}></i>
                      </div>
                    </button>

                    {showPointsForm && (
                      <div className="mt-3">
                        <PointsPaymentForm
                          orderId={orderId}
                          amount={totalAmount}
                          availablePoints={userPoints}
                          userId={userId}
                          items={items.map((item) => ({
                            id: item.id,
                            sheet_id: item.sheet_id,
                            title: item.title,
                            price: item.price,
                          }))}
                          onSuccess={(dbOrderId) => handlePaymentComplete('points', undefined, dbOrderId)}
                          onError={handlePaymentFailed}
                          onProcessing={handlePaymentStart}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 보안 표시 */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                    <i className="ri-shield-check-line text-green-600"></i>
                    <span>{t('checkout.securePayment')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
