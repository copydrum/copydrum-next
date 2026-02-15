'use client';

import { useState, useEffect, useRef } from 'react';
import { useCart } from '../../hooks/useCart';
import { useAuthStore } from '../../stores/authStore';
import { useUserCredits } from '../../hooks/useUserCredits';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useTranslation } from 'react-i18next';
import { splitPurchasedSheetIds } from '../../lib/purchaseCheck';
import OnePageCheckout from '@/components/checkout/OnePageCheckout';
import type { CheckoutItem } from '@/components/checkout/OnePageCheckout';

export default function CartPageWithCheckout() {
  const { cartItems, loading, removeFromCart, removeSelectedItems, getTotalPrice } = useCart();
  const { user } = useAuthStore();
  const { credits } = useUserCredits(user);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
  const [orderId, setOrderId] = useState<string>('');
  const router = useLocaleRouter();
  const { t: _t } = useTranslation();
  const t = (key: string, options?: any) => _t(`cartPage.${key}`, options);
  const autoCheckoutTriggered = useRef(false);

  // 자동으로 체크아웃 화면으로 이동
  useEffect(() => {
    if (loading || !user || autoCheckoutTriggered.current) return;
    if (cartItems.length === 0) return;
    if (showCheckout) return;

    autoCheckoutTriggered.current = true;

    const autoCheckout = async () => {
      try {
        const sheetIds = cartItems.map((item) => item.sheet_id);
        const { purchasedSheetIds, notPurchasedSheetIds } = await splitPurchasedSheetIds(
          user.id,
          sheetIds
        );

        let itemsToCheckout = cartItems;

        if (purchasedSheetIds.length > 0) {
          const duplicateItems = cartItems.filter((item) =>
            purchasedSheetIds.includes(item.sheet_id)
          );

          if (notPurchasedSheetIds.length === 0) {
            const duplicateList =
              duplicateItems.length > 0
                ? duplicateItems.map((item) => `- ${item.title}`).join('\n')
                : purchasedSheetIds.map((id) => `- ${id}`).join('\n');
            alert(
              [t('onlyPurchasedItems'), '', t('duplicateSheets'), duplicateList].join('\n')
            );
            return;
          }

          itemsToCheckout = cartItems.filter((item) =>
            notPurchasedSheetIds.includes(item.sheet_id)
          );

          const duplicateList =
            duplicateItems.length > 0
              ? duplicateItems.map((item) => `- ${item.title}`).join('\n')
              : purchasedSheetIds.map((id) => `- ${id}`).join('\n');

          alert(
            [t('excludePurchased'), '', t('excludedSheets'), duplicateList].join('\n')
          );
        }

        const checkoutData: CheckoutItem[] = itemsToCheckout.map((item) => ({
          id: item.id,
          sheet_id: item.sheet_id,  // 실제 악보 ID (drum_sheets.id)
          title: item.title,
          artist: item.artist,
          price: item.price,
          thumbnail_url: item.image,
          quantity: 1,
        }));

        const newOrderId = crypto.randomUUID();

        setCheckoutItems(checkoutData);
        setOrderId(newOrderId);
        setSelectedItems(itemsToCheckout.map((item) => item.id));
        setShowCheckout(true);
      } catch (error) {
        console.error(t('console.purchaseCheckError'), error);
        alert(t('purchaseCheckError'));
      }
    };

    autoCheckout();
  }, [loading, user, cartItems, showCheckout, t]);

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center" suppressHydrationWarning>
          <h2 className="text-2xl font-bold text-gray-900 mb-4" suppressHydrationWarning>{t('loginRequired')}</h2>
          <p className="text-gray-600" suppressHydrationWarning>{t('loginRequiredDescription')}</p>
          <button
            onClick={() => router.push('/auth/login')}
            className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            suppressHydrationWarning
          >
            {t('login', 'Login')}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
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
      alert(t('selectItemsToPurchase'));
      return;
    }

    const itemsToPurchase = cartItems.filter((item) => selectedItems.includes(item.id));

    try {
      // 이미 구매한 악보 체크
      const sheetIds = itemsToPurchase.map((item) => item.sheet_id);
      const { purchasedSheetIds, notPurchasedSheetIds } = await splitPurchasedSheetIds(
        user.id,
        sheetIds
      );

      if (purchasedSheetIds.length > 0) {
        const duplicateItems = itemsToPurchase.filter((item) =>
          purchasedSheetIds.includes(item.sheet_id)
        );

        if (notPurchasedSheetIds.length === 0) {
          const duplicateList =
            duplicateItems.length > 0
              ? duplicateItems.map((item) => `- ${item.title}`).join('\n')
              : purchasedSheetIds.map((id) => `- ${id}`).join('\n');
          alert(
            [t('onlyPurchasedItems'), '', t('duplicateSheets'), duplicateList].join('\n')
          );
          return;
        }

        const filteredItems = itemsToPurchase.filter((item) =>
          notPurchasedSheetIds.includes(item.sheet_id)
        );

        const duplicateList =
          duplicateItems.length > 0
            ? duplicateItems.map((item) => `- ${item.title}`).join('\n')
            : purchasedSheetIds.map((id) => `- ${id}`).join('\n');

        alert(
          [t('excludePurchased'), '', t('excludedSheets'), duplicateList].join('\n')
        );

        // 필터링된 항목으로 계속 진행
        const checkoutData: CheckoutItem[] = filteredItems.map((item) => ({
          id: item.id,
          sheet_id: item.sheet_id,  // 실제 악보 ID (drum_sheets.id)
          title: item.title,
          artist: item.artist,
          price: item.price,
          thumbnail_url: item.image,
          quantity: 1,
        }));

        setCheckoutItems(checkoutData);
      } else {
        // 중복 없음 - 그대로 진행
        const checkoutData: CheckoutItem[] = itemsToPurchase.map((item) => ({
          id: item.id,
          sheet_id: item.sheet_id,  // 실제 악보 ID (drum_sheets.id)
          title: item.title,
          artist: item.artist,
          price: item.price,
          thumbnail_url: item.image,
          quantity: 1,
        }));

        setCheckoutItems(checkoutData);
      }

      // 주문 ID 생성 (UUID 형식으로 생성하여 Supabase id 타입과 호환)
      const newOrderId = crypto.randomUUID();
      setOrderId(newOrderId);
      setShowCheckout(true);
    } catch (error) {
      console.error(t('console.purchaseCheckError'), error);
      alert(t('purchaseCheckError'));
    }
  };

  // 체크아웃 화면에서 개별 아이템 삭제
  const handleRemoveCheckoutItem = async (itemId: string) => {
    // 장바구니 DB에서 제거
    await removeFromCart(itemId);
    // 체크아웃 아이템 목록에서 제거
    setCheckoutItems((prev) => prev.filter((item) => item.id !== itemId));
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

  const handlePaymentError = (error: Error) => {
    console.error('[Cart] Payment error:', error);
    alert(t('paymentError') + ': ' + error.message);
  };

  // 체크아웃 화면 표시
  if (showCheckout && checkoutItems.length > 0) {
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
          userPoints={credits}
          onPaymentSuccess={handlePaymentSuccess}
          onPaymentError={handlePaymentError}
          onRemoveItem={handleRemoveCheckoutItem}
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

                {selectedItems.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!confirm(t('confirmDelete', { count: selectedItems.length }))) return;
                      await removeSelectedItems(selectedItems);
                      setSelectedItems([]);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <i className="ri-delete-bin-line"></i>
                    <span>{t('deleteSelected')} ({selectedItems.length})</span>
                  </button>
                )}
              </div>

              {/* 장바구니 아이템 목록 */}
              <div className="divide-y divide-gray-200">
                {cartItems.map((item) => (
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

                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{item.title}</h3>
                      <p className="text-sm text-gray-600">{item.artist}</p>
                      <p className="text-xs text-gray-500 mt-1">{item.category}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {item.price.toLocaleString()}원
                        </p>
                      </div>

                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(t('confirmDeleteItem', { title: item.title }))) return;
                          await removeFromCart(item.id);
                          setSelectedItems((prev) => prev.filter((id) => id !== item.id));
                        }}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title={t('removeItem')}
                      >
                        <i className="ri-close-line text-xl"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 결제 정보 */}
              <div className="p-6 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-medium text-gray-900">
                    {t('selectedItems', { count: selectedItems.length })}
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-2xl font-bold text-blue-600">
                      {getTotalPrice(selectedItems).toLocaleString()}원
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
