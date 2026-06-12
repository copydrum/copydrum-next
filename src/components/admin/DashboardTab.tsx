'use client';

import type {
  DashboardAnalyticsPeriod,
  DashboardAnalyticsResult,
} from '../../lib/dashboardAnalytics';

// 순수 표시용 헬퍼 (admin 페이지 모듈 레벨과 동일 구현)
const formatPercentChange = (value: number) => {
  if (!Number.isFinite(value)) return '0%';
  const formatted = value.toFixed(1);
  return `${value > 0 ? '+' : ''}${formatted}%`;
};

const getChangeBadgeClassName = (value: number) =>
  value >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600';

interface RecentOrder {
  id: string;
  total_amount: number;
  created_at: string;
  profiles?: { name?: string | null; email?: string | null } | null;
}

interface RecentCustomOrder {
  id: string;
  song_title: string;
  artist: string;
  status: string;
}

interface DashboardTabProps {
  period: DashboardAnalyticsPeriod;
  onPeriodChange: (period: DashboardAnalyticsPeriod) => void;
  onRefresh: () => void;
  data: DashboardAnalyticsResult | null;
  loading: boolean;
  error: string | null;
  formatCurrency: (value: number | null | undefined) => string;
  activeCustomOrderCount: number;
  pendingCustomOrderCount: number;
  totalInquiryCount: number;
  pendingInquiryCount: number;
  onNavigate: (menu: string) => void;
  recentOrders: RecentOrder[];
  recentCustomOrders: RecentCustomOrder[];
  statusMeta: Record<string, { label: string; className: string }>;
}

type AnalyticsCard = {
  title: string;
  value: number;
  change: number;
  icon: string;
  iconClassName: string;
  description: string;
  formatter?: (value: number) => string;
};

