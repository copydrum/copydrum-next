import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type DrumSheetRow = {
  id: string;
  title: string;
  artist: string;
  price: number | null;
  thumbnail_url: string | null;
  youtube_url: string | null;
  category_id: string | null;
  created_at: string;
  slug: string;
  view_count_total: number | null;
  view_count_7d: number | null;
  sales_type?: 'INSTANT' | 'PREORDER' | null;
};

type OrderJoin = {
  status?: string | null;
  payment_status?: string | null;
} | null;

type DrumSheetCategoryRow = {
  drum_sheets: DrumSheetRow | null;
};

type OrderItemRow = {
  drum_sheet_id: string | null;
  created_at: string | null;
  orders: OrderJoin | OrderJoin[];
};

type PurchaseRow = {
  drum_sheet_id: string | null;
  created_at: string | null;
};

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, serviceRoleKey || anonKey);
}

function isPaidOrder(orderJoin: unknown): boolean {
  const order = Array.isArray(orderJoin) ? orderJoin[0] : (orderJoin as OrderJoin);
  if (!order) return false;
  return order.status === 'completed' || order.payment_status === 'paid';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const genreId = searchParams.get('genreId');

  if (!genreId) {
    return NextResponse.json({ success: false, error: 'genreId is required' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const selectFields =
      'id, title, artist, price, thumbnail_url, youtube_url, category_id, created_at, slug, view_count_total, view_count_7d, sales_type';

    const [primaryResult, junctionResult] = await Promise.all([
      supabase
        .from('drum_sheets')
        .select(selectFields)
        .eq('is_active', true)
        .eq('category_id', genreId),
      supabase
        .from('drum_sheet_categories')
        .select(
          `
            drum_sheets!inner (
              id, title, artist, price, thumbnail_url, youtube_url, category_id, created_at, slug, view_count_total, view_count_7d, sales_type
            )
          `,
        )
        .eq('category_id', genreId)
        .eq('drum_sheets.is_active', true),
    ]);

    if (primaryResult.error) throw primaryResult.error;
    if (junctionResult.error) throw junctionResult.error;

    const sheetMap = new Map<string, DrumSheetRow>();
    for (const row of primaryResult.data || []) {
      const sheet = row as DrumSheetRow;
      if (sheet?.id) sheetMap.set(sheet.id, sheet);
    }
    for (const row of (junctionResult.data || []) as DrumSheetCategoryRow[]) {
      const sheet = row?.drum_sheets;
      if (sheet?.id && !sheetMap.has(sheet.id)) {
        sheetMap.set(sheet.id, sheet);
      }
    }

    const sheets = Array.from(sheetMap.values());
    if (sheets.length === 0) {
      return NextResponse.json(
        { success: true, sheets: [] },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const sheetIds = sheets.map((sheet) => sheet.id);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: orderItems, error: orderItemsError } = await supabase
      .from('order_items')
      .select('drum_sheet_id, created_at, orders!inner(status, payment_status)')
      .in('drum_sheet_id', sheetIds);

    const totalPurchaseMap = new Map<string, number>();
    const recentPurchaseMap = new Map<string, number>();

    if (!orderItemsError && orderItems) {
      for (const item of orderItems as OrderItemRow[]) {
        const sheetId = item?.drum_sheet_id;
        if (!sheetId) continue;
        if (!isPaidOrder(item?.orders)) continue;

        totalPurchaseMap.set(sheetId, (totalPurchaseMap.get(sheetId) || 0) + 1);

        const createdAt = item?.created_at ? new Date(item.created_at) : null;
        if (createdAt && createdAt >= sevenDaysAgo) {
          recentPurchaseMap.set(sheetId, (recentPurchaseMap.get(sheetId) || 0) + 1);
        }
      }
    } else {
      // 일부 배포 환경에서 order_items 조인이 권한/정책 영향으로 실패할 수 있어 purchases로 폴백
      const { data: purchases, error: purchasesError } = await supabase
        .from('purchases')
        .select('drum_sheet_id, created_at')
        .in('drum_sheet_id', sheetIds);

      if (!purchasesError && purchases) {
        for (const item of purchases as PurchaseRow[]) {
          const sheetId = item?.drum_sheet_id;
          if (!sheetId) continue;

          totalPurchaseMap.set(sheetId, (totalPurchaseMap.get(sheetId) || 0) + 1);

          const createdAt = item?.created_at ? new Date(item.created_at) : null;
          if (createdAt && createdAt >= sevenDaysAgo) {
            recentPurchaseMap.set(sheetId, (recentPurchaseMap.get(sheetId) || 0) + 1);
          }
        }
      } else {
        console.error('[api/home/popular] purchase aggregation failed', {
          orderItemsError,
          purchasesError,
        });
      }
    }

    const ranked = sheets
      .map((sheet) => {
        const totalPurchaseCount = totalPurchaseMap.get(sheet.id) || 0;
        const recentPurchaseCount = recentPurchaseMap.get(sheet.id) || 0;
        const totalViewCount = sheet.view_count_total || 0;
        const recentViewCount = sheet.view_count_7d || 0;

        return {
          ...sheet,
          totalPurchaseCount,
          recentPurchaseCount,
          totalViewCount,
          recentViewCount,
        };
      })
      .sort((a, b) => {
        if (b.totalPurchaseCount !== a.totalPurchaseCount) {
          return b.totalPurchaseCount - a.totalPurchaseCount;
        }
        if (b.recentPurchaseCount !== a.recentPurchaseCount) {
          return b.recentPurchaseCount - a.recentPurchaseCount;
        }
        if (b.recentViewCount !== a.recentViewCount) {
          return b.recentViewCount - a.recentViewCount;
        }
        if (b.totalViewCount !== a.totalViewCount) {
          return b.totalViewCount - a.totalViewCount;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 10)
      .map((sheet) => ({
        id: sheet.id,
        title: sheet.title,
        artist: sheet.artist,
        price: sheet.price,
        thumbnail_url: sheet.thumbnail_url,
        youtube_url: sheet.youtube_url,
        category_id: sheet.category_id,
        created_at: sheet.created_at,
        slug: sheet.slug,
        view_count_total: sheet.view_count_total,
        view_count_7d: sheet.view_count_7d,
        sales_type: sheet.sales_type ?? null,
      }));

    return NextResponse.json(
      { success: true, sheets: ranked },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[api/home/popular] unexpected error', error);
    return NextResponse.json(
      { success: true, sheets: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

