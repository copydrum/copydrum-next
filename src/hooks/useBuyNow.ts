'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { hasPurchasedSheet } from '../lib/purchaseCheck';
import { buySheetNow, startSheetPurchase } from '../lib/payments';
import type { VirtualAccountInfo } from '../lib/payments';
import type { PaymentMethod, PaymentMethodOption } from '../components/payments';
import { processCashPurchase } from '../lib/cashPurchases';
import { supabase } from '../lib/supabase'; // ✅ DB 직접 조회용
import { useGuestCheckoutStore } from '../stores/guestCheckoutStore';

// 은행 코드 한글 변환 맵
const BANK_CODE_MAP: Record<string, string> = {
  'NH_NONGHYUP_BANK': 'NH농협은행',
  'KB_BANK': 'KB국민은행',
  'KOOKMIN_BANK': 'KB국민은행', 
  'SHINHAN_BANK': '신한은행',
  'WOORI_BANK': '우리은행',
  'IBK_BANK': 'IBK기업은행',
  'HANA_BANK': '하나은행',
  'KEB_HANA_BANK': '하나은행',
  'KAKAO_BANK': '카카오뱅크',
  'K_BANK': '케이뱅크',
  'BUSAN_BANK': '부산은행',
  'DAEGU_BANK': 'iM뱅크(대구은행)',
  'POST_OFFICE': '우체국',
  'SC_BANK': 'SC제일은행',
  'SUHYUP_BANK': 'Sh수협은행',
  'GYEONGNAM_BANK': '경남은행',
  'JEONBUK_BANK': '전북은행',
  'JEJU_BANK': '제주은행',
  'CITI_BANK': '한국씨티은행',
  'SAEMAUL_GEUMGO': '새마을금고',
  'SHINHYUP_BANK': '신협',
  'SAVING_BANK': '저축은행',
  'SANLIM_BANK': '산림조합',
  'TOSS_BANK': '토스뱅크',
  'NONGHYUP_BANK': 'NH농협은행',
};

export interface SheetForBuyNow {
  id: string;
  title: string;
  price: number;
}

export interface UseBuyNowReturn {
  showPaymentSelector: boolean;
  showBankTransferModal: boolean;
  showPayPalModal: boolean;
  showVirtualAccountModal: boolean;
  bankTransferInfo: VirtualAccountInfo | null;
  virtualAccountInfo: VirtualAccountInfo | null;
  paymentProcessing: boolean;
  pendingSheet: SheetForBuyNow | null;
  handleBuyNow: (sheet: SheetForBuyNow) => Promise<void>;
  handlePaymentMethodSelect: (method: PaymentMethod, option?: PaymentMethodOption) => void;
  handleBankTransferConfirm: (depositorName: string) => Promise<void>;
  handlePayPalInitiate: (elementId: string) => Promise<void>;
  closePaymentSelector: () => void;
  closeBankTransferModal: () => void;
  closePayPalModal: () => void;
  closeVirtualAccountModal: () => void;
}

