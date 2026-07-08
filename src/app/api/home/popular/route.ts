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
  popularity_rank?: number | null;
};

type DrumSheetCategoryRow = {
  popularity_rank: number | null;
  drum_sheets: DrumSheetRow | null;
};

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, serviceRoleKey || anonKey);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const genreId = searchParams.get('genreId');

  if (!genreId) {
    return NextResponse.json({ success: false, error: 'genreId is required' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const baseSelect =
      'id, title, artist, price, thumbnail_url, youtube_url, category_id, created_at, slug, view_count_total, view_count_7d, sales_type';

    // 1) 수동 순위의 최신 저장소(drum_sheet_categories.popularity_rank) 우선 사용
    const { data: categoryRanks, error: categoryError } = await supabase
      .from('drum_sheet_categories')
      .select(
        `
          popularity_rank,
          drum_sheets!inner (
            ${baseSelect}
          )
        `,
      )
      .eq('category_id', genreId)
      .eq('drum_sheets.is_active', true)
      .not('popularity_rank', 'is', null)
      .gte('popularity_rank', 1)
      .lte('popularity_rank', 10)
      .order('popularity_rank', { ascending: true });

    if (categoryError) throw categoryError;

    let ranked: DrumSheetRow[] = [];

    if (categoryRanks && categoryRanks.length > 0) {
      ranked = (categoryRanks as DrumSheetCategoryRow[])
        .map((row) => row.drum_sheets)
        .filter((sheet): sheet is DrumSheetRow => Boolean(sheet))
        .slice(0, 10);
    } else {
      // 2) 레거시 fallback(drum_sheets.popularity_rank)
      const { data: sheetRanks, error: sheetError } = await supabase
        .from('drum_sheets')
        .select(`${baseSelect}, popularity_rank`)
        .eq('category_id', genreId)
        .eq('is_active', true)
        .not('popularity_rank', 'is', null)
        .gte('popularity_rank', 1)
        .lte('popularity_rank', 10)
        .order('popularity_rank', { ascending: true });

      if (sheetError) throw sheetError;
      ranked = ((sheetRanks || []) as DrumSheetRow[]).slice(0, 10);
    }

    const responseSheets = ranked.map((sheet) => ({
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
      { success: true, sheets: responseSheets },
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

