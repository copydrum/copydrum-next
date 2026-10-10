'use client';

import { useState, useEffect, useRef } from 'react';
import { useCart, type CartItem } from '../../hooks/useCart';
import { useAuthStore } from '../../stores/authStore';
import { useUserCredits } from '../../hooks/useUserCredits';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useTranslation } from 'react-i18next';
import { splitPurchasedSheetIds } from '../../lib/purchaseCheck';
import OnePageCheckout from '@/components/checkout/OnePageCheckout';
import type { CheckoutItem } from '@/components/checkout/OnePageCheckout';
import { useGuestCheckoutStore } from '../../stores/guestCheckoutStore';
import { useDialogStore } from '../../stores/dialogStore';
import { formatCurrency, getSiteCurrency, convertFromKrw } from '@/lib/currency';

const toCheckoutItem = (item: CartItem): CheckoutItem => ({
  id: item.id,
  sheet_id: item.sheet_id, // 실제 악보 ID (drum_sheets.id)
  title: item.title,
  artist: item.artist,
  price: item.price,
  thumbnail_url: item.image,
  quantity: 1,
  sales_type: item.sales_type || 'INSTANT',
});

export default function CartPageWithCheckout() {
  const { cartItems, loading, removeFromCart, removeSelectedItems, clearCart, getTotalPrice } = useCart();
  const { user } = useAuthStore();
  const { credits } = useUserCredits(user);
  const { showAlert, showConfirm } = useDialogStore();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
  const [orderId, setOrderId] = useState<string>('');
  // 결제에서 제외된 이미 구매한 장바구니 항목 (결제 화면 안내 배너용)
  const [excludedOwnedItems, setExcludedOwnedItems] = useState<CartItem[]>([]);
  // 이미 구매한 악보 id (장바구니 목록의 "구매 완료" 배지용)
  const [ownedSheetIds, setOwnedSheetIds] = useState<string[]>([]);
  const router = useLocaleRouter();
  const { t: _t, i18n } = useTranslation();
  const t = (key: string, options?: Record<string, unknown>): string => String(_t(`cartPage.${key}`, options));
  const autoCheckoutTriggered = useRef(false);

  const currency = getSiteCurrency(undefined, i18n.language);
  const formatPrice = (krw: number) => formatCurrency(convertFromKrw(krw, currency, i18n.language), currency);

  /**
   * 이미 구매한 악보를 걸러낸 뒤 결제 화면을 연다.
   * 전부 이미 구매한 악보면 결제 화면 대신 장바구니 목록(구매 완료 배지)에 머문다.
   */
  const startCheckout = async (items: CartItem[], { notifyIfAllOwned }: { notifyIfAllOwned: boolean }) => {
    if (!user) return;

    const { purchasedSheetIds } = await splitPurchasedSheetIds(
      user.id,
      items.map((item) => item.sheet_id)
    );
    const owned = items.filter((item) => purchasedSheetIds.includes(item.sheet_id));
    const toBuy = items.filter((item) => !purchasedSheetIds.includes(item.sheet_id));

    setOwnedSheetIds((prev) => Array.from(new Set([...prev, ...purchasedSheetIds])));

    if (toBuy.length === 0) {
      setSelectedItems([]);
      if (notifyIfAllOwned) {
        await showAlert(
          [t('onlyPurchasedItems'), '', t('duplicateSheets'), ...owned.map((item) => `- ${item.title}`)].join('\n')
        );
      }
      return;
    }

    setExcludedOwnedItems(owned);
    setCheckoutItems(toBuy.map(toCheckoutItem));
    setOrderId(crypto.randomUUID());
    setSelectedItems(toBuy.map((item) => item.id));
    setShowCheckout(true);
  };

  // 자동으로 체크아웃 화면으로 이동
  useEffect(() => {
    if (loading || !user || autoCheckoutTriggered.current) return;
    if (cartItems.length === 0) return;
    if (showCheckout) return;

    autoCheckoutTriggered.current = true;

    startCheckout(cartItems, { notifyIfAllOwned: false }).catch((error) => {
      console.error(t('console.purchaseCheckError'), error);
      showAlert(t('purchaseCheckError'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, cartItems, showCheckout]);

  if (loading && cartItems.length === 0 && !showCheckout) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const handleSelectAll = () => {
    if (selectedItems.length === cartItems.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(cartItems.map((item) => item.id));
    }
  };

  const handleSelectItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const handleProceedToCheckout = async () => {
    if (selectedItems.length === 0) {
      await showAlert(t('selectItemsToPurchase'));
      return;
    }

    // 비회원: 여기서 처음으로 이메일을 받는다.
    // 세션이 수립되면 모달이 게스트 장바구니를 DB 로 병합한 뒤 다시 장바구니로 돌아오고,
    // 그때 로그인 상태가 되어 자동으로 결제 화면으로 진행된다.
    if (!user) {
      const redirectPath = window.location.pathname + window.location.search;
      useGuestCheckoutStore.getState().open(redirectPath, undefined, true);
      return;
    }

    try {
      await startCheckout(
        cartItems.filter((item) => selectedItems.includes(item.id)),
        { notifyIfAllOwned: true }
      );
    } catch (error) {
      console.error(t('console.purchaseCheckError'), error);
      await showAlert(t('purchaseCheckError'));
    }
  };

  const handleDeleteSelected = async () => {
    if (!(await showConfirm(t('confirmDelete', { count: selectedItems.length })))) return;
    await removeSelectedItems(selectedItems);
    setSelectedItems([]);
  };

  const handleDeleteAll = async () => {
    if (!(await showConfirm(t('confirmClear')))) return;
    await clearCart();
    setSelectedItems([]);
  };

  const handleDeleteListItem = async (item: CartItem) => {
    if (!(await showConfirm(t('confirmDeleteItem', { title: item.title })))) return;
    await removeFromCart(item.id);
    setSelectedItems((prev) => prev.filter((id) => id !== item.id));
  };

  // 체크아웃 화면에서 개별 아이템 삭제
  const handleRemoveCheckoutItem = async (itemId: string) => {
    const target = checkoutItems.find((item) => item.id === itemId);
    if (!(await showConfirm(_t('checkout.confirmRemoveItem', { title: target?.title ?? '' })))) return;

    const removed = await removeFromCart(itemId);
    if (!removed) return;

    const remaining = checkoutItems.filter((item) => item.id !== itemId);
    setCheckoutItems(remaining);
    setSelectedItems((prev) => prev.filter((id) => id !== itemId));
    if (remaining.length === 0) setShowCheckout(false);
  };

  // 체크아웃 화면에서 장바구니 전체 비우기
  const handleClearAll = async () => {
    if (!(await showConfirm(_t('checkout.confirmClearAll')))) return;

    const cleared = await clearCart();
    if (!cleared) return;

    setCheckoutItems([]);
    setExcludedOwnedItems([]);
    setSelectedItems([]);
    setShowCheckout(false);
  };

  const handleRemoveOwnedFromCart = async () => {
    const removed = await removeSelectedItems(excludedOwnedItems.map((item) => item.id));
    if (removed) setExcludedOwnedItems([]);
  };

  const handlePaymentSuccess = async (method: string, paymentId?: string, dbOrderId?: string) => {
    console.log('[Cart] Payment success:', method, paymentId, 'dbOrderId:', dbOrderId);

    // 결제 완료된 항목 장바구니에서 제거
    const cartItemIds = checkoutItems.map((item) => item.id);
    await removeSelectedItems(cartItemIds);

    // 성공 페이지로 이동 (DB의 실제 UUID를 사용, 없으면 클라이언트 ID 폴백)
    const finalOrderId = dbOrderId || orderId;
    router.push(`/payment/success?orderId=${finalOrderId}&method=${method}`);
  };

  // 사용자 알림은 OnePageCheckout 이 이미 띄우므로 여기서는 기록만 한다.
  const handlePaymentError = (error: Error) => {
    console.error('[Cart] Payment error:', error);
  };

  // 체크아웃 화면 표시 (로그인 사용자 전용)
  if (showCheckout && checkoutItems.length > 0 && user) {
    const ownedNotice =
      excludedOwnedItems.length > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <i className="ri-information-line text-xl text-amber-600 mt-0.5"></i>
            <div>
              <p className="font-medium text-amber-900">
                {_t('checkout.purchasedExcludedBanner', { count: excludedOwnedItems.length })}
              </p>
              <p className="text-sm text-amber-800 mt-1">
                {excludedOwnedItems.map((item) => item.title).join(', ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRemoveOwnedFromCart}
            className="flex-shrink-0 px-4 py-2 text-sm font-medium text-amber-900 bg-white border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
          >
            {_t('checkout.removePurchasedFromCart')}
          </button>
        </div>
      ) : null;

    return (
      <div>
        {/* 뒤로가기 버튼 */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
            <button
              onClick={() => {
                // 이전 페이지로 돌아가기 (브라우저 히스토리 사용)
                // 만약 히스토리가 없으면 카테고리 페이지로 이동
                if (window.history.length > 1) {
                  router.back();
                } else {
                  router.push('/categories');
                }
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <i className="ri-arrow-left-line text-xl"></i>
              <span className="font-medium">{t('continueShopping')}</span>
            </button>
          </div>
        </div>

        <OnePageCheckout
          items={checkoutItems}
          orderId={orderId}
          userId={user.id}
          userEmail={user.email || undefined}
          userName={user.user_metadata?.name || undefined}
          userCash={credits}
          onPaymentSuccess={handlePaymentSuccess}
          onPaymentError={handlePaymentError}
          onRemoveItem={handleRemoveCheckoutItem}
          onClearAll={handleClearAll}
          notice={ownedNotice}
        />
      </div>
    );
  }

  // 장바구니 화면
  return (
    <div className="min-h-screen bg-gray-50 pt-4 md:pt-8 pb-8">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
            <p className="text-gray-600 mt-1">
              {t('totalItems', { count: cartItems.length })}
            </p>
          </div>

          {cartItems.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <i className="ri-shopping-cart-line text-2xl text-gray-400"></i>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('empty')}</h3>
              <p className="text-gray-600">{t('emptyDescription')}</p>
              <button
                onClick={() => router.push('/categories')}
                className="mt-6 inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('browseSheets')}
              </button>
            </div>
          ) : (
            <>
              {/* 선택/삭제 컨트롤 */}
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedItems.length === cartItems.length}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    {t('selectAll', { selected: selectedItems.length, total: cartItems.length })}
                  </span>
                </label>

                <div className="flex items-center gap-1">
                  {selectedItems.length > 0 && (
                    <button
                      onClick={handleDeleteSelected}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <i className="ri-delete-bin-line"></i>
                      <span>{t('deleteSelected')} ({selectedItems.length})</span>
                    </button>
                  )}
                  <button
                    onClick={handleDeleteAll}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <span>{t('deleteAll')}</span>
                  </button>
                </div>
              </div>

              {/* 장바구니 아이템 목록 */}
              <div className="divide-y divide-gray-200">
                {cartItems.map((item) => {
                  const owned = ownedSheetIds.includes(item.sheet_id);
                  return (
                    <div key={item.id} className="p-6 flex items-center space-x-4">
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.id)}
                        onChange={() => handleSelectItem(item.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />

                      <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center overflow-hidden">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <i className="ri-music-2-line text-2xl text-white"></i>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900">{item.title}</h3>
                        <p className="text-sm text-gray-600">{item.artist}</p>
                        <p className="text-xs text-gray-500 mt-1">{item.category}</p>
                        {owned && (
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full">
                              <i className="ri-check-line"></i>
                              {t('alreadyOwned')}
                            </span>
                            <button
                              onClick={() => router.push('/mypage?tab=purchases')}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              {t('goToMySheets')}
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`text-lg font-bold ${owned ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {formatPrice(item.price)}
                          </p>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteListItem(item);
                          }}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('removeItem')}
                        >
                          <i className="ri-close-line text-xl"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 결제 정보 */}
              <div className="p-6 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-medium text-gray-900">
                    {t('selectedItems', { count: selectedItems.length })}
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-2xl font-bold text-blue-600">
                      {formatPrice(getTotalPrice(selectedItems))}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleProceedToCheckout}
                  disabled={selectedItems.length === 0}
                  className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                >
                  <i className="ri-secure-payment-line text-2xl"></i>
                  {t('orderSelected')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
