/**
 * 결제 완료 후 주문 처리 공통 함수
 * 
 * 무통장 입금 확인, PayPal 성공, 포트원 카드/카카오페이 성공 등
 * 모든 결제수단의 결제 완료 후처리를 통합 처리합니다.
 * 
 * @param orderId - 주문 ID
 * @param paymentMethod - 결제수단 ('bank_transfer', 'paypal', 'card', 'kakaopay' 등)
 * @param options - 추가 옵션
 */
import { supabase } from '../supabase';
import type { PaymentMethod } from './types';
import { calculateExpectedCompletionDate, formatDateToYMD } from '@/utils/businessDays';

interface CompleteOrderAfterPaymentOptions {
  /** 트랜잭션 ID (PG사 거래 ID 또는 수동 확인 ID) */
  transactionId?: string;
  /** 결제 확인 시각 (기본값: 현재 시각) */
  paymentConfirmedAt?: string;
  /** 입금자명 (무통장 입금 시) */
  depositorName?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
  /** 결제 제공자 (예: 'portone', 'inicis', 'payaction', 'manual') */
  paymentProvider?: string;
  /** 원시 응답 데이터 (PG사 응답 등) */
  rawResponse?: unknown;
}

/**
 * 주문 완료 후처리
 * - 주문 상태를 'completed', payment_status를 'paid'로 업데이트
 * - 캐시 충전인 경우 사용자 캐시 잔액 증가
 * - 악보 구매인 경우 다운로드 권한 활성화 (purchases 테이블에 기록)
 */
