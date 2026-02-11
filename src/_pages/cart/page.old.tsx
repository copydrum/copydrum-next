'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useState, useCallback } from 'react';
import { useCart } from '../../hooks/useCart';
import { useAuthStore } from '../../stores/authStore';
import { splitPurchasedSheetIds } from '../../lib/purchaseCheck';
import { BankTransferInfoModal, PaymentMethodSelector } from '../../components/payments';
import type { PaymentMethod } from '../../components/payments';
import { startSheetPurchase } from '../../lib/payments';
import type { VirtualAccountInfo } from '../../lib/payments';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import PayPalPaymentModal from '../../components/payments/PayPalPaymentModal';
import { useUserCredits } from '../../hooks/useUserCredits';

type PendingCartPurchase = {
  targetItemIds: string[];
  items: Array<{
    sheetId: string;
    sheetTitle: string;
    price: number;
  }>;
  amount: number;
  description: string;
};

export default function CartPage() {
  // 모든 훅을 최상단에 모아서 항상 동일한 순서로 호출되도록 함
  const { cartItems, loading, removeFromCart, removeSelectedItems, clearCart, getTotalPrice } = useCart();
  const { user } = useAuthStore();
  const { credits } = useUserCredits(user);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [showPaymentSelector, setShowPaymentSelector] = useState(false);
  const [pendingPurchase, setPendingPurchase] = useState<PendingCartPurchase | null>(null);
  const [bankTransferInfo, setBankTransferInfo] = useState<VirtualAccountInfo | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [showBankTransferModal, setShowBankTransferModal] = useState(false);
  const [showPayPalModal, setShowPayPalModal] = useState(false);
  const router = useLocaleRouter();
  const { t, i18n } = useTranslation();
  
  // 계산된 값들 (훅이 아님)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);

  // useCallback도 훅이므로 최상단에 위치
  const formatPriceValue = useCallback(
    (price: number) => {
      const converted = convertFromKrw(price, currency, i18n.language);
      return formatCurrencyUtil(converted, currency);
    },
    [currency, i18n.language],
  );

  // useCallback도 훅이므로 최상단에 위치
  const handlePayPalPayment = useCallback(async (elementId: string) => {
    if (!user || !pendingPurchase) return;

    await startSheetPurchase({
      userId: user.id,
      items: pendingPurchase.items,
      amount: pendingPurchase.amount,
      paymentMethod: 'paypal',
      description: pendingPurchase.description,
      buyerName: user.email ?? null,
      buyerEmail: user.email ?? null,
      elementId,
    });
  }, [user, pendingPurchase]);

  // early return은 모든 훅 호출 후에만 허용
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{t('cartPage.loginRequired')}</h2>
          <p className="text-gray-600">{t('cartPage.loginRequiredDescription')}</p>
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
      setSelectedItems(cartItems.map(item => item.id));
    }
  };

  const handleSelectItem = (itemId: string) => {
    setSelectedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleRemoveSelected = async () => {
    if (selectedItems.length === 0) {
      alert(t('cartPage.selectItemsToDelete'));
      return;
    }

    if (confirm(t('cartPage.confirmDelete', { count: selectedItems.length }))) {
      const success = await removeSelectedItems(selectedItems);
      if (success) {
        setSelectedItems([]);
      }
    }
  };

  const handleClearCart = async () => {
    if (cartItems.length === 0) return;

    if (confirm(t('cartPage.confirmClear'))) {
      const success = await clearCart();
      if (success) {
        setSelectedItems([]);
      }
    }
  };

  const handlePurchase = async (itemIds: string[]) => {
    if (processing) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }

    if (itemIds.length === 0) {
      alert(t('cartPage.selectItemsToPurchase'));
      return;
    }

    let targetItemIds = [...itemIds];
    const itemsToPurchase = cartItems.filter(item => targetItemIds.includes(item.id));
    if (itemsToPurchase.length === 0) {
      alert(t('cartPage.itemsNotFound'));
      return;
    }

    let filteredItems = itemsToPurchase;

    try {
      const sheetIds = itemsToPurchase.map(item => item.sheet_id);
      const { purchasedSheetIds, notPurchasedSheetIds } = await splitPurchasedSheetIds(user.id, sheetIds);

      if (purchasedSheetIds.length > 0) {
        const duplicateItems = itemsToPurchase.filter(item => purchasedSheetIds.includes(item.sheet_id));

        if (notPurchasedSheetIds.length === 0) {
          const duplicateList =
            duplicateItems.length > 0
              ? duplicateItems.map(item => `- ${item.title}`).join('\n')
              : purchasedSheetIds.map(id => `- ${id}`).join('\n');
          alert(
            [t('cartPage.onlyPurchasedItems'), '', t('cartPage.duplicateSheets'), duplicateList].join('\n'),
          );
          return;
        }

        filteredItems = itemsToPurchase.filter(item => notPurchasedSheetIds.includes(item.sheet_id));
        targetItemIds = filteredItems.map(item => item.id);

        const duplicateList =
          duplicateItems.length > 0
            ? duplicateItems.map(item => `- ${item.title}`).join('\n')
            : purchasedSheetIds.map(id => `- ${id}`).join('\n');

        alert(
          [
            t('cartPage.excludePurchased'),
            '',
            t('cartPage.excludedSheets'),
            duplicateList,
          ].join('\n'),
        );
      }
    } catch (error) {
      console.error(t('cartPage.console.purchaseCheckError'), error);
      alert(t('cartPage.purchaseCheckError'));
      return;
    }

    if (filteredItems.length === 0) {
      alert(t('cartPage.noNewItems'));
      return;
    }

    const totalPrice = filteredItems.reduce((total, item) => total + item.price, 0);
    const description =
      filteredItems.length === 1
        ? t('cartPage.purchaseDescription', { title: filteredItems[0].title })
        : t('cartPage.cartPurchaseDescription', { count: filteredItems.length });

    const purchaseItems = filteredItems.map(item => ({
      sheetId: item.sheet_id,
      sheetTitle: item.title,
      price: item.price,
    }));

    console.log('[cart-paypal] Setting pendingPurchase:', {
      totalPriceKrw: totalPrice,
      itemCount: purchaseItems.length,
      description,
    });

    setPendingPurchase({
      targetItemIds,
      items: purchaseItems,
      amount: totalPrice,
      description,
    });
    setPaymentProcessing(false);
    setBankTransferInfo(null);
    setShowPaymentSelector(true);
  };

  const handlePurchaseSelected = async () => {
    await handlePurchase(selectedItems);
  };

  const handlePurchaseAll = async () => {
    const allItemIds = cartItems.map(item => item.id);
    await handlePurchase(allItemIds);
  };

  const completeOnlinePurchase = async (
    method: 'card' | 'bank_transfer' | 'paypal' | 'kakaopay',
    options?: { depositorName?: string },
  ) => {
    if (!user || !pendingPurchase) return;

    const purchaseResult = await startSheetPurchase({
      userId: user.id,
      items: pendingPurchase.items,
      amount: pendingPurchase.amount,
      paymentMethod: method,
      description: pendingPurchase.description,
      buyerName: user.email ?? null,
      buyerEmail: user.email ?? null,
      // returnUrl은 productPurchase에서 자동으로 Edge Function URL 사용
      depositorName: options?.depositorName,
    });

    const removed = await removeSelectedItems(pendingPurchase.targetItemIds);
    if (!removed) {
      console.warn(t('cartPage.console.cartUpdateAfterPaymentError'));
    }

    setSelectedItems(prev =>
      prev.filter(id => !pendingPurchase.targetItemIds.includes(id)),
    );

    if (method === 'bank_transfer') {
      setBankTransferInfo(purchaseResult.virtualAccountInfo ?? null);
      alert(t('cartPage.bankTransferCreated'));
    } else if (method === 'paypal') {
      setBankTransferInfo(null);
      // PayPal은 리다이렉트되므로 알림 불필요
    } else if (method === 'kakaopay') {
      setBankTransferInfo(null);
      // 카카오페이는 결제창이 열리므로 알림 불필요
    } else {
      setBankTransferInfo(null);
      alert(t('cartPage.paymentWindowOpen'));
    }
  };

  const handlePayPalSuccess = async (response: any) => {
    console.log('[cart-paypal] PayPal payment success:', response);
    setShowPayPalModal(false);

    if (!pendingPurchase) {
      console.warn('[cart-paypal] pendingPurchase is null after success');
      return;
    }

    const removed = await removeSelectedItems(pendingPurchase.targetItemIds);
    if (!removed) {
      console.warn(t('cartPage.console.cartUpdateAfterPaymentError'));
    }

    setSelectedItems(prev =>
      prev.filter(id => !pendingPurchase.targetItemIds.includes(id)),
    );

    alert(t('cartPage.purchaseComplete'));
    router.push('/my-orders');
    // PayPal 결제 완료 후에만 pendingPurchase를 null로 설정
    setPendingPurchase(null);
    setProcessing(false);
    setPaymentProcessing(false);
  };

  const handlePaymentMethodSelect = async (method: PaymentMethod) => {
    if (!user || !pendingPurchase) return;

    setShowPaymentSelector(false);

    if (method === 'bank') {
      setShowBankTransferModal(true);
      return;
    }

    setProcessing(true);
    setPaymentProcessing(true);

    try {
      if (method === 'paypal') {
        // PayPal 모달을 열기 전에 pendingPurchase를 유지해야 함
        // 모달이 닫힐 때까지 pendingPurchase를 유지
        setShowPayPalModal(true);
        setProcessing(false);
        setPaymentProcessing(false);
        // pendingPurchase는 PayPal 결제 완료 후에만 null로 설정
        return;
      }

      if (method === 'kakaopay') {
        // 카카오페이 결제 처리
        try {
          await completeOnlinePurchase('kakaopay');
          // 카카오페이는 결제창이 열리므로 여기서는 처리만 하고 pendingPurchase는 Webhook에서 처리 후 정리
        } catch (error) {
          console.error('[cart] KakaoPay 결제 오류:', error);
          alert(error instanceof Error ? error.message : t('cartPage.paymentError'));
        } finally {
          setProcessing(false);
          setPaymentProcessing(false);
        }
        return;
      }

      // legacy: 카드 결제는 현재 비활성화 (포트원 심사 진행 중)
      // await completeOnlinePurchase('card');

      // 한국 사이트에서는 무통장 입금만 가능
      alert(t('cartPage.bankTransferOnly') || '현재 무통장 입금만 가능합니다.');
    } catch (error) {
      console.error(t('cartPage.console.paymentProcessingError'), error);
      alert(error instanceof Error ? error.message : t('cartPage.paymentError'));
    } finally {
      // PayPal이 아닌 경우에만 pendingPurchase를 null로 설정
      if (method !== 'paypal') {
        setProcessing(false);
        setPaymentProcessing(false);
        setPendingPurchase(null);
      }
    }
  };

  const handleBankTransferConfirm = async (depositorName: string) => {
    if (!user || !pendingPurchase) return;

    setShowBankTransferModal(false);
    setProcessing(true);
    setPaymentProcessing(true);

    try {
      await completeOnlinePurchase('bank_transfer', { depositorName });
    } catch (error) {
      console.error(t('cartPage.console.bankTransferProcessingError'), error);
      alert(error instanceof Error ? error.message : t('cartPage.paymentError'));
    } finally {
      setProcessing(false);
      setPaymentProcessing(false);
      setPendingPurchase(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 space-y-6">
        {bankTransferInfo ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-blue-900">{t('cartPage.bankTransferInfo')}</h3>
              <button
                type="button"
                onClick={() => setBankTransferInfo(null)}
                className="text-blue-600 hover:text-blue-800 text-xs"
              >
                {t('cartPage.close')}
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <span className="font-medium text-gray-900">{t('cartPage.bank')}</span> {bankTransferInfo.bankName}
              </div>
              <div>
                <span className="font-medium text-gray-900">{t('cartPage.accountNumber')}</span> {bankTransferInfo.accountNumber}
              </div>
              <div>
                <span className="font-medium text-gray-900">{t('cartPage.accountHolder')}</span> {bankTransferInfo.depositor}
              </div>
              <div>
                <span className="font-medium text-gray-900">{t('cartPage.depositAmount')}</span>{' '}
                {formatPriceValue(bankTransferInfo.amount ?? 0)}
              </div>
              {bankTransferInfo.expectedDepositor ? (
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-900">{t('cartPage.depositorName')}</span>{' '}
                  <span className="text-blue-600 font-semibold">
                    {bankTransferInfo.expectedDepositor}
                  </span>
                </div>
              ) : null}
            </div>
            {bankTransferInfo.message ? (
              <p className="mt-3 text-xs text-gray-600">{bankTransferInfo.message}</p>
            ) : null}
          </div>
        ) : null}

        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">{t('cartPage.title')}</h1>
            <p className="text-gray-600 mt-1">{t('cartPage.totalItems', { count: cartItems.length })}</p>
          </div>

          {cartItems.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                <i className="ri-shopping-cart-line text-2xl text-gray-400"></i>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('cartPage.empty')}</h3>
              <p className="text-gray-600">{t('cartPage.emptyDescription')}</p>
              <button
                onClick={() => router.push('/categories')}
                className="mt-6 inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('cartPage.browseSheets')}
              </button>
            </div>
          ) : (
            <>
              {/* 선택/삭제 컨트롤 */}
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedItems.length === cartItems.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      {t('cartPage.selectAll', { selected: selectedItems.length, total: cartItems.length })}
                    </span>
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleRemoveSelected}
                    disabled={selectedItems.length === 0}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('cartPage.deleteSelected')}
                  </button>
                  <button
                    onClick={handleClearCart}
                    className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    {t('cartPage.deleteAll')}
                  </button>
                </div>
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

                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt={item.title} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <i className="ri-music-2-line text-2xl text-white"></i>
                      )}
                    </div>

                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{item.title}</h3>
                      <p className="text-sm text-gray-600">{item.artist}</p>
                      <p className="text-xs text-gray-500 mt-1">{item.category}</p>
                    </div>

                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{formatPriceValue(item.price)}</p>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <i className="ri-close-line text-xl"></i>
                    </button>
                  </div>
                ))}
              </div>

              {/* 결제 정보 */}
              <div className="p-6 bg-gray-50 border-t border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-medium text-gray-900">
                    {t('cartPage.selectedItems', { count: selectedItems.length })}
                  </span>
                  <div className="flex flex-col items-end">
                    <span className="text-2xl font-bold text-blue-600">
                      {formatPriceValue(getTotalPrice(selectedItems))}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={handlePurchaseSelected}
                    disabled={selectedItems.length === 0 || processing || paymentProcessing}
                    className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {processing || paymentProcessing ? t('cartPage.processing') : t('cartPage.orderSelected')}
                  </button>
                  <button
                    onClick={handlePurchaseAll}
                    disabled={cartItems.length === 0 || processing || paymentProcessing}
                    className="flex-1 bg-gray-800 text-white py-3 px-6 rounded-lg font-medium hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {processing || paymentProcessing ? t('cartPage.processing') : t('cartPage.orderAll')}
                  </button>
                </div>
                <div className="mt-4">
                  <button
                    onClick={() => router.push('/categories')}
                    className="w-full py-3 px-6 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors"
                  >
                    {t('cartPage.continueShopping')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <BankTransferInfoModal
          open={showBankTransferModal}
          amount={pendingPurchase?.amount ?? 0}
          userName={(user?.user_metadata?.name as string | undefined) ?? user?.email ?? undefined}
          onConfirm={handleBankTransferConfirm}
          onClose={() => {
            setShowBankTransferModal(false);
            setShowPaymentSelector(true);
          }}
        />

        <PaymentMethodSelector
          open={showPaymentSelector}
          amount={pendingPurchase?.amount ?? 0}
          onClose={() => {
            setShowPaymentSelector(false);
            setPendingPurchase(null);
            setPaymentProcessing(false);
          }}
          onSelect={handlePaymentMethodSelect}
          context="buyNow"
          userCredits={credits}
        />

        {showPayPalModal && pendingPurchase && (
          <PayPalPaymentModal
            open={showPayPalModal}
            amount={pendingPurchase.amount}
            orderTitle={pendingPurchase.description}
            onClose={() => {
              setShowPayPalModal(false);
              // 모달이 닫힐 때 pendingPurchase를 유지 (사용자가 다시 열 수 있도록)
            }}
            onSuccess={handlePayPalSuccess}
            onError={(error) => {
              console.error('[cart-paypal] PayPal payment error:', error);
              setShowPayPalModal(false);
            }}
            initiatePayment={handlePayPalPayment}
          />
        )}
      </div>
    </div>
  );
}