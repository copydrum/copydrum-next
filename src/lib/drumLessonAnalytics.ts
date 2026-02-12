import { supabase } from './supabase';

// ─── 타입 정의 ───
export interface DownloadKPI {
  totalDownloads: number;
  todayDownloads: number;
  weekDownloads: number;
  monthDownloads: number;
  weekGrowth: number | null;   // 이전 7일 대비 증감률
  monthGrowth: number | null;  // 이전 30일 대비 증감률
}

export interface DownloadTrendPoint {
  label: string;
  date: string;
  count: number;
}

export interface PopularFreeSheet {
  sheetId: string;
  title: string;
  artist: string;
  difficulty: string | null;
  subCategories: string[];
  downloadCount: number;
  uniqueUsers: number;
}

export interface DownloadSourceBreakdown {
  source: string;
  label: string;
  count: number;
  percentage: number;
}

export interface SubCategoryBreakdown {
  name: string;
  count: number;
  percentage: number;
}

export interface ConversionData {
  totalFreeDownloadUsers: number;       // 무료 악보를 다운받은 총 유저 수
  convertedUsers: number;               // 그 중 유료 구매한 유저 수
  conversionRate: number;               // 전환율 (%)
  totalFreeDownloadsAnonymous: number;  // 비회원 다운로드 수
}

export interface DrumLessonAnalyticsData {
  kpi: DownloadKPI;
  downloadTrend: DownloadTrendPoint[];
  popularSheets: PopularFreeSheet[];
  sourceBreakdown: DownloadSourceBreakdown[];
  subCategoryBreakdown: SubCategoryBreakdown[];
  conversion: ConversionData;
}

