import { supabase } from './supabase';

export type DashboardAnalyticsPeriod = 'daily' | 'weekly' | 'monthly';

export interface DashboardAnalyticsSeriesPoint {
  label: string;
  start: string;
  pageViews: number;
  visitors: number;
  orderCount: number;
  revenue: number;
  newUsers: number;
  inquiryCount: number;
}

export interface DashboardAnalyticsMetrics {
  totalVisitors: number;
  visitorsChangePct: number;
  totalRevenue: number;
  revenueChangePct: number;
  totalNewUsers: number;
  newUsersChangePct: number;
  totalPageViews: number;
  pageViewsChangePct: number;
}

export interface CountryVisitorData {
  country: string;
  countryName: string;
  visitors: number;
  pageViews: number;
}

export interface ReferrerData {
  referrer: string;
  referrerName: string;
  visitors: number;
  pageViews: number;
}

export interface DashboardAnalyticsResult {
  period: DashboardAnalyticsPeriod;
  metrics: DashboardAnalyticsMetrics;
  series: DashboardAnalyticsSeriesPoint[];
  countryBreakdown: CountryVisitorData[];
  referrerBreakdown: ReferrerData[];
}

type Bucket = {
  label: string;
  start: Date;
  end: Date;
};

type PageViewRow = {
  created_at: string | null;
  user_id: string | null;
  session_id: string | null;
  id?: string | null;
  country?: string | null;
  referrer?: string | null;
  user_agent?: string | null;
};
type OrderRow = { created_at: string | null; total_amount: number | null };
type ProfileRow = { created_at: string | null };
type InquiryRow = { created_at: string | null };

const PERIOD_CONFIG: Record<DashboardAnalyticsPeriod, { buckets: number }> = {
  daily: { buckets: 1 },      // 오늘
  weekly: { buckets: 7 },     // 최근 7일
  monthly: { buckets: 30 },   // 최근 30일 (한달)
};

// 어뷰징 탐지 설정 (환경 변수로 오버라이드 가능)
const ABUSE_DETECTION_CONFIG = {
  // Rate-Based 설정
  MAX_VIEWS_PER_MINUTE: parseInt(process.env.NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_MINUTE || '30', 10),
  MAX_VIEWS_PER_SESSION: parseInt(process.env.NEXT_PUBLIC_ABUSE_MAX_VIEWS_PER_SESSION || '500', 10),
  MIN_AVG_INTERVAL_MS: parseInt(process.env.NEXT_PUBLIC_ABUSE_MIN_AVG_INTERVAL_MS || '2000', 10),

  // Time-Interval 설정
  CONSECUTIVE_FAST_VIEWS: parseInt(process.env.NEXT_PUBLIC_ABUSE_CONSECUTIVE_FAST_VIEWS || '5', 10),
  FAST_VIEW_THRESHOLD_MS: parseInt(process.env.NEXT_PUBLIC_ABUSE_FAST_VIEW_THRESHOLD_MS || '1000', 10),

  // 기타 설정
  MIN_VIEWS_FOR_ANALYSIS: parseInt(process.env.NEXT_PUBLIC_ABUSE_MIN_VIEWS_FOR_ANALYSIS || '10', 10),
  ENABLE_ABUSE_FILTERING: process.env.NEXT_PUBLIC_ENABLE_ABUSE_FILTERING !== 'false', // 기본값: true
};

const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfWeek = (date: Date): Date => {
  const d = startOfDay(date);
  const day = d.getDay();
  // 주 시작을 월요일로 지정
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
};

const startOfMonth = (date: Date): Date => {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
};

const addPeriod = (base: Date, period: DashboardAnalyticsPeriod, amount: number): Date => {
  const date = new Date(base);
  switch (period) {
    case 'daily': {
      date.setDate(date.getDate() + amount);
      break;
    }
    case 'weekly': {
      date.setDate(date.getDate() + amount * 7);
      break;
    }
    case 'monthly': {
      date.setMonth(date.getMonth() + amount);
      break;
    }
  }
  return date;
};

