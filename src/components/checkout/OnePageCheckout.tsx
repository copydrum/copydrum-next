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
                {/* 🔵 섹션 1: 카드 & 월렛 결제 (메인 결제 수단)  */}
                {/* ⚠️ 도도페이먼트(해외카드) 숨김, KG이니시스(한국카드)는 표시 */}
                {/* 한국어: KG이니시스 표시 / 해외: 도도페이먼트 숨김 */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {i18n.language === 'ko' && (
                <div className="space-y-3">
                  {/* 섹션 라벨 */}
                  <div className="flex items-center gap-2">
                    <i className="ri-bank-card-line text-lg text-gray-700"></i>
                    <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                      {t('checkout.creditDebitWallets', 'Credit/Debit Card & Wallets')}
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

                  {/* 지원 결제 수단 아이콘 라인 */}
                  <div className="flex flex-col items-center gap-1.5 pt-1">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {/* Visa */}
                      <div className="h-7 w-11 bg-white border border-gray-200 rounded flex items-center justify-center" title="Visa">
                        <svg viewBox="0 0 32 20" className="h-4 w-7" aria-label="Visa">
                          <rect width="32" height="20" rx="2" fill="#fff"/>
                          <path d="M13.2 13.5H11.3L12.5 6.5H14.4L13.2 13.5Z" fill="#1A1F71"/>
                          <path d="M20.3 6.7C19.9 6.5 19.3 6.4 18.5 6.4C16.7 6.4 15.4 7.4 15.4 8.7C15.4 9.7 16.3 10.2 17 10.6C17.7 10.9 17.9 11.1 17.9 11.4C17.9 11.9 17.3 12.1 16.8 12.1C16 12.1 15.6 12 14.9 11.7L14.7 11.6L14.4 13.2C14.9 13.4 15.8 13.6 16.8 13.6C18.7 13.6 20 12.6 20 11.2C20 10.4 19.5 9.8 18.4 9.3C17.8 9 17.4 8.8 17.4 8.5C17.4 8.2 17.8 7.9 18.5 7.9C19.1 7.9 19.6 8 19.9 8.2L20.1 8.3L20.3 6.7Z" fill="#1A1F71"/>
                          <path d="M22.7 6.5H21.3C20.8 6.5 20.5 6.7 20.3 7.1L17.7 13.5H19.6L20 12.3H22.3L22.5 13.5H24.2L22.7 6.5ZM20.5 11C20.7 10.4 21.4 8.5 21.4 8.5L22 11H20.5Z" fill="#1A1F71"/>
                          <path d="M10.7 6.5L8.9 11.2L8.7 10.2C8.3 9 7.2 7.6 5.9 6.9L7.5 13.5H9.5L12.7 6.5H10.7Z" fill="#1A1F71"/>
                          <path d="M7.6 6.5H4.6L4.6 6.7C7 7.2 8.6 8.7 9.1 10.5L8.5 7.2C8.4 6.7 8.1 6.5 7.6 6.5Z" fill="#F7A600"/>
                        </svg>
                      </div>
                      {/* Mastercard */}
                      <div className="h-7 w-11 bg-white border border-gray-200 rounded flex items-center justify-center" title="Mastercard">
                        <svg viewBox="0 0 24 16" className="h-4" aria-label="Mastercard">
                          <circle cx="8.5" cy="8" r="7" fill="#EB001B"/>
                          <circle cx="15.5" cy="8" r="7" fill="#F79E1B"/>
                          <path fill="#FF5F00" d="M12 2.4a7 7 0 0 0-2.6 5.6A7 7 0 0 0 12 13.6a7 7 0 0 0 2.6-5.6A7 7 0 0 0 12 2.4z"/>
                        </svg>
                      </div>
                      {/* Amex */}
                      <div className="h-7 w-11 bg-[#006FCF] border border-[#006FCF] rounded flex items-center justify-center" title="American Express">
                        <span className="text-[9px] font-black text-white tracking-tight leading-none">AMEX</span>
                      </div>
                      {/* Apple Pay */}
                      <div className="h-7 w-11 bg-black border border-black rounded flex items-center justify-center" title="Apple Pay">
                        <svg viewBox="0 0 40 18" className="h-3.5" aria-label="Apple Pay">
                          <path fill="white" d="M7.3 3.3c-.4.5-1 .9-1.7.8-.1-.7.2-1.4.6-1.9.4-.5 1.1-.9 1.6-.9.1.7-.2 1.4-.5 2zm.5.9c-.9-.1-1.7.5-2.2.5-.4 0-1.1-.5-1.9-.5-1 0-1.9.6-2.4 1.4-1 1.8-.3 4.4.7 5.8.5.7 1.1 1.5 1.8 1.5.7 0 1-.5 1.9-.5.9 0 1.1.5 1.8.5s1.3-.7 1.7-1.5c.3-.5.4-.7.6-1.2-1.5-.6-1.7-2.8-.2-3.7-.5-.6-1.2-1-2-1.1l.2-.2z"/>
                          <path fill="white" d="M14.3 2.5c2 0 3.4 1.4 3.4 3.4s-1.5 3.4-3.5 3.4h-2.2v3.5h-1.7V2.5h4zm-2.3 5.5h1.9c1.4 0 2.2-.7 2.2-2s-.8-2-2.2-2H12v4zm6.5 2.2c0-1.4 1.1-2.3 3-2.4l2.2-.1V7.2c0-.9-.6-1.4-1.6-1.4-.9 0-1.5.4-1.7 1.1h-1.5c.1-1.4 1.3-2.5 3.2-2.5s3.1 1 3.1 2.6v5.4h-1.5v-1.3h0c-.4.9-1.4 1.5-2.4 1.5-1.5 0-2.6-1-2.6-2.4zm5.2-.7v-.7L22 9c-1.1.1-1.7.5-1.7 1.3s.6 1.1 1.5 1.1c1.1.1 2-.6 2-1.5l-.1.6zm3.6 5v-1.3c.1 0 .4.1.7.1 1 0 1.5-.4 1.9-1.5l.2-.5-2.9-8h1.8l2 6.3h0l2-6.3h1.7L31 13.5c-.7 1.9-1.4 2.5-3.1 2.5-.2 0-.5 0-.7-.1v.6z"/>
                        </svg>
                      </div>
                      {/* Google Pay */}
                      <div className="h-7 w-11 bg-white border border-gray-200 rounded flex items-center justify-center" title="Google Pay">
                        <svg viewBox="0 0 40 18" className="h-3.5" aria-label="Google Pay">
                          <path d="M18.5 8.8v3.2h-1V4.5h2.7c.7 0 1.3.2 1.8.7.5.5.7 1 .7 1.7s-.2 1.2-.7 1.7c-.5.4-1.1.7-1.8.7h-1.7V8.8zm0-3.4V8h1.7c.4 0 .8-.2 1.1-.5.3-.3.4-.6.4-1s-.1-.7-.4-1c-.3-.3-.6-.5-1-.5H18.5V5.4z" fill="#5F6368"/>
                          <path d="M25.6 6.8c.7 0 1.3.2 1.8.6.4.4.6 1 .6 1.7v3.4h-1V11.7h0c-.4.6-1 .9-1.7.9-.6 0-1.2-.2-1.6-.5-.4-.4-.6-.8-.6-1.4 0-.6.2-1 .6-1.4.4-.3 1-.5 1.7-.5.6 0 1.1.1 1.4.3v-.2c0-.4-.2-.7-.4-1-.3-.2-.6-.4-1-.4-.6 0-1 .3-1.2.7l-.9-.4c.4-.7 1-1.1 1.8-1.1l-.5.1zm-1.4 4c0 .3.1.5.4.7.2.2.5.3.8.3.4 0 .8-.2 1.2-.5.3-.3.5-.7.5-1.1-.4-.3-.8-.4-1.3-.4-.4 0-.8.1-1.1.3-.3.2-.5.4-.5.7z" fill="#5F6368"/>
                          <path d="M32.7 7l-3.4 7.8h-1l1.3-2.7-2.2-5.1h1.1l1.6 4h0l1.6-4h1z" fill="#5F6368"/>
                          <path d="M13.2 8.4c0-.3 0-.7-.1-1H7.8v1.9h3c-.1.7-.5 1.3-1 1.7v1.4h1.7c1-1 1.6-2.3 1.6-4h.1z" fill="#4285F4"/>
                          <path d="M7.8 12.8c1.4 0 2.5-.5 3.3-1.2l-1.6-1.2c-.5.3-1 .5-1.7.5-1.3 0-2.4-.9-2.8-2h-1.7v1.3c.8 1.6 2.5 2.6 4.5 2.6z" fill="#34A853"/>
                          <path d="M5 9c-.1-.3-.2-.7-.2-1s.1-.7.2-1V5.6H3.4C3.1 6.2 3 6.9 3 7.6s.2 1.4.4 2L5 9z" fill="#FBBC04"/>
                          <path d="M7.8 5c.7 0 1.4.3 1.9.7l1.4-1.4C10.2 3.5 9.1 3 7.8 3 5.8 3 4.1 4 3.3 5.6L5 7c.4-1.2 1.5-2 2.8-2z" fill="#EA4335"/>
                        </svg>
                      </div>
                      {/* UnionPay */}
                      <div className="h-7 w-11 bg-[#E21836] border border-[#E21836] rounded flex items-center justify-center" title="UnionPay">
                        <svg viewBox="0 0 36 16" className="h-3" aria-label="UnionPay">
                          <path d="M8 0h7c1.1 0 1.7.9 1.3 2L13 14c-.3 1.1-1.5 2-2.6 2H3.2C2 16 1.5 15.1 1.8 14L5.2 2C5.5.9 6.8 0 8 0z" fill="#E21836" opacity="0.9"/>
                          <path d="M14.5 0h7.5c1.1 0 1.7.9 1.3 2L20 14c-.3 1.1-1.5 2-2.6 2H10c-1.1 0-1.7-.9-1.3-2l3.3-12c.4-1.1 1.5-2 2.5-2z" fill="#00447C"/>
                          <path d="M22 0h7.5c1.1 0 1.7.9 1.3 2l-3.3 12c-.3 1.1-1.5 2-2.6 2h-7.5c-1.1 0-1.7-.9-1.3-2l3.3-12C19.7.9 20.9 0 22 0z" fill="#007B84"/>
                          <text x="18" y="10.5" textAnchor="middle" fill="white" fontSize="5.5" fontWeight="800" fontFamily="Arial,sans-serif">银联</text>
                        </svg>
                      </div>
                    </div>
                    {/* + Local Cards Supported */}
                    <span className="text-[10px] text-gray-400 tracking-wide">
                      {t('checkout.localCardsSupported', '+ Local Cards Supported')}
                    </span>
                  </div>
                </div>
                )}

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* ── OR 구분선 (한국어: KG이니시스↔카카오페이 사이, 해외: 숨김) ── */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {i18n.language === 'ko' && (
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-gray-300"></div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest select-none">OR</span>
                  <div className="flex-1 h-px bg-gray-300"></div>
                </div>
                )}

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* 🟡 섹션 2: PayPal 결제 (한국어 페이지에서는 숨김) */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {i18n.language !== 'ko' && (
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
                    onSuccess={(paymentId, dbOrderId) => handlePaymentComplete('paypal', paymentId, dbOrderId)}
                    onError={handlePaymentFailed}
                    onProcessing={handlePaymentStart}
                    compact
                  />
                </div>
                )}

                {/* ━━━ 카카오페이 버튼 (한국어 페이지에서만 표시) ━━━ */}
                {i18n.language === 'ko' && (
                <KakaoPayButton
                  orderId={orderId}
                  amount={totalAmount}
                  orderName={items.length === 1 ? items[0].title : `${items.length} items`}
                  items={items.map((item) => ({
                    sheet_id: item.sheet_id,
                    title: item.title,
                    price: item.price,
                  }))}
                  userEmail={userEmail}
                  onSuccess={(paymentId, dbOrderId) => handlePaymentComplete('kakaopay', paymentId, dbOrderId)}
                  onError={handlePaymentFailed}
                  onProcessing={handlePaymentStart}
                  compact
                />
                )}

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* 🟠 포인트 결제 (아코디언) - 한국어 페이지에서만 표시 */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {i18n.language === 'ko' && hasPoints && (
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