export function useBuyNow(user: User | null): UseBuyNowReturn {
  const router = useRouter();
  const { t } = useTranslation();

  const [showPaymentSelector, setShowPaymentSelector] = useState(false);
  const [showBankTransferModal, setShowBankTransferModal] = useState(false);
  const [showPayPalModal, setShowPayPalModal] = useState(false);
  const [showVirtualAccountModal, setShowVirtualAccountModal] = useState(false);
  const [bankTransferInfo, setBankTransferInfo] = useState<VirtualAccountInfo | null>(null);
  const [virtualAccountInfo, setVirtualAccountInfo] = useState<VirtualAccountInfo | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [pendingSheet, setPendingSheet] = useState<SheetForBuyNow | null>(null);

  const handleBuyNow = useCallback(
    async (sheet: SheetForBuyNow) => {
      if (!user) {
        // 비로그인 시: 로그인 페이지로 보내는 대신 게스트 결제 모달을 띄운다.
        // 바로구매하려던 상품을 함께 넘겨, 이메일 입력 후 세션이 수립되면
        // 모달이 곧바로 주문을 생성하고 결제 페이지로 이동시키도록 한다.
        const redirectPath = window.location.pathname + window.location.search;
        useGuestCheckoutStore.getState().open(redirectPath, {
          id: sheet.id,
          title: sheet.title,
          price: sheet.price,
        });
        return;
      }
      try {
        const alreadyPurchased = await hasPurchasedSheet(user.id, sheet.id);
        if (alreadyPurchased) {
          alert(t('categoriesPage.alreadyPurchased', { title: sheet.title }));
          return;
        }
      } catch (error) {
        console.error('바로구매 전 구매 이력 확인 오류:', error);
        alert(t('categoriesPage.purchaseCheckError'));
        return;
      }

      // 주문 생성하고 결제 페이지로 이동
      setPaymentProcessing(true);
      try {
        const response = await fetch('/api/orders/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            items: [
              {
                sheetId: sheet.id,
                title: sheet.title,
                price: sheet.price,
              },
            ],
            amount: sheet.price,
            description: t('categoriesPage.purchaseDescription', { title: sheet.title }),
          }),
        });

        const result = await response.json();

        if (result.success && result.orderId) {
          // 새로운 결제 페이지로 이동 (도도페이먼츠 포함)
          router.push(`/payments/${result.orderId}`);
        } else {
          alert(result.error || '주문 생성에 실패했습니다.');
        }
      } catch (error) {
        console.error('[useBuyNow] 주문 생성 오류:', error);
        alert('주문 생성 중 오류가 발생했습니다.');
      } finally {
        setPaymentProcessing(false);
      }
    },
    [user, router, t]
  );

  const handlePaymentMethodSelect = useCallback(
    async (method: PaymentMethod, option?: PaymentMethodOption) => {
      if (!user || !pendingSheet) return;
      setShowPaymentSelector(false);
      const price = Math.max(0, pendingSheet.price ?? 0);

      if (method === 'bank_transfer') {
        setShowBankTransferModal(true);
        return;
      }
      if (method === 'paypal') {
        setShowPayPalModal(true);
        return;
      }

      if (method === 'kakaopay') {
        setPaymentProcessing(true);
        try {
          await startSheetPurchase({
            userId: user.id,
            items: [{ sheetId: pendingSheet.id, sheetTitle: pendingSheet.title, price }],
            amount: price,
            paymentMethod: 'kakaopay',
            description: t('categoriesPage.purchaseDescription', { title: pendingSheet.title }),
            buyerName: user.email ?? null,
            buyerEmail: user.email ?? null,
            onSuccess: (response) => {
              console.log('[useBuyNow] KakaoPay 결제 성공', response);
              // ✅ 카카오페이 성공 시 -> 구매내역으로 이동
              router.push('/purchases');
              setPaymentProcessing(false);
              setPendingSheet(null);
            },
            onError: (error) => {
              console.error('[useBuyNow] KakaoPay 실패', error);
              setPaymentProcessing(false);
              setPendingSheet(null);
              alert('결제 중 오류가 발생했습니다.');
            },
          });
        } catch (error) {
          setPaymentProcessing(false);
          setPendingSheet(null);
        }
        return;
      }

      if (method === 'card' || method === 'virtual_account' || method === 'transfer') {
        if (!option || !option.payMethod) {
          alert('결제 수단 정보가 올바르지 않습니다.');
          return;
        }
        setPaymentProcessing(true);

        try {
          await startSheetPurchase({
            userId: user.id,
            items: [{ sheetId: pendingSheet.id, sheetTitle: pendingSheet.title, price }],
            amount: price,
            paymentMethod: 'inicis',
            inicisPayMethod: option.payMethod as 'CARD' | 'VIRTUAL_ACCOUNT' | 'TRANSFER',
            description: t('categoriesPage.purchaseDescription', { title: pendingSheet.title }),
            buyerName: user.email ?? null,
            buyerEmail: user.email ?? null,
            onSuccess: async (response) => {
              console.log('[useBuyNow] 결제 성공 응답:', response);

              if (option.payMethod === 'VIRTUAL_ACCOUNT') {
                let vaInfo = response.virtualAccountInfo;
                
                // 🔥 [필살기] SDK 정보가 없으면, 내 최신 주문 내역을 뒤져서 찾아냅니다.
                // ID 매칭 실패 가능성을 원천 차단합니다.
                if (!vaInfo) {
                  console.log(`[useBuyNow] 계좌정보 대기중... (사용자 최신 주문 조회)`);
                  
                  // 최대 5초간 반복 확인
                  for (let i = 0; i < 5; i++) {
                    await new Promise((r) => setTimeout(r, 1000)); // 1초 대기
                    
                    const { data } = await supabase
                      .from('orders')
                      .select('virtual_account_info, created_at')
                      .eq('user_id', user.id) // 내 주문 중에서
                      .not('virtual_account_info', 'is', null) // 계좌정보가 있는 것만
                      .order('created_at', { ascending: false }) // 가장 최신순으로
                      .limit(1) // 딱 1개만
                      .maybeSingle();

                    if (data?.virtual_account_info) {
                      // 혹시나 너무 옛날 주문이 걸리지 않게, 최근 5분 내 주문인지 확인
                      const orderTime = new Date(data.created_at).getTime();
                      const now = new Date().getTime();
                      if (now - orderTime > 5 * 60 * 1000) {
                         console.log(`[useBuyNow] 찾은 주문이 너무 오래됨. (5분 경과) 패스.`);
                         continue;
                      }

                      const dbVa = data.virtual_account_info as any;
                      console.log('[useBuyNow] ✨ DB에서 최신 계좌정보 확보 성공!', dbVa);
                      vaInfo = {
                        bankName: dbVa.bankName || dbVa.bank_code,
                        accountNumber: dbVa.accountNumber || dbVa.account_number,
                        accountHolder: dbVa.accountHolder || dbVa.remittee_name,
                        expiresAt: dbVa.expiresAt || dbVa.expired_at || dbVa.valid_until,
                      };
                      break; // 찾았으면 루프 종료
                    } else {
                        console.log(`[useBuyNow] ${i+1}초 경과: 아직 최신 주문 정보 없음...`);
                    }
                  }
                }

                if (vaInfo) {
                  const rawBankName = vaInfo.bankName || '';
                  const koreanBankName = BANK_CODE_MAP[rawBankName] || rawBankName;
                  const accNum = vaInfo.accountNumber || '';
                  
                  // 🔥 확실한 알림창
                  alert(`[가상계좌 발급 완료]\n\n은행: ${koreanBankName}\n계좌번호: ${accNum}\n예금주: ${vaInfo.accountHolder || '카피드럼'}\n\n이 메시지를 확인(OK) 하시면 상세 화면이 뜹니다.`);

                  setVirtualAccountInfo({
                    bankName: koreanBankName,
                    accountNumber: accNum,
                    accountHolder: vaInfo.accountHolder,
                    depositor: vaInfo.accountHolder,
                    amount: price,
                    expiresAt: vaInfo.expiresAt,
                  });
                  setShowVirtualAccountModal(true);
                } else {
                  console.error('[useBuyNow] 계좌정보 확보 실패. Response:', response);
                  alert('가상계좌 발급이 완료되었습니다.\n[마이페이지 > 구매내역]에서 계좌번호를 확인해주세요.');
                }
              } else {
                // ✅ [추가] 카드/실시간계좌이체 성공 시 -> 구매내역으로 이동
                router.push('/purchases');
              }

              setPaymentProcessing(false);
              if (option.payMethod !== 'VIRTUAL_ACCOUNT') {
                setPendingSheet(null);
              }
            },
            onError: (error) => {
              console.error('[useBuyNow] 결제 실패', error);
              setPaymentProcessing(false);
              setPendingSheet(null);
              alert('결제 중 오류가 발생했습니다.');
            },
          });
        } catch (error) {
          console.error('[useBuyNow] 오류', error);
          setPaymentProcessing(false);
          setPendingSheet(null);
          alert('결제 중 오류가 발생했습니다.');
        }
        return;
      }

      // 캐시 결제 등 기존 로직...
      if (method === 'cash') {
         setPaymentProcessing(true);
        try {
          const result = await processCashPurchase({
            userId: user.id,
            totalPrice: price,
            description: t('categoriesPage.purchaseDescription', { title: pendingSheet.title }),
            items: [
              { sheetId: pendingSheet.id, sheetTitle: pendingSheet.title, price },
            ],
            sheetIdForTransaction: pendingSheet.id,
            paymentMethod: 'cash',
          });
          if (result.success) {
            alert(t('categoriesPage.purchaseSuccess') || '구매가 완료되었습니다.');
            window.location.reload();
          } else if (result.reason === 'INSUFFICIENT_CREDIT') {
            alert(
              t('payment.notEnoughCashMessage') ||
              `보유 포인트가 부족합니다. 현재 잔액: ${result.currentCredits.toLocaleString()}원`
            );
          }
        } catch (error) {
          console.error('[useBuyNow] 포인트 결제 오류:', error);
          alert(error instanceof Error ? error.message : t('categoriesPage.purchaseError'));
        } finally {
          setPaymentProcessing(false);
          setPendingSheet(null);
        }
      }
    },
    [user, pendingSheet, t]
  );

  const handleBankTransferConfirm = useCallback(
    async (depositorName: string) => {
       if (!user || !pendingSheet) {
        alert('로그인이 필요합니다.');
        return;
      }
      const trimmedDepositorName = depositorName?.trim();
      if (!trimmedDepositorName) {
        alert('입금자명을 입력해 주세요.');
        return;
      }
      const price = Math.max(0, pendingSheet.price ?? 0);
      setPaymentProcessing(true);
      try {
        const result = await buySheetNow({
          user,
          sheet: { id: pendingSheet.id, title: pendingSheet.title, price },
          description: t('categoriesPage.purchaseDescription', { title: pendingSheet.title }),
          depositorName: trimmedDepositorName,
        });
        if (result.paymentMethod === 'bank_transfer') {
          setBankTransferInfo(result.virtualAccountInfo ?? null);
        }
      } catch (error) {
        alert('주문 생성 중 오류가 발생했습니다.');
        setShowBankTransferModal(false);
        setBankTransferInfo(null);
      } finally {
        setPaymentProcessing(false);
      }
    },
    [user, pendingSheet, t]
  );

  const handlePayPalInitiate = useCallback(
    async (elementId: string) => {
       if (!user || !pendingSheet) return;
      const sheet = pendingSheet;
      const price = Math.max(0, sheet.price ?? 0);
      await startSheetPurchase({
        userId: user.id,
        items: [{ sheetId: sheet.id, sheetTitle: sheet.title, price }],
        amount: price,
        paymentMethod: 'paypal',
        description: t('categoriesPage.purchaseDescription', { title: sheet.title }),
        buyerName: user.email ?? null,
        buyerEmail: user.email ?? null,
        elementId,
      });
    },
    [user, pendingSheet, t]
  );

  const closePaymentSelector = useCallback(() => {
    setShowPaymentSelector(false);
    setPendingSheet(null);
  }, []);

  const closeBankTransferModal = useCallback(() => {
    setShowBankTransferModal(false);
    if (!bankTransferInfo) {
      setShowPaymentSelector(true);
    } else {
      setPendingSheet(null);
      setBankTransferInfo(null);
    }
  }, [bankTransferInfo]);

  const closePayPalModal = useCallback(() => {
    setShowPayPalModal(false);
    setPendingSheet(null);
  }, []);

  const closeVirtualAccountModal = useCallback(() => {
    setShowVirtualAccountModal(false);
    setVirtualAccountInfo(null);
    setPendingSheet(null);
  }, []);

  return {
    // 옛날 결제 시스템 관련 - 더 이상 사용하지 않지만 호환성을 위해 유지
    showPaymentSelector: false,
    showBankTransferModal: false,
    showPayPalModal: false,
    showVirtualAccountModal: false,
    bankTransferInfo: null,
    virtualAccountInfo: null,
    paymentProcessing,
    pendingSheet: null,
    handleBuyNow,
    handlePaymentMethodSelect: () => {},
    handleBankTransferConfirm: async () => {},
    handlePayPalInitiate: async () => {},
    closePaymentSelector: () => {},
    closeBankTransferModal: () => {},
    closePayPalModal: () => {},
    closeVirtualAccountModal: () => {},
  };
}