export default function DashboardTab({
  period,
  onPeriodChange,
  onRefresh,
  data,
  loading,
  error,
  formatCurrency,
  activeCustomOrderCount,
  pendingCustomOrderCount,
  totalInquiryCount,
  pendingInquiryCount,
  onNavigate,
  recentOrders,
  recentCustomOrders,
  statusMeta,
}: DashboardTabProps) {
  const periodOptions: Array<{ value: DashboardAnalyticsPeriod; label: string }> = [
    { value: 'daily', label: '오늘' },
    { value: 'weekly', label: '최근 7일' },
    { value: 'monthly', label: '최근 한달' },
  ];
  const metrics = data?.metrics;
  const periodDescription = period === 'daily' ? '어제 대비'
    : period === 'weekly' ? '이전 7일 대비'
    : '이전 한달 대비';
  const cards: AnalyticsCard[] = [
    {
      title: '방문자 수',
      value: metrics?.totalVisitors ?? 0,
      change: metrics?.visitorsChangePct ?? 0,
      icon: 'ri-group-line',
      iconClassName: 'bg-blue-100 text-blue-600',
      description: `${periodDescription} · 세션 기준(봇·단발 직접유입 제외)`,
      formatter: (value) => `${value.toLocaleString('ko-KR')}명`,
    },
    {
      title: '페이지뷰',
      value: metrics?.totalPageViews ?? 0,
      change: metrics?.pageViewsChangePct ?? 0,
      icon: 'ri-eye-line',
      iconClassName: 'bg-sky-100 text-sky-600',
      description: `${periodDescription} · 봇 제외`,
      formatter: (value) => `${value.toLocaleString('ko-KR')}`,
    },
    {
      title: '매출',
      value: metrics?.totalRevenue ?? 0,
      change: metrics?.revenueChangePct ?? 0,
      icon: 'ri-money-dollar-circle-line',
      iconClassName: 'bg-purple-100 text-purple-600',
      description: periodDescription,
      formatter: (value) => formatCurrency(value),
    },
    {
      title: '신규 가입자',
      value: metrics?.totalNewUsers ?? 0,
      change: metrics?.newUsersChangePct ?? 0,
      icon: 'ri-user-add-line',
      iconClassName: 'bg-emerald-100 text-emerald-600',
      description: periodDescription,
      formatter: (value) => `${value.toLocaleString('ko-KR')}명`,
    },
  ];
  const hasAnalytics = Boolean(data);
  const chartData = data?.series ?? [];
  const isInitialLoading = loading && !hasAnalytics;

  return (
    <div className="space-y-6">
      <section className="space-y-6 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">방문 · 매출 · 가입 지표</h2>
            <p className="text-sm text-gray-500">오늘, 최근 7일, 최근 한달 지표를 확인하세요.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onPeriodChange(option.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${period === option.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onRefresh()}
              className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              <i className="ri-refresh-line"></i>
              새로고침
            </button>
          </div>
        </div>
        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>데이터를 불러오는 중 오류가 발생했습니다: {error}</span>
              <button
                type="button"
                onClick={() => onRefresh()}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
              >
                <i className="ri-refresh-line"></i>
                다시 시도
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              {isInitialLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`analytics-skeleton-${index}`}
                      className="h-28 animate-pulse rounded-xl border border-gray-100 bg-gray-50"
                    />
                  ))}
                </div>
              ) : !hasAnalytics ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-6 text-sm text-gray-500">
                  데이터를 불러오는 중입니다...
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {cards.map((card) => {
                    const displayValue = card.formatter
                      ? card.formatter(card.value)
                      : card.value.toLocaleString('ko-KR');
                    return (
                      <div key={card.title} className="rounded-xl border border-gray-100 p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-600">{card.title}</p>
                            <p className="mt-2 text-2xl font-bold text-gray-900">{displayValue}</p>
                          </div>
                          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.iconClassName}`}>
                            <i className={`${card.icon} text-xl`}></i>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-xs">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${getChangeBadgeClassName(
                              card.change
                            )}`}
                          >
                            {formatPercentChange(card.change)}
                          </span>
                          <span className="text-gray-400">{card.description}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* 기간별 분석 테이블 */}
              <div className="relative">
                  <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {period === 'daily' ? '오늘 상세' : period === 'weekly' ? '최근 7일 상세' : '최근 한달 상세'}
                  </h3>
                  {isInitialLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="h-24 w-full max-w-md animate-pulse rounded-xl bg-gray-100" />
                    </div>
                  ) : !hasAnalytics ? (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      데이터를 불러오는 중입니다...
                    </div>
                  ) : chartData.length === 0 ? (
                    <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-500">
                      선택한 기간의 데이터가 없습니다.
                    </div>
                  ) : (
                    <div className="overflow-auto max-h-[480px]">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">일자</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">주문수</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">매출액</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">방문자</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">가입</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">문의</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {chartData.slice().reverse().map((data, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-3 py-2 whitespace-nowrap text-gray-900">{data.label}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">{data.orderCount}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">{data.revenue.toLocaleString()}원</td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">{data.visitors}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">{data.newUsers}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">{data.inquiryCount}</td>
                            </tr>
                          ))}
                          {/* 합계행 (오늘=1행이므로 합계 불필요, 7일/한달만 표시) */}
                          {chartData.length > 1 && (
                            <tr className="bg-blue-50 font-semibold sticky bottom-0">
                              <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                                {period === 'weekly' ? '최근 7일 합계' : '최근 한달 합계'}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">
                                {chartData.reduce((sum, d) => sum + d.orderCount, 0)}건
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">
                                {chartData.reduce((sum, d) => sum + d.revenue, 0).toLocaleString()}원
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">
                                {chartData.reduce((sum, d) => sum + d.visitors, 0)}명
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">
                                {chartData.reduce((sum, d) => sum + d.newUsers, 0)}명
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-right text-gray-900">
                                {chartData.reduce((sum, d) => sum + d.inquiryCount, 0)}건
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-xl border border-blue-100 shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-600">맞춤 제작 진행</p>
              <h3 className="mt-2 text-3xl font-bold text-gray-900">
                {activeCustomOrderCount.toLocaleString('ko-KR')}건
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                신규 확인 필요 {pendingCustomOrderCount.toLocaleString('ko-KR')}건 포함
              </p>
            </div>
            <div className="rounded-full bg-blue-100 p-3 text-blue-600">
              <i className="ri-draft-line text-xl"></i>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('custom-orders')}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            주문 제작 관리로 가기
            <i className="ri-arrow-right-line"></i>
          </button>
        </div>

        <div className="bg-white rounded-xl border border-purple-100 shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-600">1:1 문의</p>
              <h3 className="mt-2 text-3xl font-bold text-gray-900">
                {totalInquiryCount.toLocaleString('ko-KR')}건
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                미처리 문의 {pendingInquiryCount.toLocaleString('ko-KR')}건
              </p>
            </div>
            <div className="rounded-full bg-purple-100 p-3 text-purple-600">
              <i className="ri-customer-service-2-line text-xl"></i>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('inquiries')}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
          >
            문의 관리로 가기
            <i className="ri-arrow-right-line"></i>
          </button>
        </div>
      </div>

      {/* 최근 활동 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">최근 주문</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentOrders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{order.profiles?.name}</p>
                    <p className="text-sm text-gray-500">{order.profiles?.email}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">₩{order.total_amount.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900">최근 맞춤 제작 요청</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentCustomOrders.slice(0, 5).map((order) => (
                <div key={order.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{order.song_title}</p>
                    <p className="text-sm text-gray-500">{order.artist}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        statusMeta[order.status]?.className ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {statusMeta[order.status]?.label ?? order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