export const completeOrderAfterPayment = async (
  orderId: string,
  paymentMethod: PaymentMethod,
  options: CompleteOrderAfterPaymentOptions = {},
): Promise<void> => {
  const {
    transactionId,
    paymentConfirmedAt = new Date().toISOString(),
    depositorName,
    metadata = {},
    paymentProvider,
    rawResponse,
  } = options;

  // 주문 정보 조회
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(
      `
      id,
      user_id,
      total_amount,
      status,
      payment_status,
      payment_confirmed_at,
      expected_completion_date,
      metadata,
      order_items (
        id,
        drum_sheet_id,
        price
      )
    `,
    )
    .eq('id', orderId)
    .single();

  if (orderError) {
    console.error('[completeOrderAfterPayment] 주문 조회 실패', orderError);
    throw new Error('주문을 찾을 수 없습니다.');
  }

  if (!order) {
    throw new Error('주문이 존재하지 않습니다.');
  }

  // order_items가 제대로 조회되지 않은 경우 별도로 조회
  let orderItems = order.order_items;
  if (!orderItems || orderItems.length === 0) {
    console.log('[completeOrderAfterPayment] ⚠️ 관계 조회로 order_items를 가져오지 못함, 별도 조회 시도:', {
      orderId,
      orderItemsFromRelation: order.order_items,
    });
    
    const { data: itemsData, error: itemsError } = await supabase
      .from('order_items')
      .select('id, drum_sheet_id, price')
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('[completeOrderAfterPayment] order_items 별도 조회 실패:', itemsError);
    } else if (itemsData && itemsData.length > 0) {
      orderItems = itemsData;
      console.log('[completeOrderAfterPayment] ✅ order_items 별도 조회 성공:', {
        orderId,
        itemsCount: itemsData.length,
      });
    }
  }

  // 이미 결제 완료된 경우 예상 완료일만 확인하고 업데이트
  const isAlreadyCompleted = order.payment_status === 'paid' || order.status === 'completed';
  
  if (isAlreadyCompleted) {
    console.log('[completeOrderAfterPayment] 이미 결제 완료된 주문, 예상 완료일 확인:', { orderId });
    
    // 예상 완료일이 없는 선주문 상품인 경우 예상 완료일 계산 및 업데이트
    if (!order.expected_completion_date && orderItems && orderItems.length > 0) {
      const uniqueSheetIds = [...new Set(orderItems.map((item: any) => item.drum_sheet_id).filter(Boolean))];
      
      if (uniqueSheetIds.length > 0) {
        const { data: sheets, error: sheetsError } = await supabase
          .from('drum_sheets')
          .select('id, sales_type')
          .in('id', uniqueSheetIds);

        if (!sheetsError && sheets) {
          const hasPreorderItems = sheets.some((sheet) => sheet.sales_type === 'PREORDER');
          
          if (hasPreorderItems) {
            // 결제 확인일 기준으로 예상 완료일 계산
            const paymentConfirmedAtForCalc = order.payment_confirmed_at || paymentConfirmedAt;
            const expectedCompletionDate = calculateExpectedCompletionDate(paymentConfirmedAtForCalc);
            const expectedCompletionDateStr = formatDateToYMD(expectedCompletionDate);

            console.log('[completeOrderAfterPayment] ✅ 이미 완료된 주문의 예상 완료일 계산 및 업데이트:', {
              orderId,
              paymentDate: paymentConfirmedAtForCalc,
              expectedCompletionDate: expectedCompletionDateStr,
            });

            // 예상 완료일만 업데이트
            const { error: updateError } = await supabase
              .from('orders')
              .update({ expected_completion_date: expectedCompletionDateStr })
              .eq('id', orderId);

            if (updateError) {
              console.error('[completeOrderAfterPayment] 예상 완료일 업데이트 실패:', updateError);
            } else {
              console.log('[completeOrderAfterPayment] ✅ 예상 완료일 업데이트 성공');
            }
          }
        }
      }
    }
    
    // 이미 완료된 주문이므로 나머지 처리는 건너뜀
    return;
  }

  const isCashCharge =
    ((order.metadata as Record<string, unknown> | null)?.type === 'cash_charge' ||
      (order.metadata as Record<string, unknown> | null)?.purpose === 'cash_charge') &&
    (!orderItems || orderItems.length === 0);

  const isSheetPurchase = orderItems && orderItems.length > 0;

  // 1. 캐시 충전 처리
  if (isCashCharge) {
    const chargeAmount = Math.max(0, order.total_amount ?? 0);
    const bonusAmount = Number(
      (order.metadata as Record<string, unknown> | null)?.bonusAmount ?? 0,
    );

    // 사용자 캐시 잔액 조회
    const {
      data: profile,
      error: profileError,
    } = await supabase.from('profiles').select('credits').eq('id', order.user_id).single();

    if (profileError) {
      console.error('[completeOrderAfterPayment] 프로필 조회 실패', profileError);
      throw new Error('사용자 정보를 조회할 수 없습니다.');
    }

    const currentCredits = profile?.credits ?? 0;
    const newCredits = currentCredits + chargeAmount + bonusAmount;

    // 캐시 잔액 업데이트
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', order.user_id);

    if (updateProfileError) {
      console.error('[completeOrderAfterPayment] 캐시 업데이트 실패', updateProfileError);
      throw new Error('캐시 충전에 실패했습니다.');
    }

    // 캐시 거래 내역 기록
    const { error: cashTxError } = await supabase.from('cash_transactions').insert([
      {
        user_id: order.user_id,
        transaction_type: 'charge',
        amount: chargeAmount,
        bonus_amount: bonusAmount,
        balance_after: newCredits,
        description: `결제 완료: ${paymentMethod}`,
        created_by: order.user_id,
        order_id: order.id,
      },
    ]);

    if (cashTxError) {
      console.warn('[completeOrderAfterPayment] 캐시 거래 내역 기록 실패', cashTxError);
      // 거래 내역 기록 실패는 치명적이지 않으므로 경고만 출력
    }

    console.log('[completeOrderAfterPayment] 캐시 충전 완료', {
      orderId,
      chargeAmount,
      bonusAmount,
      newCredits,
    });
  }

  // 2. 악보 구매 처리 (purchases 테이블에 기록)
  // 선주문 상품의 예상 완료일 계산을 위한 변수
  let expectedCompletionDateStr: string | null = null;

  if (isSheetPurchase && orderItems) {
    // 디버깅: order_items 확인
    console.log('[completeOrderAfterPayment] 📦 order_items 확인:', {
      orderId,
      orderItemsCount: orderItems?.length ?? 0,
      orderItems: orderItems?.map((item: any) => ({
        id: item.id,
        drum_sheet_id: item.drum_sheet_id,
        price: item.price,
      })),
    });

    const PURCHASE_LOG_ENABLED = true; // 필요시 환경변수로 제어

    if (PURCHASE_LOG_ENABLED) {
      const purchaseRecords = orderItems.map((item: any) => ({
        user_id: order.user_id,
        drum_sheet_id: item.drum_sheet_id,
        order_id: order.id,
        price_paid: item.price ?? 0,
      }));

      const { error: purchasesError } = await supabase
        .from('purchases')
        .insert(purchaseRecords);

      if (purchasesError) {
        if (purchasesError.code === 'PGRST205') {
          // purchases 테이블이 없는 경우 경고만 출력
          console.warn(
            '[completeOrderAfterPayment] purchases 테이블이 없어 구매 내역 기록을 건너뜁니다.',
            purchasesError,
          );
        } else {
          console.error('[completeOrderAfterPayment] 구매 내역 기록 실패', purchasesError);
          // 구매 내역 기록 실패는 치명적이지 않으므로 경고만 출력
        }
      } else {
        console.log('[completeOrderAfterPayment] 구매 내역 기록 완료', {
          orderId,
          itemCount: purchaseRecords.length,
        });
      }
    }

    // 2-1. 선주문 상품의 preorder_deadline 자동 세팅
    // 상품 단위로 처음 결제될 때만 deadline을 설정 (이미 설정된 경우는 업데이트하지 않음)
    const uniqueSheetIds = [...new Set(orderItems.map((item: any) => item.drum_sheet_id).filter(Boolean))];
    
    console.log('[completeOrderAfterPayment] 🔍 선주문 상품 확인:', {
      orderId,
      uniqueSheetIdsCount: uniqueSheetIds.length,
      uniqueSheetIds,
      orderItemsCount: order.order_items?.length ?? 0,
    });
    
    if (uniqueSheetIds.length > 0) {
      // 각 상품의 sales_type과 preorder_deadline 조회
      const { data: sheets, error: sheetsError } = await supabase
        .from('drum_sheets')
        .select('id, sales_type, preorder_deadline')
        .in('id', uniqueSheetIds);

      if (!sheetsError && sheets) {
        console.log('[completeOrderAfterPayment] 📋 상품 정보 조회 성공:', {
          orderId,
          sheetsCount: sheets.length,
          sheets: sheets.map((s) => ({
            id: s.id,
            sales_type: s.sales_type,
            preorder_deadline: s.preorder_deadline,
          })),
        });

        // PREORDER 상품 중 preorder_deadline이 비어있는 것만 업데이트
        const preorderSheetsWithoutDeadline = sheets.filter(
          (sheet) => sheet.sales_type === 'PREORDER' && !sheet.preorder_deadline
        );

        if (preorderSheetsWithoutDeadline.length > 0) {
          // 현재 시간 + 3일 계산
          const deadlineDate = new Date();
          deadlineDate.setDate(deadlineDate.getDate() + 3);
          const deadlineISO = deadlineDate.toISOString();

          const sheetIdsToUpdate = preorderSheetsWithoutDeadline.map((sheet) => sheet.id);

          const { error: updateDeadlineError } = await supabase
            .from('drum_sheets')
            .update({ preorder_deadline: deadlineISO })
            .in('id', sheetIdsToUpdate);

          if (updateDeadlineError) {
            console.error('[completeOrderAfterPayment] 선주문 완성 예정일 설정 실패', updateDeadlineError);
            // 실패해도 치명적이지 않으므로 경고만 출력
          } else {
            console.log('[completeOrderAfterPayment] 선주문 완성 예정일 설정 완료', {
              orderId,
              updatedSheets: sheetIdsToUpdate.length,
              deadline: deadlineISO,
            });
          }
        }

        // 2-2. 주문의 expected_completion_date 계산 및 저장
        // 선주문 상품이 포함된 주문인지 확인
        const hasPreorderItems = sheets.some((sheet) => sheet.sales_type === 'PREORDER');
        
        console.log('[completeOrderAfterPayment] 🔍 선주문 상품 확인 결과:', {
          orderId,
          hasPreorderItems,
          sheetCount: sheets.length,
          preorderSheetCount: sheets.filter((s) => s.sales_type === 'PREORDER').length,
          allSalesTypes: sheets.map((s) => s.sales_type),
        });
        
        if (hasPreorderItems) {
          // 결제 확인일 기준으로 예상 완료일 계산 (한국 시간 기준, 마감 시간 규칙 적용)
          const expectedCompletionDate = calculateExpectedCompletionDate(paymentConfirmedAt);
          expectedCompletionDateStr = formatDateToYMD(expectedCompletionDate);

          console.log('[completeOrderAfterPayment] ✅ 선주문 예상 완료일 계산 완료', {
            orderId,
            paymentDate: paymentConfirmedAt,
            expectedCompletionDate: expectedCompletionDateStr,
            timezone: 'Asia/Seoul (KST)',
            hasPreorderItems: true,
            sheetCount: sheets.length,
            preorderSheetCount: sheets.filter((s) => s.sales_type === 'PREORDER').length,
          });
        } else {
          console.log('[completeOrderAfterPayment] ℹ️ 선주문 상품 없음 (예상 완료일 계산 건너뜀)', {
            orderId,
            sheetCount: sheets.length,
            sheetSalesTypes: sheets.map((s) => s.sales_type),
          });
        }
      } else if (sheetsError) {
        console.error('[completeOrderAfterPayment] ❌ 상품 정보 조회 실패 (preorder_deadline 설정 건너뜀):', {
          orderId,
          error: sheetsError,
          uniqueSheetIds,
        });
      } else {
        console.warn('[completeOrderAfterPayment] ⚠️ 상품 정보 조회 결과가 null:', {
          orderId,
          uniqueSheetIds,
          sheets,
        });
      }
    }
  }

  // 3. 주문 상태 업데이트
  const finalTransactionId =
    transactionId || (order.transaction_id && order.transaction_id.trim().length > 0
      ? order.transaction_id
      : `manual-${Date.now()}`);

  const updatePayload: Record<string, unknown> = {
    status: 'completed',
    payment_status: 'paid',
    payment_method: paymentMethod, // 결제수단을 항상 명시적으로 업데이트
    raw_status: 'payment_confirmed',
    payment_confirmed_at: paymentConfirmedAt,
    transaction_id: finalTransactionId,
    metadata: {
      ...((order.metadata as Record<string, unknown> | null) || {}),
      ...metadata,
      completedBy: paymentProvider || 'manual',
      completedAt: paymentConfirmedAt,
    },
  };

  if (depositorName) {
    updatePayload.depositor_name = depositorName;
  }

  // 선주문 상품인 경우 예상 완료일 추가
  if (expectedCompletionDateStr) {
    updatePayload.expected_completion_date = expectedCompletionDateStr;
    console.log('[completeOrderAfterPayment] 📅 예상 완료일을 updatePayload에 추가:', {
      orderId,
      expected_completion_date: expectedCompletionDateStr,
    });
  } else {
    console.log('[completeOrderAfterPayment] ℹ️ 예상 완료일 없음 (일반 상품 또는 계산 실패)', {
      orderId,
      expectedCompletionDateStr,
    });
  }

  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId);

  if (orderUpdateError) {
    console.error('[completeOrderAfterPayment] ❌ 주문 상태 업데이트 실패', {
      orderId,
      code: orderUpdateError.code,
      message: orderUpdateError.message,
      details: orderUpdateError.details,
      hint: orderUpdateError.hint,
      updatePayload,
      error: orderUpdateError,
    });
    throw new Error('주문 상태 업데이트에 실패했습니다.');
  }

  console.log('[completeOrderAfterPayment] ✅ 주문 상태 업데이트 성공', {
    orderId,
    expected_completion_date: updatePayload.expected_completion_date || '없음',
    status: updatePayload.status,
    payment_status: updatePayload.payment_status,
  });

  // 4. 결제 거래 로그 업데이트
  const { error: paymentLogError } = await supabase
    .from('payment_transactions')
    .update({
      status: 'paid',
      pg_transaction_id: finalTransactionId,
      raw_response: rawResponse ?? null,
      updated_at: paymentConfirmedAt,
    })
    .eq('order_id', orderId);

  if (paymentLogError) {
    console.warn('[completeOrderAfterPayment] 결제 로그 업데이트 실패', paymentLogError);
    // 결제 로그 업데이트 실패는 치명적이지 않으므로 경고만 출력
  }

  console.log('[completeOrderAfterPayment] 주문 완료 처리 성공', {
    orderId,
    paymentMethod,
    isCashCharge,
    isSheetPurchase,
  });
};


























