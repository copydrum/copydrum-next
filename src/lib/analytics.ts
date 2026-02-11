import { supabase } from './supabase';

export type AnalyticsPeriod = 'today' | '7d' | '30d' | '365d' | 'all';

type BucketUnit = 'hour' | 'day' | 'month';

interface DateRange {
  start: Date | null;
  end: Date;
  previousStart: Date | null;
  previousEnd: Date | null;
  bucketUnit: BucketUnit;
}

interface RawOrder {
  id: string;
  created_at: string | null;
  status: string | null;
  total_amount: number | null;
  user_id?: string | null;
}

interface RawOrderItem {
  id: string;
  sheet_id: string | null;
  price: number | null;
  created_at: string | null;
  orders?: {
    id: string;
    status: string | null;
    created_at: string | null;
  } | null;
  drum_sheets?: {
    id: string;
    title: string | null;
    artist: string | null;
    category_id: string | null;
    categories?: { id?: string | null; name?: string | null } | { id?: string | null; name?: string | null }[] | null;
  } | null;
}

interface RawCustomOrder {
  id: string;
  status: string | null;
  estimated_price: number | null;
  created_at: string | null;
}

export interface AnalyticsSummary {
  totalRevenue: number;
  revenueGrowth: number | null;
  totalOrders: number;
  orderGrowth: number | null;
  totalCustomers: number;
  customerGrowth: number | null;
  averageOrderValue: number;
  averageOrderGrowth: number | null;
}

export interface RevenueTrendPoint {
  bucket: string;
  label: string;
  timestamp: number;
  revenue: number;
  orders: number;
}

export interface PopularSheetDatum {
  sheetId: string;
  title: string;
  artist: string;
  orders: number;
  revenue: number;
}

export interface CategoryBreakdownDatum {
  categoryId: string | null;
  categoryName: string;
  orders: number;
  revenue: number;
}

export interface CustomOrderStatusDatum {
  status: string;
  count: number;
}

export interface CustomOrderMetrics {
  totalCount: number;
  activeCount: number;
  averageEstimatedPrice: number;
}

export interface NewUsersTrendPoint {
  bucket: string;
  label: string;
  timestamp: number;
  count: number;
}

