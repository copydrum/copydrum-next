import { supabase } from './supabase';
import { generateOrderNumber } from './payments/orderUtils';

export type CashPurchaseItem = {
  sheetId: string;
  sheetTitle?: string | null;
  price: number | null | undefined;
};

export type ProcessCashPurchaseResult =
  | {
      success: true;
      newCredits: number;
      orderId: string | null;
    }
  | {
      success: false;
      reason: 'INSUFFICIENT_CREDIT';
      currentCredits: number;
    };

export interface ProcessCashPurchaseParams {
  userId: string;
  totalPrice: number;
  description: string;
  items?: CashPurchaseItem[];
  sheetIdForTransaction?: string | null;
  paymentMethod?: string;
}

const normalizeAmount = (value: number | null | undefined) => {
  if (!value || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
};

export const processCashPurchase = async ({
  userId,
  totalPrice,
  description,
  items = [],
  sheetIdForTransaction = null,
  paymentMethod = 'cash',
}: ProcessCashPurchaseParams): Promise<ProcessCashPurchaseResult> => {
  const normalizedTotal = normalizeAmount(totalPrice);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  const currentCredits = profile?.credits ?? 0;

  if (normalizedTotal > currentCredits) {
    return {
      success: false,
      reason: 'INSUFFICIENT_CREDIT',
      currentCredits,
    };
  }

  const shouldDeductCredits = normalizedTotal > 0;
  const newCredits = shouldDeductCredits ? currentCredits - normalizedTotal : currentCredits;

  if (shouldDeductCredits) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }
  }

  let orderId: string | null = null;
  let orderNumber = '';

  try {
    orderNumber = generateOrderNumber();

    const { data: orderInsertData, error: orderInsertError } = await supabase
      .from('orders')
      .insert([
        {
          user_id: userId,
          order_number: orderNumber,
          total_amount: normalizedTotal,
          status: 'completed', // ✅ 이건 잘 하셨습니다 (건드리지 마세요)
          // 👇 [수정] 아래 두 줄을 꼭 추가해야 목록에 나옵니다!
          payment_status: 'paid', 
          payment_confirmed_at: new Date().toISOString(), 
          payment_method: paymentMethod,
          order_type: 'product', // 주문 타입 추가 (캐시로 악보 구매)
        },
      ])
      .select('id')
      .single();

    if (orderInsertError) {
      throw orderInsertError;
    }

    orderId = orderInsertData?.id ?? null;

    if (items.length > 0 && orderId) {
      console.log('[debug] 📦 processCashPurchase → orderId:', orderId);
      console.log('[debug] 🧾 processCashPurchase → items:', items);

      const orderItemsPayload = items.map((item) => ({
        order_id: orderId,
        drum_sheet_id: item.sheetId,
        sheet_title: item.sheetTitle ?? '제목 미등록',
        price: normalizeAmount(item.price),
      }));

      console.log('[debug] 🧩 processCashPurchase → orderItemsPayload:', orderItemsPayload);

      const { data: orderItemsData, error: orderItemsError } = await supabase
        .from('order_items')
        .insert(orderItemsPayload)
        .select('id, order_id, drum_sheet_id, price');
      if (orderItemsError) {
        console.error('[error] ❌ processCashPurchase → order_items insert failed:', orderItemsError);
        throw orderItemsError;
      }

      console.log('[debug] ✅ processCashPurchase → order_items insert success:', orderItemsData);
    }

    if (shouldDeductCredits) {
      const inferredSheetId =
        sheetIdForTransaction !== null
          ? sheetIdForTransaction
          : items.length === 1
          ? items[0].sheetId
          : null;

      const { error: transactionError } = await supabase.from('cash_transactions').insert([
        {
          user_id: userId,
          transaction_type: 'use',
          amount: -normalizedTotal,
          bonus_amount: 0,
          balance_after: newCredits,
          description,
          sheet_id: inferredSheetId,
          order_id: orderId,
          created_by: userId,
        },
      ]);

      if (transactionError) {
        throw transactionError;
      }
    }

    return {
      success: true,
      newCredits,
      orderId,
    };
  } catch (error) {
    if (shouldDeductCredits) {
      try {
        await supabase.from('profiles').update({ credits: currentCredits }).eq('id', userId);
      } catch (rollbackError) {
        console.error('캐쉬 차감 롤백 실패:', rollbackError);
      }
    }

    if (orderId) {
      try {
        await supabase.from('order_items').delete().eq('order_id', orderId);
        await supabase.from('orders').delete().eq('id', orderId);
      } catch (rollbackError) {
        console.error('주문 롤백 실패:', rollbackError);
      }
    }

    throw error;
  }
};

