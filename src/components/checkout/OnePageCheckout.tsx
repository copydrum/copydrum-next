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

              <div className="p-6 space-y-5">

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* 🔵 섹션 1: 카드 결제 (메인 결제 수단)        */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <div className="space-y-3">
                  {/* 섹션 라벨 */}
                  <div className="flex items-center gap-2">
                    <i className="ri-bank-card-line text-lg text-gray-700"></i>
                    <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                      {t('checkout.creditDebit', 'Credit / Debit Card')}
                    </span>
                  </div>

                  {/* 카드 결제 버튼 */}
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

                  {/* 카카오페이 버튼 */}
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

                  {/* 카드사 로고 */}
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {/* Visa */}
                    <div className="h-7 px-2 bg-white border border-gray-200 rounded flex items-center justify-center" title="Visa">
                      <svg viewBox="0 0 48 16" className="h-3.5" aria-label="Visa">
                        <path fill="#1A1F71" d="M19.4 1l-3.8 14h-3.1L16.3 1h3.1zm15.2 9l1.6-4.5.9 4.5h-2.5zm3.5 5h2.9L38.3 1h-2.7c-.6 0-1.1.4-1.3.9L29.8 15h3.1l.6-1.7h3.8l.3 1.7h.5zm-9.5-4.6c0-3.7 5.1-3.9 5.1-5.5 0-.5-.5-1-1.5-1.1-1.5-.1-2.8.4-3.6.9l-.6-3c.9-.4 2.4-.7 4-.7 3.4 0 5.7 1.7 5.7 4.2 0 5.7-7.9 6-7.9 8.6 0 .5.5 1.1 1.6 1.2 1.3.1 2.5-.3 3.2-.7l.7 2.8c-.8.4-2.2.7-3.7.7-3.6 0-5.9-1.9-5.9-4.4h1.9zM14.8 1L9.6 15H6.4L3.5 4c-.2-.7-.3-1-.9-1.3C1.7 2.3.4 1.9 0 1.7l.1-.7h5c.7 0 1.3.5 1.4 1.2l1.2 6.7L11.1 1h3.7z"/>
                      </svg>
                    </div>
                    {/* Mastercard */}
                    <div className="h-7 px-1.5 bg-white border border-gray-200 rounded flex items-center justify-center" title="Mastercard">
                      <svg viewBox="0 0 24 16" className="h-4" aria-label="Mastercard">
                        <circle cx="8.5" cy="8" r="7" fill="#EB001B"/>
                        <circle cx="15.5" cy="8" r="7" fill="#F79E1B"/>
                        <path fill="#FF5F00" d="M12 2.4a7 7 0 0 0-2.6 5.6A7 7 0 0 0 12 13.6a7 7 0 0 0 2.6-5.6A7 7 0 0 0 12 2.4z"/>
                      </svg>
                    </div>
                    {/* Amex */}
                    <div className="h-7 px-2 bg-[#006FCF] border border-[#006FCF] rounded flex items-center justify-center" title="American Express">
                      <span className="text-[9px] font-black text-white tracking-tight leading-none">AMEX</span>
                    </div>
                    {/* Discover */}
                    <div className="h-7 px-2 bg-white border border-gray-200 rounded flex items-center justify-center" title="Discover">
                      <span className="text-[8px] font-bold text-[#FF6000] tracking-tight leading-none">DISCOVER</span>
                    </div>
                    {/* JCB */}
                    <div className="h-7 px-2 bg-gradient-to-r from-[#0B7BC1] to-[#ED1C24] border border-gray-200 rounded flex items-center justify-center" title="JCB">
                      <span className="text-[9px] font-black text-white tracking-tight leading-none">JCB</span>
                    </div>
                  </div>
                </div>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* ── OR 구분선 ──                              */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-gray-300"></div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest select-none">OR</span>
                  <div className="flex-1 h-px bg-gray-300"></div>
                </div>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* 🟡 섹션 2: PayPal 결제                       */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <div className="border-2 border-gray-200 rounded-xl p-4 bg-gray-50/50 hover:border-[#0070ba]/30 transition-colors space-y-3">
                  {/* 섹션 라벨 */}
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-label="PayPal">
                      <path fill="#003087" d="M20.1 7.7c.1-.6.1-1.2 0-1.7C19.5 3.8 17.3 3 14.6 3H7.4c-.5 0-.9.3-1 .8L4 18.7c0 .4.2.7.6.7h3.7l.9-5.8v.2c.1-.5.5-.8 1-.8h2c3.9 0 6.9-1.6 7.8-6.2 0-.1 0-.2.1-.3v.2z"/>
                      <path fill="#0070E0" d="M9.7 7.8c.1-.3.2-.5.5-.7.1-.1.3-.1.4-.1h6.1c.7 0 1.4.1 2 .2.2 0 .3.1.5.1.2.1.3.1.5.2.1 0 .1 0 .2.1.2.1.3.2.5.3-.3-1.8-2-3.5-5-3.5h-6c-.5 0-1 .4-1.1.9L6 18.8c0 .3.2.6.5.6h3.7l1-5.8.5-5.8z"/>
                    </svg>
                    <span className="text-sm font-semibold text-gray-700">
                      Pay with PayPal
                    </span>
                  </div>

                  {/* PayPal SPB 버튼 */}
                  <PayPalPaymentButton
                    orderId={orderId}
                    amount={totalAmount}
                    items={items}
                    onSuccess={(paymentId) => handlePaymentComplete('paypal', paymentId)}
                    onError={handlePaymentFailed}
                    onProcessing={handlePaymentStart}
                    compact
                  />
                </div>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* 🟠 포인트 결제 (아코디언)                     */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
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
