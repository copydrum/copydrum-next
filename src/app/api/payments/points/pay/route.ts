import { NextRequest, NextResponse } from 'next/server';
import { calculateExpectedCompletionDate, formatDateToYMD } from '@/utils/businessDays';
import { sendPreorderNotification } from '@/lib/email/sendPreorderNotification';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import {
  applyCash,
  DuplicateCashTransactionError,
  InsufficientCashError,
} from '@/lib/payments/wallet';
import { getPayableAmount } from '@/lib/points/server';
import { isCashChargeOrder } from '@/lib/payments/cashPackages';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount, pointsToUse, userId } = body;

    if (!orderId || !amount || !pointsToUse || !userId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 🔒 세션 인증: 본인 계정의 포인트만 사용할 수 있다.
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }
    if (authUser.id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const supabase = createServiceRoleClient();

    // 🔒 주문 소유권 및 금액 검증: 본인 주문이고, 결제 금액이 주문 총액과 일치해야 한다.
    const { data: orderRow, error: orderLookupError } = await supabase
      .from('orders')
      .select('id, user_id, total_amount, points_used, status, payment_status, order_type, metadata')
      .eq('id', orderId)
      .single();

    if (orderLookupError || !orderRow) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }
    if (orderRow.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }
    if (isCashChargeOrder(orderRow)) {
      return NextResponse.json(
        { success: false, error: 'Cash charge orders cannot be paid with cash' },
        { status: 400 }
      );
    }
    if (orderRow.payment_status === 'paid' || orderRow.status === 'completed') {
      return NextResponse.json({
        success: true,
        message: '이미 완료된 주문입니다.',
        orderId,
      });
    }
    // 서버가 신뢰하는 결제할 금액(주문 총액 - 사용 포인트)을 강제한다 (클라이언트 amount 신뢰 금지).
    const serverAmount = getPayableAmount(orderRow);
    if (serverAmount <= 0 || Math.round(Number(amount)) !== serverAmount) {
      return NextResponse.json(
        { success: false, error: 'Amount mismatch' },
        { status: 400 }
      );
    }

    if (Math.round(Number(pointsToUse)) < serverAmount) {
      return NextResponse.json(
        { success: false, error: 'Points amount is less than order amount' },
        { status: 400 }
      );
    }

    // 포인트 차감 (잔액 확인·차감·거래내역 기록을 DB에서 한 번에 처리)
    let remainingPoints: number;
    try {
      remainingPoints = await applyCash(supabase, {
        userId,
        amount: -serverAmount,
        type: 'use',
        description: `Points payment for order ${orderId}`,
        orderId,
      });
    } catch (deductError) {
      if (deductError instanceof InsufficientCashError) {
        return NextResponse.json(
          { success: false, error: 'Insufficient points' },
          { status: 400 }
        );
      }
      if (deductError instanceof DuplicateCashTransactionError) {
        return NextResponse.json(
          { success: false, error: 'Payment already in progress for this order' },
          { status: 409 }
        );
      }
      console.error('[Points Payment] Deduct error:', deductError);
      return NextResponse.json(
        { success: false, error: 'Failed to deduct points' },
        { status: 500 }
      );
    }

    // 선주문 상품 확인 및 예상 완료일 계산
    let expectedCompletionDateStr: string | null = null;
    const paymentConfirmedAt = new Date().toISOString();

    const { data: orderItems, error: itemsQueryError } = await supabase
      .from('order_items')
      .select('drum_sheet_id')
      .eq('order_id', orderId);

    if (!itemsQueryError && orderItems && orderItems.length > 0) {
      const sheetIds = orderItems.map((item: any) => item.drum_sheet_id).filter(Boolean);
      if (sheetIds.length > 0) {
        const { data: sheets, error: sheetsError } = await supabase
          .from('drum_sheets')
          .select('id, sales_type')
          .in('id', sheetIds);

        if (!sheetsError && sheets) {
          const hasPreorderItems = sheets.some((sheet) => sheet.sales_type === 'PREORDER');
          if (hasPreorderItems) {
            const expectedCompletionDate = calculateExpectedCompletionDate(paymentConfirmedAt);
            expectedCompletionDateStr = formatDateToYMD(expectedCompletionDate);
            console.log('[Points Payment] ✅ 선주문 예상 완료일 계산 완료:', {
              orderId,
              expectedCompletionDate: expectedCompletionDateStr,
              paymentDate: paymentConfirmedAt,
            });

            // 선주문 알림 이메일 전송
            const preorderSheetIds = new Set(
              sheets.filter((s) => s.sales_type === 'PREORDER').map((s) => s.id)
            );

            // 주문 아이템에서 선주문 악보 정보 + 제목 조회
            const { data: preorderOrderItems } = await supabase
              .from('order_items')
              .select('drum_sheet_id, sheet_title, price')
              .eq('order_id', orderId);

            const preorderItems = (preorderOrderItems || [])
              .filter((item: any) => preorderSheetIds.has(item.drum_sheet_id))
              .map((item: any) => ({
                sheetId: item.drum_sheet_id,
                sheetTitle: item.sheet_title || undefined,
                price: item.price ?? 0,
              }));

            if (preorderItems.length > 0) {
              // 사용자 이메일 조회
              let userEmail: string | undefined;
              try {
                const { data: userProfile } = await supabase
                  .from('profiles')
                  .select('email')
                  .eq('id', userId)
                  .single();
                userEmail = userProfile?.email || undefined;
              } catch {
                // 무시
              }

              sendPreorderNotification({
                orderId,
                userId,
                userEmail,
                totalAmount: serverAmount,
                paymentMethod: 'points',
                items: preorderItems,
                expectedCompletionDate: expectedCompletionDateStr,
                paymentConfirmedAt,
              }).catch((err) => {
                console.error('[Points Payment] 선주문 알림 이메일 전송 중 예외:', err);
              });
            }
          }
        } else if (sheetsError) {
          console.warn('[Points Payment] 상품 정보 조회 실패 (예상 완료일 계산 건너뜀):', sheetsError);
        }
      }
    }

    // 주문 상태 업데이트
    const updatePayload: Record<string, unknown> = {
      status: 'completed',
      payment_status: 'paid',
      payment_method: 'points',
      payment_confirmed_at: paymentConfirmedAt,
      updated_at: paymentConfirmedAt,
    };

    // 예상 완료일이 계산된 경우 추가
    if (expectedCompletionDateStr) {
      updatePayload.expected_completion_date = expectedCompletionDateStr;
      console.log('[Points Payment] 📅 저장할 예상 완료일:', expectedCompletionDateStr);
    }

    const { error: orderError } = await supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', orderId);

    if (orderError) {
      console.error('[Points Payment] Order update error:', orderError);

      try {
        await applyCash(supabase, {
          userId,
          amount: serverAmount,
          type: 'refund',
          description: `Refund: order update failed (${orderId})`,
          orderId,
        });
      } catch (refundError) {
        console.error('[Points Payment] 포인트 환불 실패 (수동 확인 필요):', { orderId, refundError });
      }

      return NextResponse.json(
        { success: false, error: 'Failed to update order status' },
        { status: 500 }
      );
    }

    // ✅ purchases 테이블에 구매 기록 삽입 (구매내역 페이지에서 조회 + 재다운로드 지원)
    try {
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('id, drum_sheet_id, price')
        .eq('order_id', orderId);

      if (itemsError) {
        console.error('[Points Payment] order_items 조회 실패:', itemsError);
      } else if (orderItems && orderItems.length > 0) {
        const purchaseRecords = orderItems.map((item: any) => ({
          user_id: userId,
          drum_sheet_id: item.drum_sheet_id,
          order_id: orderId,
          price_paid: item.price ?? 0,
        }));

        const { error: purchasesError } = await supabase
          .from('purchases')
          .insert(purchaseRecords);

        if (purchasesError && purchasesError.code !== '23505') {
          // 23505 = unique violation (이미 기록됨) → 무시
          console.error('[Points Payment] purchases 기록 실패:', purchasesError);
        } else {
          console.log('[Points Payment] ✅ purchases 기록 완료:', orderItems.length, '건');
        }
      } else {
        console.warn('[Points Payment] order_items가 없음:', orderId);
      }
    } catch (purchaseErr) {
      console.error('[Points Payment] purchases 기록 중 예외:', purchaseErr);
      // 치명적이지 않으므로 결제 성공 응답은 유지
    }

    return NextResponse.json({
      success: true,
      remainingPoints,
    });
  } catch (error) {
    console.error('[Points Payment] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