const formatLabel = (date: Date, period: DashboardAnalyticsPeriod): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  switch (period) {
    case 'daily':
      return `${month}-${day}`;
    case 'weekly': {
      // 주간별: 해당 주의 시작일 표시 (예: 01-15)
      return `${month}-${day}`;
    }
    case 'monthly':
      return `${year}-${month}`;
  }
};

const createBuckets = (period: DashboardAnalyticsPeriod, bucketCount: number, now: Date): Bucket[] => {
  // 모든 기간을 일별 버킷으로 생성 (오늘=1일, 최근7일=7일, 최근한달=30일)
  const alignedNow = startOfDay(now);
  const earliestStart = addPeriod(alignedNow, 'daily', -(bucketCount - 1));

  const buckets: Bucket[] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const start = addPeriod(earliestStart, 'daily', i);
    const end = addPeriod(start, 'daily', 1);
    buckets.push({
      label: formatLabel(start, 'daily'),
      start,
      end,
    });
  }

  // 마지막 버킷의 end를 다음날 자정으로 설정하여 데이터 누락 방지
  const lastIndex = buckets.length - 1;
  const endOfToday = new Date(alignedNow);
  endOfToday.setDate(endOfToday.getDate() + 1);
  buckets[lastIndex].end = endOfToday;

  return buckets;
};

const computeChangePct = (current: number, previous: number): number => {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / previous) * 100;
};

const getCountryName = (countryCode: string): string => {
  const countryNames: Record<string, string> = {
    'ko': '대한민국',
    'ko-KR': '대한민국',
    'en': '미국/영어권',
    'en-US': '미국',
    'en-GB': '영국',
    'ja': '일본',
    'ja-JP': '일본',
    'zh': '중국',
    'zh-CN': '중국',
    'zh-TW': '대만',
    'es': '스페인/라틴아메리카',
    'fr': '프랑스',
    'de': '독일',
    'ru': '러시아',
    'pt': '포르투갈/브라질',
    'it': '이탈리아',
    'ar': '아랍권',
    'hi': '인도',
    'id': '인도네시아',
    'th': '태국',
    'vi': '베트남',
    'tr': '터키',
    'pl': '폴란드',
    'nl': '네덜란드',
    'Unknown': '알 수 없음',
  };

  return countryNames[countryCode] || countryCode;
};

const getReferrerName = (referrer: string): string => {
  if (!referrer || referrer === 'Direct') {
    return '직접 접속';
  }

  try {
    const url = new URL(referrer);
    const hostname = url.hostname.replace('www.', '');

    // 주요 검색 엔진 및 SNS
    if (hostname.includes('google')) return 'Google 검색';
    if (hostname.includes('naver')) return '네이버 검색';
    if (hostname.includes('daum')) return '다음 검색';
    if (hostname.includes('youtube')) return 'YouTube';
    if (hostname.includes('facebook')) return 'Facebook';
    if (hostname.includes('instagram')) return 'Instagram';
    if (hostname.includes('twitter') || hostname.includes('x.com')) return 'X (Twitter)';
    if (hostname.includes('kakao')) return '카카오톡';
    if (hostname.includes('tiktok')) return 'TikTok';

    return hostname;
  } catch {
    return referrer.substring(0, 50);
  }
};

const sumRevenue = (rows: OrderRow[]): number =>
  rows.reduce((acc, row) => acc + (row.total_amount ?? 0), 0);

