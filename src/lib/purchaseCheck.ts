import { supabase } from './supabase';

const PURCHASE_VALID_STATUSES = ['payment_confirmed', 'completed'];

export interface PurchasedSheetResult {
  purchasedSheetIds: string[];
  notPurchasedSheetIds: string[];
}

const normalizeSheetIds = (sheetIds: string[] | undefined | null): string[] => {
  if (!Array.isArray(sheetIds) || sheetIds.length === 0) {
    return [];
  }

  return Array.from(
    new Set(
      sheetIds
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  );
};

export const fetchPurchasedSheetIds = async (
  userId: string,
  sheetIds?: string[],
): Promise<string[]> => {
  if (!userId) {
    return [];
  }

  const normalizedSheetIds = normalizeSheetIds(sheetIds);

  let query = supabase
    .from('order_items')
    .select(
      `
        drum_sheet_id,
        orders!inner (
          status,
          user_id
        )
      `,
    )
    .eq('orders.user_id', userId)
    .in('orders.status', PURCHASE_VALID_STATUSES);

  if (normalizedSheetIds.length > 0) {
    query = query.in('drum_sheet_id', normalizedSheetIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message ?? '구매 내역을 확인하지 못했습니다.');
  }

  const purchasedIds = (data ?? [])
    .map((item) => item.drum_sheet_id)
    .filter((id): id is string => Boolean(id));

  if (normalizedSheetIds.length === 0) {
    return Array.from(new Set(purchasedIds));
  }

  const purchasedSet = new Set(purchasedIds);
  const ordered: string[] = [];

  normalizedSheetIds.forEach((id) => {
    if (purchasedSet.has(id)) {
      ordered.push(id);
    }
  });

  return Array.from(new Set(ordered));
};

export const hasPurchasedSheet = async (userId: string, sheetId: string): Promise<boolean> => {
  if (!sheetId) {
    return false;
  }

  const purchasedIds = await fetchPurchasedSheetIds(userId, [sheetId]);
  return purchasedIds.includes(sheetId);
};

export const splitPurchasedSheetIds = async (
  userId: string,
  sheetIds: string[],
): Promise<PurchasedSheetResult> => {
  const normalizedSheetIds = normalizeSheetIds(sheetIds);

  if (!userId || normalizedSheetIds.length === 0) {
    return {
      purchasedSheetIds: [],
      notPurchasedSheetIds: normalizedSheetIds,
    };
  }

  const purchasedIds = await fetchPurchasedSheetIds(userId, normalizedSheetIds);
  const purchasedSet = new Set(purchasedIds);

  const purchasedSheetIds = normalizedSheetIds.filter((id) => purchasedSet.has(id));
  const notPurchasedSheetIds = normalizedSheetIds.filter((id) => !purchasedSet.has(id));

  return {
    purchasedSheetIds,
    notPurchasedSheetIds,
  };
};

export const filterNotPurchasedSheets = async (
  userId: string,
  sheetIds: string[],
): Promise<string[]> => {
  const { notPurchasedSheetIds } = await splitPurchasedSheetIds(userId, sheetIds);
  return notPurchasedSheetIds;
};

