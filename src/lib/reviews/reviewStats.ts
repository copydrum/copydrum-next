import { createClient } from '@/lib/supabase/client';

export interface ReviewStat {
  avgRating: number;
  reviewCount: number;
}

export type ReviewStatsMap = Record<string, ReviewStat>;

/**
 * 여러 악보의 리뷰 통계를 한 번에 조회한다(목록/그리드용).
 * drum_sheet_review_stats 뷰를 sheet_id IN (...) 으로 배치 조회.
 * 실패 시 빈 맵을 반환해 목록 렌더링을 막지 않는다.
 */
export async function fetchReviewStatsMap(
  sheetIds: string[]
): Promise<ReviewStatsMap> {
  const ids = Array.from(new Set(sheetIds.filter(Boolean)));
  if (ids.length === 0) return {};

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('drum_sheet_review_stats')
      .select('sheet_id, review_count, avg_rating')
      .in('sheet_id', ids);

    if (error || !data) return {};

    const map: ReviewStatsMap = {};
    for (const row of data as Array<{
      sheet_id: string;
      review_count: number | null;
      avg_rating: number | null;
    }>) {
      map[row.sheet_id] = {
        reviewCount: Number(row.review_count) || 0,
        avgRating: row.avg_rating ? Number(row.avg_rating) : 0,
      };
    }
    return map;
  } catch {
    return {};
  }
}