const generateSeries = (
  buckets: Bucket[],
  pageViews: PageViewRow[],
  orders: OrderRow[],
  profiles: ProfileRow[],
  inquiries: InquiryRow[]
): DashboardAnalyticsSeriesPoint[] => {
  const series = buckets.map<DashboardAnalyticsSeriesPoint>((bucket) => ({
    label: bucket.label,
    start: bucket.start.toISOString(),
    pageViews: 0,
    visitors: 0,
    orderCount: 0,
    revenue: 0,
    newUsers: 0,
    inquiryCount: 0,
  }));

  const locateBucket = (date: Date): number => {
    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i];
      if (date >= bucket.start && date < bucket.end) {
        return i;
      }
    }
    return -1;
  };

  // 페이지뷰 및 방문자 계산
  const uniqueVisitorsPerBucket: Map<number, Set<string>> = new Map();

  pageViews.forEach((row) => {
    if (!row.created_at) return;
    const createdDate = new Date(row.created_at);
    const bucketIndex = locateBucket(createdDate);

    if (bucketIndex >= 0) {
      series[bucketIndex].pageViews += 1;

      // 고유 방문자 계산 (session_id, user_id, 또는 페이지뷰 ID 기준)
      const sessionId = row.session_id && row.session_id.trim() !== '' ? row.session_id : null;
      const userId = row.user_id && row.user_id.trim() !== '' ? row.user_id : null;
      const visitorKey = sessionId || userId || row.id || `unknown-${row.created_at}`;

      if (!uniqueVisitorsPerBucket.has(bucketIndex)) {
        uniqueVisitorsPerBucket.set(bucketIndex, new Set());
      }
      uniqueVisitorsPerBucket.get(bucketIndex)!.add(visitorKey);
    }
  });

  // 고유 방문자 수 설정
  uniqueVisitorsPerBucket.forEach((visitorSet, bucketIndex) => {
    series[bucketIndex].visitors = visitorSet.size;
  });

  // 주문 수 및 매출 계산
  orders.forEach((row) => {
    if (!row.created_at) return;
    const bucketIndex = locateBucket(new Date(row.created_at));
    if (bucketIndex >= 0) {
      series[bucketIndex].orderCount += 1;
      series[bucketIndex].revenue += row.total_amount ?? 0;
    }
  });

  // 신규 가입자 계산
  profiles.forEach((row) => {
    if (!row.created_at) return;
    const bucketIndex = locateBucket(new Date(row.created_at));
    if (bucketIndex >= 0) {
      series[bucketIndex].newUsers += 1;
    }
  });

  // 문의 수 계산
  inquiries.forEach((row) => {
    if (!row.created_at) return;
    const bucketIndex = locateBucket(new Date(row.created_at));
    if (bucketIndex >= 0) {
      series[bucketIndex].inquiryCount += 1;
    }
  });

  return series;
};

// 봇 감지 함수
const isBotUserAgent = (userAgent: string | null): boolean => {
  if (!userAgent) return false;

  const botPatterns = [
    'bot', 'crawl', 'spider', 'slurp', 'scrape',
    'Googlebot', 'bingbot', 'YandexBot', 'DuckDuckBot',
    'Baiduspider', 'facebookexternalhit', 'LinkedInBot',
    'WhatsApp', 'Telegram', 'Slack', 'Discord',
    'AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot',
    'archive.org_bot', 'SeekportBot', 'ia_archiver'
  ];

  const lowerUA = userAgent.toLowerCase();
  return botPatterns.some(pattern => lowerUA.includes(pattern.toLowerCase()));
};

// 어뷰징 세션 정보 타입
interface SessionAnalysis {
  sessionId: string;
  views: PageViewRow[];
  totalViews: number;
  avgIntervalMs: number;
  minIntervalMs: number;
  maxViewsPerMinute: number;
  consecutiveFastViews: number;
  isAbusive: boolean;
  abuseReasons: string[];
}

