import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSsrServerClient } from '@/lib/supabase/server';

const PURCHASE_VALID_STATUSES = ['payment_confirmed', 'completed'];

/**
 * 사용자가 이미 구매한 악보 id. src/lib/purchaseCheck.ts 와 같은 기준
 * (결제 완료 주문의 order_items + 이전 사이트 구매내역)을 서버에서 계산한다.
 */
export async function fetchOwnedSheetIdsOnServer(
  service: SupabaseClient,
  userId: string,
  sheetIds: string[]
): Promise<Set<string>> {
  const owned = new Set<string>();
  if (sheetIds.length === 0) return owned;

  const { data, error } = await service
    .from('order_items')
    .select('drum_sheet_id, orders!inner ( status, user_id )')
    .eq('orders.user_id', userId)
    .in('orders.status', PURCHASE_VALID_STATUSES)
    .in('drum_sheet_id', sheetIds);

  if (error) {
    throw new Error(`구매 내역 조회 실패: ${error.message}`);
  }
  ((data ?? []) as Array<{ drum_sheet_id: string | null }>).forEach(
    (row) => row.drum_sheet_id && owned.add(row.drum_sheet_id)
  );

  // 이전 사이트 구매내역 RPC 는 auth.uid() 기준이라 사용자 세션 클라이언트로 호출한다
  try {
    const ssr = await createSsrServerClient();
    const { data: legacy, error: legacyError } = await ssr.rpc('get_my_legacy_purchases');
    if (legacyError) {
      console.warn('[my-book] 이전 사이트 구매내역 조회 실패:', legacyError.message);
    } else {
      const wanted = new Set(sheetIds);
      ((legacy ?? []) as Array<{ drum_sheet_id?: string | null }>).forEach((row) => {
        if (row?.drum_sheet_id && wanted.has(row.drum_sheet_id)) owned.add(row.drum_sheet_id);
      });
    }
  } catch (legacyErr) {
    console.warn('[my-book] 이전 사이트 구매내역 조회 예외:', legacyErr);
  }

  return owned;
}