export interface AnalyticsData {
  period: AnalyticsPeriod;
  range: {
    start: string | null;
    end: string;
    previousStart: string | null;
    previousEnd: string | null;
  };
  summary: AnalyticsSummary;
  revenueTrend: RevenueTrendPoint[];
  popularSheets: PopularSheetDatum[];
  categoryBreakdown: CategoryBreakdownDatum[];
  customOrder: {
    statusDistribution: CustomOrderStatusDatum[];
    metrics: CustomOrderMetrics;
  };
  newUsersTrend: NewUsersTrendPoint[];
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const pad = (value: number) => value.toString().padStart(2, '0');

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const subtractDays = (date: Date, days: number) => new Date(date.getTime() - days * ONE_DAY_MS);

const subtractMonths = (date: Date, months: number) => {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  return result;
};

const createDateRange = (period: AnalyticsPeriod): DateRange => {
  const now = new Date();
  const todayStart = startOfDay(now);

  switch (period) {
    case 'today': {
      const start = todayStart;
      const previousStart = subtractDays(start, 1);
      const previousEnd = new Date(start.getTime() - 1);
      return {
        start,
        end: now,
        previousStart,
        previousEnd,
        bucketUnit: 'hour',
      };
    }
    case '7d': {
      const start = subtractDays(todayStart, 6);
      const previousStart = subtractDays(start, 7);
      const previousEnd = new Date(start.getTime() - 1);
      return {
        start,
        end: now,
        previousStart,
        previousEnd,
        bucketUnit: 'day',
      };
    }
    case '30d': {
      const start = subtractDays(todayStart, 29);
      const previousStart = subtractDays(start, 30);
      const previousEnd = new Date(start.getTime() - 1);
      return {
        start,
        end: now,
        previousStart,
        previousEnd,
        bucketUnit: 'day',
      };
    }
    case '365d': {
      const start = subtractDays(todayStart, 364);
      const previousStart = subtractDays(start, 365);
      const previousEnd = new Date(start.getTime() - 1);
      return {
        start,
        end: now,
        previousStart,
        previousEnd,
        bucketUnit: 'month',
      };
    }
    case 'all':
    default:
      return {
        start: null,
        end: now,
        previousStart: null,
        previousEnd: null,
        bucketUnit: 'month',
      };
  }
};

const formatBucketKey = (date: Date, unit: BucketUnit) => {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  if (unit === 'hour') {
    const hour = pad(date.getHours());
    return `${year}-${month}-${day} ${hour}:00`;
  }

  if (unit === 'day') {
    return `${year}-${month}-${day}`;
  }

  return `${year}-${month}`;
};

const formatBucketLabel = (key: string, unit: BucketUnit) => {
  if (unit === 'hour') {
    const [datePart, hourPart] = key.split(' ');
    const [year, month, day] = datePart.split('-');
    const hour = hourPart?.split(':')[0] ?? '00';
    return `${Number(month)}월 ${Number(day)}일 ${Number(hour)}시`;
  }

  if (unit === 'day') {
    const [year, month, day] = key.split('-');
    return `${Number(month)}월 ${Number(day)}일`;
  }

  const [year, month] = key.split('-');
  return `${year}년 ${Number(month)}월`;
};

const getBucketTimestamp = (key: string, unit: BucketUnit) => {
  if (unit === 'hour') {
    const [datePart, hourPart] = key.split(' ');
    const [year, month, day] = datePart.split('-').map((value) => Number(value));
    const hour = Number(hourPart?.split(':')[0] ?? '0');
    return new Date(year, month - 1, day, hour).getTime();
  }

  if (unit === 'day') {
    const [year, month, day] = key.split('-').map((value) => Number(value));
    return new Date(year, month - 1, day).getTime();
  }

  const [year, month] = key.split('-').map((value) => Number(value));
  return new Date(year, month - 1, 1).getTime();
};

const calculateGrowth = (current: number, previous: number | null | undefined): number | null => {
  if (previous == null || Math.abs(previous) < Number.EPSILON) {
    return null;
  }

  const growth = ((current - previous) / previous) * 100;
  return Number.isFinite(growth) ? growth : null;
};

const safeNumber = (value: number | null | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const createEmptySummary = (): AnalyticsSummary => ({
  totalRevenue: 0,
  revenueGrowth: null,
  totalOrders: 0,
  orderGrowth: null,
  totalCustomers: 0,
  customerGrowth: null,
  averageOrderValue: 0,
  averageOrderGrowth: null,
});

const normalizeCategoryName = (
  category: RawOrderItem['drum_sheets'] extends infer T
    ? T extends { categories?: infer U }
      ? U
      : never
    : never,
): string => {
  if (!category) {
    return '기타';
  }

  if (Array.isArray(category)) {
    return category[0]?.name ?? '기타';
  }

  return category.name ?? '기타';
};

export const fetchAnalyticsData = async (period: AnalyticsPeriod = '30d'): Promise<AnalyticsData> => {
  const { start, end, previousStart, previousEnd, bucketUnit } = createDateRange(period);

  const startIso = start ? start.toISOString() : null;
  const endIso = end.toISOString();
  const previousStartIso = previousStart ? previousStart.toISOString() : null;
  const previousEndIso = previousEnd ? previousEnd.toISOString() : null;

  const summary = createEmptySummary();

  const ordersQuery = supabase
    .from('orders')
    .select('id, created_at, status, total_amount, user_id')
    .eq('status', 'completed')
    .order('created_at', { ascending: true });

  if (startIso) {
    ordersQuery.gte('created_at', startIso);
  }
  if (endIso) {
    ordersQuery.lte('created_at', endIso);
  }

  const previousOrdersQuery =
    previousStartIso && previousEndIso
      ? supabase
          .from('orders')
          .select('id, created_at, status, total_amount')
          .eq('status', 'completed')
          .gte('created_at', previousStartIso)
          .lte('created_at', previousEndIso)
      : null;

  const orderItemsQuery = supabase
    .from('order_items')
    .select(
      `
        id,
        sheet_id:drum_sheet_id,
        price,
        created_at,
        orders!inner (
          id,
          status,
          created_at
        ),
        drum_sheets (
          id,
          title,
          artist,
          category_id,
          categories (
            id,
            name
          )
        )
      `,
    )
    .eq('orders.status', 'completed')
    .order('created_at', { ascending: true, referencedTable: 'orders' });

  if (startIso) {
    orderItemsQuery.gte('orders.created_at', startIso);
  }
  if (endIso) {
    orderItemsQuery.lte('orders.created_at', endIso);
  }

  const customOrdersQuery = supabase
    .from('custom_orders')
    .select('id, status, estimated_price, created_at')
    .order('created_at', { ascending: true });

  if (startIso) {
    customOrdersQuery.gte('created_at', startIso);
  }
  if (endIso) {
    customOrdersQuery.lte('created_at', endIso);
  }

  const previousCustomOrdersQuery =
    previousStartIso && previousEndIso
      ? supabase
          .from('custom_orders')
          .select('id')
          .gte('created_at', previousStartIso)
          .lte('created_at', previousEndIso)
      : null;

  const totalUsersQuery = supabase.from('profiles').select('*', { count: 'exact', head: true });

  const newUsersQuery = supabase
    .from('profiles')
    .select('id, created_at')
    .order('created_at', { ascending: true });

  if (startIso) {
    newUsersQuery.gte('created_at', startIso);
  }
  if (endIso) {
    newUsersQuery.lte('created_at', endIso);
  }

  const previousNewUsersCountQuery =
    previousStartIso && previousEndIso
      ? supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', previousStartIso)
          .lte('created_at', previousEndIso)
      : null;

  const [
    { data: currentOrders, error: ordersError },
    previousOrdersResult,
    { data: orderItems, error: orderItemsError },
    { data: customOrders, error: customOrdersError },
    previousCustomOrdersResult,
    { count: totalUsersCount, error: totalUsersError },
    { data: newUsers, error: newUsersError },
    previousNewUsersResult,
  ] = await Promise.all([
    ordersQuery,
    previousOrdersQuery ?? Promise.resolve({ data: [] as RawOrder[], error: null }),
    orderItemsQuery,
    customOrdersQuery,
    previousCustomOrdersQuery ?? Promise.resolve({ data: [] as RawCustomOrder[], error: null }),
    totalUsersQuery,
    newUsersQuery,
    previousNewUsersCountQuery ?? Promise.resolve({ count: 0, error: null }),
  ]);

  if (ordersError) {
    throw ordersError;
  }
  if (orderItemsError) {
    throw orderItemsError;
  }
  if (customOrdersError) {
    throw customOrdersError;
  }
  if (totalUsersError) {
    throw totalUsersError;
  }
  if (newUsersError) {
    throw newUsersError;
  }

  const previousOrders = (previousOrdersResult?.data ?? []) as RawOrder[];
  const previousCustomOrders = (previousCustomOrdersResult?.data ?? []) as RawCustomOrder[];

  const previousNewUsersCount =
    typeof previousNewUsersResult?.count === 'number' ? previousNewUsersResult.count : 0;

  const revenueBuckets = new Map<
    string,
    {
      revenue: number;
      orders: number;
    }
  >();

  let totalRevenue = 0;
  currentOrders.forEach((order) => {
    const createdAt = order.created_at ? new Date(order.created_at) : null;
    if (!createdAt) {
      return;
    }
    const bucketKey = formatBucketKey(createdAt, bucketUnit);
    const entry = revenueBuckets.get(bucketKey) ?? { revenue: 0, orders: 0 };
    const amount = safeNumber(order.total_amount);
    entry.revenue += amount;
    entry.orders += 1;
    totalRevenue += amount;
    revenueBuckets.set(bucketKey, entry);
  });

  const revenueTrend: RevenueTrendPoint[] = Array.from(revenueBuckets.entries())
    .map(([bucket, value]) => ({
      bucket,
      label: formatBucketLabel(bucket, bucketUnit),
      timestamp: getBucketTimestamp(bucket, bucketUnit),
      revenue: round(value.revenue, 2),
      orders: value.orders,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const totalOrders = currentOrders.length;
  const previousRevenue = previousOrders.reduce(
    (sum, order) => sum + safeNumber(order.total_amount),
    0,
  );
  const previousOrdersCount = previousOrders.length;

  summary.totalRevenue = round(totalRevenue, 2);
  summary.totalOrders = totalOrders;
  summary.revenueGrowth = calculateGrowth(totalRevenue, previousRevenue);
  summary.orderGrowth = calculateGrowth(totalOrders, previousOrdersCount);
  summary.totalCustomers = totalUsersCount ?? 0;

  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const previousAverageOrderValue =
    previousOrdersCount > 0 ? previousRevenue / previousOrdersCount : 0;
  summary.averageOrderValue = round(averageOrderValue, 2);
  summary.averageOrderGrowth = calculateGrowth(averageOrderValue, previousAverageOrderValue);

  const currentNewUsersCount = newUsers.length;
  summary.customerGrowth = calculateGrowth(currentNewUsersCount, previousNewUsersCount);

  const newUsersBuckets = new Map<
    string,
    {
      count: number;
    }
  >();
  newUsers.forEach((profile) => {
    const createdAt = profile.created_at ? new Date(profile.created_at) : null;
    if (!createdAt) {
      return;
    }
    const bucketKey = formatBucketKey(createdAt, bucketUnit === 'hour' ? 'day' : bucketUnit);
    const entry = newUsersBuckets.get(bucketKey) ?? { count: 0 };
    entry.count += 1;
    newUsersBuckets.set(bucketKey, entry);
  });

  const newUsersTrend: NewUsersTrendPoint[] = Array.from(newUsersBuckets.entries())
    .map(([bucket, value]) => {
      const effectiveUnit = bucketUnit === 'hour' ? 'day' : bucketUnit;
      return {
        bucket,
        label: formatBucketLabel(bucket, effectiveUnit),
        timestamp: getBucketTimestamp(bucket, effectiveUnit),
        count: value.count,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  const popularSheetsMap = new Map<
    string,
    {
      sheetId: string;
      title: string;
      artist: string;
      orders: number;
      revenue: number;
    }
  >();

  const categoryMap = new Map<
    string,
    {
      categoryId: string | null;
      categoryName: string;
      orders: number;
      revenue: number;
    }
  >();

  orderItems.forEach((item: any) => {
    if (item?.orders?.status !== 'completed') {
      return;
    }

    const sheetId = item.sheet_id ?? 'unknown';
    const sheetTitle = item.drum_sheets?.title ?? '알 수 없는 악보';
    const sheetArtist = item.drum_sheets?.artist ?? '-';
    const price = safeNumber(item.price);

    const sheetEntry =
      popularSheetsMap.get(sheetId) ??
      {
        sheetId,
        title: sheetTitle,
        artist: sheetArtist,
        orders: 0,
        revenue: 0,
      };

    sheetEntry.orders += 1;
    sheetEntry.revenue += price;
    popularSheetsMap.set(sheetId, sheetEntry);

    const categoryId = item.drum_sheets?.category_id ?? 'uncategorized';
    const categoryName = normalizeCategoryName(item.drum_sheets?.categories);

    const categoryEntry =
      categoryMap.get(categoryId) ??
      {
        categoryId,
        categoryName,
        orders: 0,
        revenue: 0,
      };

    categoryEntry.orders += 1;
    categoryEntry.revenue += price;
    categoryMap.set(categoryId, categoryEntry);
  });

  const popularSheets: PopularSheetDatum[] = Array.from(popularSheetsMap.values())
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue)
    .slice(0, 10)
    .map((entry) => ({
      ...entry,
      revenue: round(entry.revenue, 2),
    }));

  const categoryBreakdown: CategoryBreakdownDatum[] = Array.from(categoryMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .map((entry) => ({
      ...entry,
      revenue: round(entry.revenue, 2),
    }));

  const customOrderStatusMap = new Map<string, number>();
  let totalEstimated = 0;
  let estimatedCount = 0;

  customOrders.forEach((order) => {
    const statusKey = order.status ?? 'unknown';
    customOrderStatusMap.set(statusKey, (customOrderStatusMap.get(statusKey) ?? 0) + 1);

    if (typeof order.estimated_price === 'number' && order.estimated_price > 0) {
      totalEstimated += order.estimated_price;
      estimatedCount += 1;
    }
  });

  const statusDistribution: CustomOrderStatusDatum[] = Array.from(customOrderStatusMap.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const customOrderMetrics: CustomOrderMetrics = {
    totalCount: customOrders.length,
    activeCount: customOrders.filter(
      (order) => !['completed', 'cancelled'].includes((order.status ?? '').toLowerCase()),
    ).length,
    averageEstimatedPrice:
      estimatedCount > 0 ? round(totalEstimated / estimatedCount, 2) : 0,
  };

  const analyticsData: AnalyticsData = {
    period,
    range: {
      start: startIso,
      end: endIso,
      previousStart: previousStartIso,
      previousEnd: previousEndIso,
    },
    summary,
    revenueTrend,
    popularSheets,
    categoryBreakdown,
    customOrder: {
      statusDistribution,
      metrics: {
        ...customOrderMetrics,
        // Preserve existing structure while adding previous comparison if needed later
        totalCount: customOrderMetrics.totalCount,
        activeCount: customOrderMetrics.activeCount,
        averageEstimatedPrice: customOrderMetrics.averageEstimatedPrice,
      },
    },
    newUsersTrend,
  };

  return analyticsData;
};