// 세션별 페이지뷰 분석
const analyzeSessionForAbuse = (
  sessionId: string,
  views: PageViewRow[]
): SessionAnalysis => {
  const totalViews = views.length;
  const abuseReasons: string[] = [];

  // 페이지뷰가 너무 적으면 정상으로 간주
  if (totalViews < ABUSE_DETECTION_CONFIG.MIN_VIEWS_FOR_ANALYSIS) {
    return {
      sessionId,
      views,
      totalViews,
      avgIntervalMs: 0,
      minIntervalMs: 0,
      maxViewsPerMinute: 0,
      consecutiveFastViews: 0,
      isAbusive: false,
      abuseReasons: [],
    };
  }

  // 시간순 정렬
  const sortedViews = [...views].sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeA - timeB;
  });

  // 1. 총 페이지뷰 수 체크
  if (totalViews > ABUSE_DETECTION_CONFIG.MAX_VIEWS_PER_SESSION) {
    abuseReasons.push(
      `세션당 총 ${totalViews}개 페이지뷰 (임계값: ${ABUSE_DETECTION_CONFIG.MAX_VIEWS_PER_SESSION})`
    );
  }

  // 2. 페이지뷰 간격 분석
  const intervals: number[] = [];
  for (let i = 1; i < sortedViews.length; i++) {
    const prevTime = new Date(sortedViews[i - 1].created_at || 0).getTime();
    const currTime = new Date(sortedViews[i].created_at || 0).getTime();
    intervals.push(currTime - prevTime);
  }

  const avgIntervalMs = intervals.length > 0
    ? intervals.reduce((sum, val) => sum + val, 0) / intervals.length
    : 0;
  const minIntervalMs = intervals.length > 0 ? Math.min(...intervals) : 0;

  // 평균 간격이 너무 짧으면 어뷰징
  if (avgIntervalMs > 0 && avgIntervalMs < ABUSE_DETECTION_CONFIG.MIN_AVG_INTERVAL_MS) {
    abuseReasons.push(
      `평균 페이지뷰 간격 ${(avgIntervalMs / 1000).toFixed(2)}초 (임계값: ${ABUSE_DETECTION_CONFIG.MIN_AVG_INTERVAL_MS / 1000}초)`
    );
  }

  // 3. 연속 빠른 페이지뷰 체크
  let consecutiveFastViews = 0;
  let maxConsecutiveFast = 0;
  for (const interval of intervals) {
    if (interval < ABUSE_DETECTION_CONFIG.FAST_VIEW_THRESHOLD_MS) {
      consecutiveFastViews++;
      maxConsecutiveFast = Math.max(maxConsecutiveFast, consecutiveFastViews);
    } else {
      consecutiveFastViews = 0;
    }
  }

  if (maxConsecutiveFast >= ABUSE_DETECTION_CONFIG.CONSECUTIVE_FAST_VIEWS) {
    abuseReasons.push(
      `연속 ${maxConsecutiveFast}개 페이지뷰가 ${ABUSE_DETECTION_CONFIG.FAST_VIEW_THRESHOLD_MS / 1000}초 이하 간격`
    );
  }

  // 4. 1분 윈도우 내 최대 페이지뷰 수 체크
  let maxViewsPerMinute = 0;
  for (let i = 0; i < sortedViews.length; i++) {
    const windowStart = new Date(sortedViews[i].created_at || 0).getTime();
    const windowEnd = windowStart + 60 * 1000; // 1분 후

    let viewsInWindow = 0;
    for (let j = i; j < sortedViews.length; j++) {
      const viewTime = new Date(sortedViews[j].created_at || 0).getTime();
      if (viewTime >= windowStart && viewTime < windowEnd) {
        viewsInWindow++;
      } else if (viewTime >= windowEnd) {
        break;
      }
    }

    maxViewsPerMinute = Math.max(maxViewsPerMinute, viewsInWindow);
  }

  if (maxViewsPerMinute > ABUSE_DETECTION_CONFIG.MAX_VIEWS_PER_MINUTE) {
    abuseReasons.push(
      `1분 내 최대 ${maxViewsPerMinute}개 페이지뷰 (임계값: ${ABUSE_DETECTION_CONFIG.MAX_VIEWS_PER_MINUTE})`
    );
  }

  return {
    sessionId,
    views,
    totalViews,
    avgIntervalMs,
    minIntervalMs,
    maxViewsPerMinute,
    consecutiveFastViews: maxConsecutiveFast,
    isAbusive: abuseReasons.length > 0,
    abuseReasons,
  };
};