// ─── 유틸리티 ───
function calcGrowth(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function formatDateLabel(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ─── 메인 함수 ───
export async function fetchDrumLessonAnalytics(period: '7d' | '30d' | '90d' = '30d'): Promise<DrumLessonAnalyticsData> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 기간 설정
  const periodDays = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const periodStart = new Date(todayStart);
  periodStart.setDate(periodStart.getDate() - periodDays);

  const prevPeriodStart = new Date(periodStart);
  prevPeriodStart.setDate(prevPeriodStart.getDate() - periodDays);

  // 1. 전체 다운로드 데이터 가져오기
  const { data: allDownloads, error: dlError } = await supabase
    .from('free_sheet_downloads')
    .select('id, sheet_id, user_id, session_id, download_source, created_at')
    .order('created_at', { ascending: true });

  if (dlError) {
    console.error('[drumLessonAnalytics] 다운로드 데이터 로드 실패:', dlError);
    throw dlError;
  }

  const downloads = allDownloads || [];

  // 2. KPI 계산
  const todayDl = downloads.filter(d => new Date(d.created_at) >= todayStart);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const weekDl = downloads.filter(d => new Date(d.created_at) >= weekStart);
  
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 30);
  const monthDl = downloads.filter(d => new Date(d.created_at) >= monthStart);

  // 이전 기간
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekDl = downloads.filter(d => {
    const dt = new Date(d.created_at);
    return dt >= prevWeekStart && dt < weekStart;
  });

  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setDate(prevMonthStart.getDate() - 30);
  const prevMonthDl = downloads.filter(d => {
    const dt = new Date(d.created_at);
    return dt >= prevMonthStart && dt < monthStart;
  });

  const kpi: DownloadKPI = {
    totalDownloads: downloads.length,
    todayDownloads: todayDl.length,
    weekDownloads: weekDl.length,
    monthDownloads: monthDl.length,
    weekGrowth: calcGrowth(weekDl.length, prevWeekDl.length),
    monthGrowth: calcGrowth(monthDl.length, prevMonthDl.length),
  };

  // 3. 다운로드 추이 차트 데이터
  const periodDownloads = downloads.filter(d => new Date(d.created_at) >= periodStart);
  const trendMap = new Map<string, number>();

  // 빈 날짜도 포함하도록 미리 생성
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(periodStart);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    trendMap.set(key, 0);
  }

  periodDownloads.forEach(dl => {
    const key = new Date(dl.created_at).toISOString().split('T')[0];
    trendMap.set(key, (trendMap.get(key) || 0) + 1);
  });

  const downloadTrend: DownloadTrendPoint[] = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({
      label: formatDateLabel(new Date(date)),
      date,
      count,
    }));

  // 4. 인기 무료 악보 (다운로드 수 기준)
  const sheetCountMap = new Map<string, { count: number; users: Set<string> }>();
  downloads.forEach(dl => {
    if (!sheetCountMap.has(dl.sheet_id)) {
      sheetCountMap.set(dl.sheet_id, { count: 0, users: new Set() });
    }
    const entry = sheetCountMap.get(dl.sheet_id)!;
    entry.count++;
    if (dl.user_id) entry.users.add(dl.user_id);
    else if (dl.session_id) entry.users.add(`session_${dl.session_id}`);
  });

  // 악보 정보 가져오기
  const sheetIds = Array.from(sheetCountMap.keys());
  let sheetInfoMap = new Map<string, { title: string; artist: string; difficulty: string | null }>();
  
  if (sheetIds.length > 0) {
    const { data: sheetInfos } = await supabase
      .from('drum_sheets')
      .select('id, title, artist, difficulty')
      .in('id', sheetIds);

    if (sheetInfos) {
      sheetInfos.forEach(s => {
        sheetInfoMap.set(s.id, { title: s.title, artist: s.artist, difficulty: s.difficulty });
      });
    }
  }

  // 서브카테고리 정보 가져오기
  let sheetCategoryMap = new Map<string, string[]>();
  if (sheetIds.length > 0) {
    const { data: sheetCategories } = await supabase
      .from('drum_sheet_categories')
      .select('sheet_id, category:categories ( name )')
      .in('sheet_id', sheetIds);

    if (sheetCategories) {
      sheetCategories.forEach((rel: any) => {
        const sheetId = rel.sheet_id;
        const catName = rel.category?.name || (Array.isArray(rel.category) && rel.category[0]?.name);
        if (sheetId && catName) {
          if (!sheetCategoryMap.has(sheetId)) sheetCategoryMap.set(sheetId, []);
          sheetCategoryMap.get(sheetId)!.push(catName);
        }
      });
    }
  }

  const popularSheets: PopularFreeSheet[] = Array.from(sheetCountMap.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([sheetId, data]) => {
      const info = sheetInfoMap.get(sheetId);
      return {
        sheetId,
        title: info?.title || '알 수 없음',
        artist: info?.artist || '알 수 없음',
        difficulty: info?.difficulty || null,
        subCategories: sheetCategoryMap.get(sheetId) || [],
        downloadCount: data.count,
        uniqueUsers: data.users.size,
      };
    });

  // 5. 다운로드 소스별 분포
  const sourceMap = new Map<string, number>();
  downloads.forEach(dl => {
    const src = dl.download_source || 'unknown';
    sourceMap.set(src, (sourceMap.get(src) || 0) + 1);
  });

  const sourceLabels: Record<string, string> = {
    'free-sheets-page': '무료악보 페이지',
    'home-page': '메인 페이지',
    'sheet-detail': '악보 상세 페이지',
    'unknown': '알 수 없음',
  };

  const sourceBreakdown: DownloadSourceBreakdown[] = Array.from(sourceMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([source, count]) => ({
      source,
      label: sourceLabels[source] || source,
      count,
      percentage: downloads.length > 0 ? Math.round((count / downloads.length) * 1000) / 10 : 0,
    }));

  // 6. 서브카테고리별 분포
  const subCatMap = new Map<string, number>();
  downloads.forEach(dl => {
    const cats = sheetCategoryMap.get(dl.sheet_id);
    if (cats && cats.length > 0) {
      cats.forEach(cat => {
        if (cat !== '드럼레슨') { // 메인 카테고리 제외
          subCatMap.set(cat, (subCatMap.get(cat) || 0) + 1);
        }
      });
    } else {
      subCatMap.set('미분류', (subCatMap.get('미분류') || 0) + 1);
    }
  });

  const totalSubCatCount = Array.from(subCatMap.values()).reduce((s, v) => s + v, 0);
  const subCategoryBreakdown: SubCategoryBreakdown[] = Array.from(subCatMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalSubCatCount > 0 ? Math.round((count / totalSubCatCount) * 1000) / 10 : 0,
    }));

  // 7. 유료 전환 분석
  const freeDownloadUserIds = new Set<string>();
  let anonymousDownloads = 0;
  downloads.forEach(dl => {
    if (dl.user_id) freeDownloadUserIds.add(dl.user_id);
    else anonymousDownloads++;
  });

  let convertedUsers = 0;
  if (freeDownloadUserIds.size > 0) {
    // 유료 구매 이력 확인
    const userIdArray = Array.from(freeDownloadUserIds);
    // Supabase IN 쿼리 제한을 고려하여 배치 처리
    const batchSize = 100;
    const purchasedUserSet = new Set<string>();

    for (let i = 0; i < userIdArray.length; i += batchSize) {
      const batch = userIdArray.slice(i, i + batchSize);
      const { data: paidOrders } = await supabase
        .from('orders')
        .select('user_id')
        .in('user_id', batch)
        .eq('payment_status', 'completed')
        .gt('total_amount', 0);

      if (paidOrders) {
        paidOrders.forEach(o => {
          if (o.user_id) purchasedUserSet.add(o.user_id);
        });
      }
    }
    convertedUsers = purchasedUserSet.size;
  }

  const conversion: ConversionData = {
    totalFreeDownloadUsers: freeDownloadUserIds.size,
    convertedUsers,
    conversionRate: freeDownloadUserIds.size > 0
      ? Math.round((convertedUsers / freeDownloadUserIds.size) * 1000) / 10
      : 0,
    totalFreeDownloadsAnonymous: anonymousDownloads,
  };

  return {
    kpi,
    downloadTrend,
    popularSheets,
    sourceBreakdown,
    subCategoryBreakdown,
    conversion,
  };
}
