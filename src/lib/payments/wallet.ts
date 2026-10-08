import type { SupabaseClient } from '@supabase/supabase-js';

export type CashTransactionType = 'charge' | 'use' | 'refund' | 'admin_add' | 'admin_deduct';

export interface ApplyCashParams {
  userId: string;
  /** 유료 캐쉬 증감 (충전 +, 사용 -) */
  amount: number;
  /** 보너스 캐쉬 증감 */
  bonus?: number;
  type: CashTransactionType;
  description?: string;
  orderId?: string | null;
  sheetId?: string | null;
  createdBy?: string | null;
}

export class InsufficientCashError extends Error {
  constructor() {
    super('INSUFFICIENT_CREDIT');
    this.name = 'InsufficientCashError';
  }
}

/** 같은 주문에 같은 종류의 캐쉬 거래가 이미 기록된 경우 (웹훅 중복 등) */
export class DuplicateCashTransactionError extends Error {
  constructor() {
    super('DUPLICATE_CASH_TRANSACTION');
    this.name = 'DuplicateCashTransactionError';
  }
}

/**
 * 잔액 갱신과 거래내역 기록을 DB 함수 하나(wallet_apply_cash)로 원자적으로 처리한다.
 * @returns 처리 후 잔액
 */
export async function applyCash(supabase: SupabaseClient, params: ApplyCashParams): Promise<number> {
  const { data, error } = await supabase.rpc('wallet_apply_cash', {
    p_user_id: params.userId,
    p_amount: Math.round(params.amount),
    p_bonus: Math.round(params.bonus ?? 0),
    p_type: params.type,
    p_description: params.description ?? '',
    p_order_id: params.orderId ?? null,
    p_sheet_id: params.sheetId ?? null,
    p_created_by: params.createdBy ?? null,
  });

  if (error) {
    if (error.message?.includes('INSUFFICIENT_CREDIT')) {
      throw new InsufficientCashError();
    }
    if (error.code === '23505') {
      throw new DuplicateCashTransactionError();
    }
    throw error;
  }

  return Number(data) || 0;
}

export async function getCashBalance(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase.from('profiles').select('credits').eq('id', userId).single();
  if (error) throw error;
  return Number(data?.credits) || 0;
}