// 어뷰징 세션 필터링
const filterAbusiveSessions = (pageViews: PageViewRow[]): PageViewRow[] => {
  if (!ABUSE_DETECTION_CONFIG.ENABLE_ABUSE_FILTERING) {
    return pageViews;
  }

  // 세션별로 그룹화
  const sessionMap = new Map<string, PageViewRow[]>();
  pageViews.forEach((view, index) => {
    // session_id가 없는 경우 user_id 사용, 둘 다 없으면 고유 키 생성
    const sessionId = view.session_id || view.user_id || view.id || `no-session-${index}`;
    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, []);
    }
    sessionMap.get(sessionId)!.push(view);
  });

  // 각 세션 분석
  const analyses: SessionAnalysis[] = [];
  sessionMap.forEach((views, sessionId) => {
    const analysis = analyzeSessionForAbuse(sessionId, views);
    analyses.push(analysis);
  });

  // 어뷰징 세션 통계
  const abusiveSessions = analyses.filter((a) => a.isAbusive);
  const totalAbusiveViews = abusiveSessions.reduce((sum, s) => sum + s.totalViews, 0);

  if (abusiveSessions.length > 0) {
    console.log(`[Abuse Detection] Found ${abusiveSessions.length} abusive sessions with ${totalAbusiveViews} views`);
    console.log('[Abuse Detection] Top 5 abusive sessions:');
    abusiveSessions
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 5)
      .forEach((session) => {
        console.log(`  - Session ${session.sessionId.substring(0, 8)}...: ${session.totalViews} views`);
        console.log(`    Reasons: ${session.abuseReasons.join(', ')}`);
      });
  }

  // 정상 세션의 페이지뷰만 반환
  const normalSessions = analyses.filter((a) => !a.isAbusive);
  const filteredViews = normalSessions.flatMap((s) => s.views);

  console.log(
    `[Abuse Detection] Filtered ${totalAbusiveViews} views from ${abusiveSessions.length} sessions (${((totalAbusiveViews / pageViews.length) * 100).toFixed(1)}%)`
  );

  return filteredViews;
};

const fetchPageViews = async (startIso: string, endIso: string): Promise<PageViewRow[]> => {
  const allData: PageViewRow[] = [];
  const pageSize = 1000;
  let page = 0;
  let hasMore = true;

  // 페이지네이션으로 모든 데이터 가져오기
  while (hasMore) {
    const { data, error } = await supabase
      .from('page_views')
      .select('id, created_at, user_id, session_id, country, referrer, user_agent')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    // country, referrer, user_agent 컬럼이 없는 경우 기본 컬럼만 조회
    if (error && error.message.includes('does not exist')) {
      // 기본 컬럼으로 페이지네이션 재시작
      const allBasicData: PageViewRow[] = [];
      let basicPage = 0;
      let basicHasMore = true;

      while (basicHasMore) {
        const { data: basicData, error: basicError } = await supabase
          .from('page_views')
          .select('id, created_at, user_id, session_id')
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .order('created_at', { ascending: true })
          .range(basicPage * pageSize, (basicPage + 1) * pageSize - 1);

        if (basicError) {
          throw new Error(`페이지 뷰 데이터를 불러오지 못했습니다: ${basicError.message}`);
        }

        if (basicData && basicData.length > 0) {
          allBasicData.push(...basicData);
          basicPage++;
          basicHasMore = basicData.length === pageSize;
        } else {
          basicHasMore = false;
        }
      }

      console.log(`[fetchPageViews] Fetched ${allBasicData.length} page views (basic columns, no bot filtering)`);
      return allBasicData;
    }

    if (error) {
      throw new Error(`페이지 뷰 데이터를 불러오지 못했습니다: ${error.message}`);
    }

    if (data && data.length > 0) {
      allData.push(...data);
      page++;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  // 클라이언트 측 봇 필터링
  const botFilteredData = allData.filter(row => !isBotUserAgent(row.user_agent));

  console.log(`[fetchPageViews] Period: ${startIso} to ${endIso}`);
  console.log(`[fetchPageViews] Total: ${allData.length}, After bot filter: ${botFilteredData.length} (${((botFilteredData.length / allData.length) * 100).toFixed(1)}% real users)`);

  // 어뷰징 세션 필터링
  const finalData = filterAbusiveSessions(botFilteredData);
  console.log(`[fetchPageViews] After abuse filter: ${finalData.length} views (removed ${botFilteredData.length - finalData.length} abusive views)`);

  return finalData;
};

const fetchOrders = async (startIso: string, endIso: string): Promise<OrderRow[]> => {
  const { data, error } = await supabase
    .from('orders')
    .select('created_at,total_amount')
    .eq('status', 'completed')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`주문 데이터를 불러오지 못했습니다: ${error.message}`);
  }
  return data ?? [];
};

const fetchProfiles = async (startIso: string, endIso: string): Promise<ProfileRow[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('created_at')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`가입자 데이터를 불러오지 못했습니다: ${error.message}`);
  }
  return data ?? [];
};

