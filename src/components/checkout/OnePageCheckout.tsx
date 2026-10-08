'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, getSiteCurrency, convertFromKrw } from '@/lib/currency';
import { supabase } from '@/lib/supabase';
import { calcEarnPoints } from '@/lib/points/config';
import CardPaymentButton from './CardPaymentButton';
import PayPalPaymentButton from './PayPalPaymentButton';
import LemonSqueezyButton from './LemonSqueezyButton';
import KakaoPayButton from './KakaoPayButton';
import CashPaymentForm from './CashPaymentForm';
import { ensureCheckoutOrder } from './ensureCheckoutOrder';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CheckoutItem {
  id: string;
  sheet_id: string;   // drum_sheets.id (실제 악보 ID)
  title: string;
  artist?: string;
  price: number;
  thumbnail_url?: string | null;
  quantity?: number;
  sales_type?: 'INSTANT' | 'PREORDER';
}

export interface OnePageCheckoutProps {
  items: CheckoutItem[];
  orderId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  /** 보유 캐쉬 (profiles.credits) */
  userCash?: number;
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
  userCash = 0,
  onPaymentSuccess,
  onPaymentError,
  onRemoveItem,
}: OnePageCheckoutProps) {
  const { t, i18n } = useTranslation();
  const [processing, setProcessing] = useState(false);
  const [showCashForm, setShowCashForm] = useState(false);
  // 이 주문에 쓸 수 있는 포인트 (보유 포인트 + 이 주문에 이미 적용된 포인트)
  const [pointBalance, setPointBalance] = useState(0);
  const [pointsInput, setPointsInput] = useState(0);
  const [payingWithPoints, setPayingWithPoints] = useState(false);
  // 통화 계산
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);

  // ⚠️ [결제수단 분기 기준] 화면 언어(i18n.language)가 아니라 "주문 통화"를 단일 기준으로 사용한다.
  //    - i18n.language 하나만 보면, 결제 페이지에서 언어가 잠깐 흔들릴 때
  //      (쿠키/경로 불일치 등) 한국 손님에게 PayPal만 뜨거나 그 반대 현상이 발생할 수 있다.
  //    - 통화는 getSiteCurrency로 일관되게 계산되므로, KRW면 한국 결제수단(KG이니시스/카카오페이/포인트),
  //      그 외 통화면 PayPal로 안정적으로 분기한다.
  const isKoreanCheckout = currency === 'KRW';

  // 총액 계산
  const totalAmount = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  const convertedAmount = convertFromKrw(totalAmount, currency, i18n.language);
  const formattedTotal = formatCurrency(convertedAmount, currency);

  useEffect(() => {
    if (!isKoreanCheckout || !userId) return;
    let cancelled = false;

    (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('points')
        .eq('id', userId)
        .maybeSingle();

      let applied = 0;
      if (UUID_PATTERN.test(orderId)) {
        const { data: order } = await supabase
          .from('orders')
          .select('points_used, status')
          .eq('id', orderId)
          .maybeSingle();
        if (order?.status === 'pending') applied = Number(order.points_used) || 0;
      }

      if (!cancelled) {
        setPointBalance((Number(profile?.points) || 0) + applied);
        setPointsInput(applied);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isKoreanCheckout, userId, orderId]);

  // 포인트 먼저 차감, 남은 금액을 결제수단으로
  const maxUsablePoints = isKoreanCheckout ? Math.min(pointBalance, totalAmount) : 0;
  const pointsToUse = Math.min(Math.max(0, Math.floor(pointsInput) || 0), maxUsablePoints);
  const payableAmount = totalAmount - pointsToUse;
  const coveredByPoints = isKoreanCheckout && totalAmount > 0 && payableAmount === 0;
  const earnPreview = calcEarnPoints(payableAmount);
  const formattedPayable = formatCurrency(convertFromKrw(payableAmount, currency, i18n.language), currency);
  const hasCash = userCash > 0;

  /** 결제 직전 주문에 포인트를 적용하고, PG/캐쉬로 결제할 금액을 돌려준다 */
  const prepareOrder = useCallback(
    async (dbOrderId: string): Promise<number> => {
      if (pointBalance === 0) return totalAmount;

      const response = await fetch(`/api/orders/${dbOrderId}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: pointsToUse }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(
          result?.error === 'INSUFFICIENT_POINTS'
            ? t('checkout.rewardPoints.insufficient')
            : t('checkout.rewardPoints.applyFailed'),
        );
      }
      return Number(result.payable);
    },
    [pointBalance, pointsToUse, totalAmount, t],
  );

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

  const handlePayWithPoints = async () => {
    if (payingWithPoints) return;
    setPayingWithPoints(true);
    handlePaymentStart();

    try {
      const { orderId: dbOrderId, alreadyPaid } = await ensureCheckoutOrder({
        orderId,
        userId,
        amount: totalAmount,
        paymentMethod: 'reward_points',
        items: items.map((item) => ({ sheet_id: item.sheet_id, title: item.title, price: item.price })),
      });

      if (!alreadyPaid) {
        const payable = await prepareOrder(dbOrderId);
        if (payable !== 0) {
          throw new Error(t('checkout.rewardPoints.applyFailed'));
        }
        const response = await fetch('/api/payments/reward-points/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: dbOrderId }),
        });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) {
          throw new Error(result?.error || t('checkout.rewardPoints.applyFailed'));
        }
      }

      handlePaymentComplete('reward_points', undefined, dbOrderId);
    } catch (error) {
      setPayingWithPoints(false);
      handlePaymentFailed(error as Error);
    }
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
                  <span className={pointsToUse > 0 ? 'text-sm text-gray-500' : 'text-xl font-bold text-blue-600'}>
                    {formattedTotal}
                  </span>
                </div>
                {pointsToUse > 0 && (
                  <>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm text-gray-600">{t('checkout.rewardPoints.discount')}</span>
                      <span className="text-sm font-semibold text-emerald-600">
                        -{pointsToUse.toLocaleString('ko-KR')}P
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-semibold text-gray-800">{t('checkout.rewardPoints.payable')}</span>
                      <span className="text-xl font-bold text-blue-600">{formattedPayable}</span>
                    </div>
                  </>
                )}
                {isKoreanCheckout && earnPreview > 0 && (
                  <p className="mt-2 text-xs text-emerald-700">
                    {t('checkout.rewardPoints.earnPreview', { points: earnPreview.toLocaleString('ko-KR') })}
                  </p>
                )}
              </div>

              <div className="p-6 space-y-5">

                {/* ━━━ 적립 포인트 사용 (한국어 결제, 보유 포인트가 있을 때) ━━━ */}
                {isKoreanCheckout && pointBalance > 0 && (
                  <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800">{t('checkout.rewardPoints.title')}</span>
                      <span className="text-xs text-gray-600">
                        {t('checkout.rewardPoints.balance', { points: pointBalance.toLocaleString('ko-KR') })}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={maxUsablePoints}
                        value={pointsInput === 0 ? '' : pointsInput}
                        placeholder={t('checkout.rewardPoints.placeholder')}
                        onChange={(e) => {
                          const next = Math.floor(Number(e.target.value) || 0);
                          setPointsInput(Math.min(Math.max(0, next), maxUsablePoints));
                        }}
                        disabled={processing}
                        className="flex-1 min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-right font-semibold focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setPointsInput(pointsToUse === maxUsablePoints ? 0 : maxUsablePoints)}
                        disabled={processing}
                        className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {t('checkout.rewardPoints.useAll')}
                      </button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-gray-500">{t('checkout.rewardPoints.notice')}</p>
                  </div>
                )}

                {/* ━━━ 포인트로 전액 결제 ━━━ */}
                {coveredByPoints && (
                  <button
                    onClick={handlePayWithPoints}
                    disabled={payingWithPoints}
                    className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg hover:shadow-xl"
                  >
                    {payingWithPoints ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        <span>{t('checkout.processing')}</span>
                      </>
                    ) : (
                      <>
                        <i className="ri-coins-line text-xl"></i>
                        <span>{t('checkout.rewardPoints.payWithPoints')}</span>
                      </>
                    )}
                  </button>
                )}

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* 🔵 섹션 1: 카드 결제 (한국어: KG이니시스) */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {isKoreanCheckout && !coveredByPoints && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <i className="ri-bank-card-line text-lg text-gray-700"></i>
                    <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                      {t('checkout.creditDebitWallets', 'Credit/Debit Card & Wallets')}
                    </span>
                  </div>

                  <div className={''}>
                    <CardPaymentButton
                      orderId={orderId}
                      amount={totalAmount}
                      orderName={items.length === 1 ? items[0].title : `${items.length} items`}
                      items={items}
                      userId={userId}
                      customerEmail={userEmail}
                      customerName={userName}
                      prepareOrder={prepareOrder}
                      onSuccess={(paymentId, dbOrderId) => handlePaymentComplete('card', paymentId, dbOrderId)}
                      onError={handlePaymentFailed}
                      onProcessing={handlePaymentStart}
                      compact
                    />
                  </div>
                </div>
                )}

                {/* OR 구분선 (한국어: KG이니시스↔카카오페이 사이) */}
                {isKoreanCheckout && !coveredByPoints && (
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-gray-300"></div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest select-none">OR</span>
                  <div className="flex-1 h-px bg-gray-300"></div>
                </div>
                )}

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* 💳 섹션 2: 카드/기타 결제 (해외 전용, Lemon Squeezy 오버레이) */}
                {/* - 사이트 위 오버레이로 결제 (사이트 이탈 없음)             */}
                {/* - 앨범 자켓/이미지/실제 PDF는 LS에 전달하지 않음           */}
                {/* - PayPal 위에 노출되는 메인 결제 수단                      */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {!isKoreanCheckout && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <i className="ri-bank-card-line text-lg text-gray-700"></i>
                    <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                      {t('checkout.payWithCardTitle', 'Credit / Debit Card')}
                    </span>
                  </div>
                  <LemonSqueezyButton
                    orderId={orderId}
                    amount={totalAmount}
                    items={items}
                    onSuccess={(paymentId, dbOrderId) => handlePaymentComplete('lemonsqueezy', paymentId, dbOrderId)}
                    onError={handlePaymentFailed}
                    onProcessing={handlePaymentStart}
                    compact
                  />
                </div>
                )}

                {/* OR 구분선 (해외: 카드 ↔ PayPal 사이) */}
                {!isKoreanCheckout && (
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-gray-300"></div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest select-none">OR</span>
                  <div className="flex-1 h-px bg-gray-300"></div>
                </div>
                )}

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* 🟡 섹션 3: PayPal 결제 (한국어 페이지에서는 숨김) */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {!isKoreanCheckout && (
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
                  <div className={''}>
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
                </div>
                )}

                {/* ━━━ 카카오페이 버튼 (한국어 페이지에서만 표시) ━━━ */}
                {isKoreanCheckout && !coveredByPoints && (
                <div className={''}>
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
                    prepareOrder={prepareOrder}
                    onSuccess={(paymentId, dbOrderId) => handlePaymentComplete('kakaopay', paymentId, dbOrderId)}
                    onError={handlePaymentFailed}
                    onProcessing={handlePaymentStart}
                    compact
                  />
                </div>
                )}

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* 🟠 캐쉬 결제 (아코디언) - 한국어 페이지에서만 표시 */}
                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {isKoreanCheckout && hasCash && !coveredByPoints && (
                  <div className="border-t border-gray-200 pt-3 mt-1">
                    <button
                      onClick={() => setShowCashForm(!showCashForm)}
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
                            {t('checkout.usePointsDesc', { balance: formatCurrency(userCash, 'KRW') })}
                          </p>
                        </div>
                        <i className={`ri-arrow-${showCashForm ? 'up' : 'down'}-s-line text-xl text-gray-400 group-hover:text-yellow-600 transition-colors`}></i>
                      </div>
                    </button>

                    {showCashForm && (
                      <div className="mt-3">
                        <CashPaymentForm
                          orderId={orderId}
                          orderTotal={totalAmount}
                          amount={payableAmount}
                          availableCash={userCash}
                          userId={userId}
                          prepareOrder={prepareOrder}
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

                  {/* 결제 가능한 카드/수단 브랜드 (해외 결제 화면에서만 표시) */}
                  {!isKoreanCheckout && (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      {[
                        { icon: 'ri-visa-fill', label: 'Visa', color: '#1434CB' },
                        { icon: 'ri-mastercard-fill', label: 'Mastercard', color: '#EB001B' },
                        { icon: 'ri-paypal-fill', label: 'PayPal', color: '#003087' },
                        { icon: 'ri-apple-fill', label: 'Apple Pay', color: '#111827' },
                        { icon: 'ri-google-fill', label: 'Google Pay', color: '#4285F4' },
                      ].map((brand) => (
                        <span
                          key={brand.label}
                          title={brand.label}
                          aria-label={brand.label}
                          className="inline-flex items-center justify-center h-7 w-11 rounded-md border border-gray-200 bg-white"
                        >
                          <i className={`${brand.icon} text-xl`} style={{ color: brand.color }}></i>
                        </span>
                      ))}
                      {/* American Express는 아이콘이 없어 텍스트 배지로 표기 */}
                      <span
                        title="American Express"
                        aria-label="American Express"
                        className="inline-flex items-center justify-center h-7 px-2 rounded-md border border-gray-200 bg-white text-[10px] font-bold tracking-tight text-[#1F72CD]"
                      >
                        AMEX
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