const fetchInquiries = async (startIso: string, endIso: string): Promise<InquiryRow[]> => {
  const { data, error } = await supabase
    .from('customer_inquiries')
    .select('created_at')
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`문의 데이터를 불러오지 못했습니다: ${error.message}`);
  }
  return data ?? [];
};

export const getDashboardAnalytics = async (
  period: DashboardAnalyticsPeriod
): Promise<DashboardAnalyticsResult> => {
  const now = new Date();
  const { buckets } = PERIOD_CONFIG[period];
  const currentBuckets = createBuckets(period, buckets, now);
  const currentRangeStart = currentBuckets[0]?.start ?? startOfDay(now);
  const currentRangeEnd = now;

  // 성능 측정 시작
  const startTime = Date.now();

  const previousRangeEnd = new Date(currentRangeStart);
  const previousRangeStart = addPeriod(previousRangeEnd, 'daily', -buckets);

  const [
    currentPageViews,
    previousPageViews,
    currentOrders,
    previousOrders,
    currentProfiles,
    previousProfiles,
    currentInquiries,
    previousInquiries,
  ] = await Promise.all([
    fetchPageViews(currentRangeStart.toISOString(), currentRangeEnd.toISOString()),
    fetchPageViews(previousRangeStart.toISOString(), previousRangeEnd.toISOString()),
    fetchOrders(currentRangeStart.toISOString(), currentRangeEnd.toISOString()),
    fetchOrders(previousRangeStart.toISOString(), previousRangeEnd.toISOString()),
    fetchProfiles(currentRangeStart.toISOString(), currentRangeEnd.toISOString()),
    fetchProfiles(previousRangeStart.toISOString(), previousRangeEnd.toISOString()),
    fetchInquiries(currentRangeStart.toISOString(), currentRangeEnd.toISOString()),
    fetchInquiries(previousRangeStart.toISOString(), previousRangeEnd.toISOString()),
  ]);

  const series = generateSeries(currentBuckets, currentPageViews, currentOrders, currentProfiles, currentInquiries);

  // 고유 방문자 수 계산 (session_id 또는 user_id 기준)
  const uniqueVisitorsSet = new Set<string>();
  currentPageViews.forEach((row) => {
    const sessionId = row.session_id && row.session_id.trim() !== '' ? row.session_id : null;
    const userId = row.user_id && row.user_id.trim() !== '' ? row.user_id : null;

    // session_id가 있으면 우선 사용, 없으면 user_id 사용, 둘 다 없으면 페이지뷰 ID 사용
    const visitorKey = sessionId || userId || row.id || `unknown-${row.created_at}`;
    uniqueVisitorsSet.add(visitorKey);
  });
  const totalVisitors = uniqueVisitorsSet.size;

  const totalRevenue = sumRevenue(currentOrders);
  const totalNewUsers = currentProfiles.length;

  // 이전 기간 고유 방문자 수 계산 (session_id 또는 user_id 기준)
  const previousVisitorsSet = new Set<string>();
  previousPageViews.forEach((row) => {
    const sessionId = row.session_id && row.session_id.trim() !== '' ? row.session_id : null;
    const userId = row.user_id && row.user_id.trim() !== '' ? row.user_id : null;

    const visitorKey = sessionId || userId || row.id || `unknown-${row.created_at}`;
    previousVisitorsSet.add(visitorKey);
  });
  const previousVisitors = previousVisitorsSet.size;
  const previousRevenue = sumRevenue(previousOrders);
  const previousNewUsers = previousProfiles.length;

  // 총 페이지뷰 수 계산
  const totalPageViews = currentPageViews.length;
  const previousPageViewsCount = previousPageViews.length;

  // 국가별 통계 계산 (country 컬럼이 있는 경우에만)
  let countryBreakdown: CountryVisitorData[] = [];
  const hasCountryData = currentPageViews.some((row) => row.country !== undefined);

  if (hasCountryData) {
    const countryMap = new Map<string, { visitors: Set<string>; pageViews: number }>();
    currentPageViews.forEach((row) => {
      const country = row.country || 'Unknown';
      const sessionId = row.session_id && row.session_id.trim() !== '' ? row.session_id : null;
      const userId = row.user_id && row.user_id.trim() !== '' ? row.user_id : null;
      const visitorKey = sessionId || userId || row.id || `unknown-${row.created_at}`;

      if (!countryMap.has(country)) {
        countryMap.set(country, { visitors: new Set(), pageViews: 0 });
      }

      const countryData = countryMap.get(country)!;
      countryData.visitors.add(visitorKey);
      countryData.pageViews += 1;
    });

    countryBreakdown = Array.from(countryMap.entries())
      .map(([country, data]) => ({
        country,
        countryName: getCountryName(country),
        visitors: data.visitors.size,
        pageViews: data.pageViews,
      }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 10); // 상위 10개 국가
  }

  // Referrer별 통계 계산 (referrer 컬럼이 있는 경우에만)
  let referrerBreakdown: ReferrerData[] = [];
  const hasReferrerData = currentPageViews.some((row) => row.referrer !== undefined);

  if (hasReferrerData) {
    const referrerMap = new Map<string, { visitors: Set<string>; pageViews: number }>();
    currentPageViews.forEach((row) => {
      const referrer = row.referrer || 'Direct';
      const sessionId = row.session_id && row.session_id.trim() !== '' ? row.session_id : null;
      const userId = row.user_id && row.user_id.trim() !== '' ? row.user_id : null;
      const visitorKey = sessionId || userId || row.id || `unknown-${row.created_at}`;

      if (!referrerMap.has(referrer)) {
        referrerMap.set(referrer, { visitors: new Set(), pageViews: 0 });
      }

      const referrerData = referrerMap.get(referrer)!;
      referrerData.visitors.add(visitorKey);
      referrerData.pageViews += 1;
    });

    referrerBreakdown = Array.from(referrerMap.entries())
      .map(([referrer, data]) => ({
        referrer,
        referrerName: getReferrerName(referrer),
        visitors: data.visitors.size,
        pageViews: data.pageViews,
      }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 10); // 상위 10개 referrer
  }

  const elapsedTime = Date.now() - startTime;
  console.log(`[Dashboard Analytics] Loaded in ${elapsedTime}ms - Visitors: ${totalVisitors}, PageViews: ${totalPageViews}`);

  return {
    period,
    series,
    metrics: {
      totalVisitors,
      visitorsChangePct: computeChangePct(totalVisitors, previousVisitors),
      totalRevenue,
      revenueChangePct: computeChangePct(totalRevenue, previousRevenue),
      totalNewUsers,
      newUsersChangePct: computeChangePct(totalNewUsers, previousNewUsers),
      totalPageViews,
      pageViewsChangePct: computeChangePct(totalPageViews, previousPageViewsCount),
    },
    countryBreakdown,
    referrerBreakdown,
  };
};

export interface PageViewPayload {
  user_id?: string | null;
  session_id?: string | null;
  page_url: string;
  referrer?: string | null;
  user_agent?: string | null;
  country?: string | null;
}

export const recordPageView = async (payload: PageViewPayload): Promise<void> => {
  // 먼저 모든 컬럼으로 시도
  const fullPayload = {
    user_id: payload.user_id ?? null,
    session_id: payload.session_id ?? null,
    page_url: payload.page_url,
    referrer: payload.referrer ?? null,
    user_agent: payload.user_agent ?? null,
    country: payload.country ?? null,
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('[recordPageView] Attempting to insert:', {
      session_id: fullPayload.session_id,
      page_url: fullPayload.page_url,
      has_country: !!fullPayload.country,
    });
  }

  let { error } = await supabase.from('page_views').insert(fullPayload);

  // country 컬럼이 없는 경우 기본 컬럼만으로 재시도
  if (error && error.message.includes('does not exist')) {
    console.log('[recordPageView] Retrying without country column');
    const basicPayload = {
      user_id: payload.user_id ?? null,
      session_id: payload.session_id ?? null,
      page_url: payload.page_url,
      referrer: payload.referrer ?? null,
      user_agent: payload.user_agent ?? null,
    };

    const result = await supabase.from('page_views').insert(basicPayload);
    error = result.error;
  }

  if (error) {
    console.error('[recordPageView] Insert failed:', error);
    throw new Error(`페이지 뷰 기록에 실패했습니다: ${error.message}`);
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[recordPageView] Insert successful');
  }
};



