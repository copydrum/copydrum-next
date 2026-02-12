import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { deleteEventDiscountById, fetchEventDiscountList, upsertEventDiscountSheet } from '../../lib/eventDiscounts';
import type { EventDiscountSheet, EventDiscountStatus } from '../../lib/eventDiscounts';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { useAuthStore } from '../../stores/authStore';
import { searchTrackAndGetCoverWithAlbum } from '../../lib/spotify';
import { pdfjsLib } from '../../lib/pdfClient';
import {
  createDefaultSiteSettings,
  fetchSettings,
  updateSettings,
} from '../../lib/settings';
import type { SiteSettingKey, SiteSettingRow, SiteSettings } from '../../lib/settings';
import CustomOrderDetail from '../../components/admin/CustomOrderDetail';
import MarketingSettings from '../../components/admin/MarketingSettings';
import MarketingStatus from '../../components/admin/MarketingStatus';
import DrumLessonManagement from '../../components/admin/DrumLessonManagement';
import {
  getDashboardAnalytics,
  type DashboardAnalyticsPeriod,
  type DashboardAnalyticsResult,
} from '../../lib/dashboardAnalytics';
import { fetchAnalyticsData, type AnalyticsPeriod, type AnalyticsData } from '../../lib/analytics';
import { fetchDrumLessonAnalytics, type DrumLessonAnalyticsData } from '../../lib/drumLessonAnalytics';
import type { VirtualAccountInfo } from '../../lib/payments';
import { completeOrderAfterPayment } from '../../lib/payments/completeOrderAfterPayment';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { languages } from '../../i18n/languages';

const PURCHASE_LOG_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PURCHASE_LOGS === 'true';

// 공통 로그인 경로 상수
const LOGIN_PATH = '/login';

interface Profile {
  id: string;
  email: string;
  name: string;
  kakao_id?: string;
  google_id?: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  credits?: number | null;
}

// 기존 코드
interface DrumSheet {
  id: string;
  title: string;
  artist: string;
  difficulty: string;
  price: number;
  category_id: string;
  created_at: string;
  is_active: boolean;
  category_ids?: string[]; // drum_sheet_categories 관계에서 가져온 추가 카테고리
  thumbnail_url?: string | null; // 인기곡 순위 관리에서 사용
}

interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

type OrderStatus =
  | 'pending'
  | 'awaiting_deposit'
  | 'payment_confirmed'
  | 'completed'
  | 'cancelled'
  | 'refunded';

type OrderSortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'status';

interface OrderItemSheet {
  id: string;
  title: string | null;
  artist: string | null;
  price: number | null;
  thumbnail_url: string | null;
  pdf_url: string | null;
  preview_image_url: string | null;
}

interface OrderItem {
  id: string;
  sheet_id: string | null;
  drum_sheet_id?: string | null;
  sheet_title?: string | null;
  price: number | null;
  created_at: string | null;
  download_attempt_count?: number | null;
  last_downloaded_at?: string | null;
  drum_sheets?: OrderItemSheet | null;
}

interface Order {
  id: string;
  order_number?: string | null;
  user_id: string;
  total_amount: number;
  status: OrderStatus;
  raw_status?: string | null;
  payment_method: string | null;
  payment_status?: string | null;
  payment_note?: string | null;
  transaction_id?: string | null;
  depositor_name?: string | null;
  payment_confirmed_at?: string | null;
  virtual_account_info?: VirtualAccountInfo | null;
  metadata?: Record<string, any> | null;
  order_type?: 'product' | 'cash' | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  order_items?: OrderItem[];
}

interface CopyrightReportRow {
  songId: string;
  title: string;
  artist: string;
  albumName: string | null;
  categoryName: string | null;
  purchaseCount: number;
  unitAmount: number;
  revenue: number;
}

interface DirectSaleRow {
  orderId: string;
  orderNumber: string | null;
  orderedAt: string;
  paymentMethod: string | null;
  paymentMethodLabel: string;
  totalAmount: number;
  itemCount: number;
  customerEmail: string | null;
}

interface CashChargeRow {
  id: string;
  userId: string;
  userEmail: string | null;
  chargedAt: string;
  amount: number;
  bonusAmount: number;
  totalCredit: number;
  description: string | null;
  paymentLabel: string;
}

type CopyrightQuickRangeKey = 'this-month' | 'last-month' | 'last-3-months' | 'this-year';
type CopyrightRangeState = CopyrightQuickRangeKey | 'custom';

const formatDateToYMD = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getRangeForQuickKey = (key: CopyrightQuickRangeKey) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (key) {
    case 'this-month': {
      start.setDate(1);
      return { start: formatDateToYMD(start), end: formatDateToYMD(end) };
    }
    case 'last-month': {
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      end.setMonth(end.getMonth() - 1);
      end.setMonth(end.getMonth() + 1, 0);
      return { start: formatDateToYMD(start), end: formatDateToYMD(end) };
    }
    case 'last-3-months': {
      start.setMonth(start.getMonth() - 2);
      start.setDate(1);
      return { start: formatDateToYMD(start), end: formatDateToYMD(end) };
    }
    case 'this-year': {
      start.setMonth(0, 1);
      return { start: formatDateToYMD(start), end: formatDateToYMD(end) };
    }
    default:
      return { start: formatDateToYMD(start), end: formatDateToYMD(end) };
  }
};

const COPYRIGHT_QUICK_RANGES: Array<{ key: CopyrightQuickRangeKey; label: string }> = [
  { key: 'this-month', label: '이번 달' },
  { key: 'last-month', label: '지난 달' },
  { key: 'last-3-months', label: '최근 3개월' },
  { key: 'this-year', label: '올해' },
];

const ORDER_STATUS_META: Record<OrderStatus, { label: string; className: string; description: string }> = {
  pending: {
    label: '결제 대기',
    className: 'bg-yellow-100 text-yellow-800',
    description: '결제 확인을 기다리고 있습니다.',
  },
  awaiting_deposit: {
    label: '입금 대기',
    className: 'bg-amber-100 text-amber-700',
    description: '무통장입금 확인을 기다리고 있습니다.',
  },
  payment_confirmed: {
    label: '입금 확인',
    className: 'bg-emerald-100 text-emerald-700',
    description: '입금이 확인되어 다운로드 준비가 완료되었습니다.',
  },
  completed: {
    label: '다운로드 가능',
    className: 'bg-blue-100 text-blue-700',
    description: '고객이 악보를 다운로드할 수 있습니다.',
  },
  cancelled: {
    label: '취소됨',
    className: 'bg-gray-100 text-gray-700',
    description: '주문이 취소되었습니다.',
  },
  refunded: {
    label: '환불됨',
    className: 'bg-purple-100 text-purple-700',
    description: '주문 금액이 환불 처리되었습니다.',
  },
};

const ORDER_STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: 'pending', label: ORDER_STATUS_META.pending.label },
  { value: 'awaiting_deposit', label: ORDER_STATUS_META.awaiting_deposit.label },
  { value: 'payment_confirmed', label: ORDER_STATUS_META.payment_confirmed.label },
  { value: 'completed', label: ORDER_STATUS_META.completed.label },
  { value: 'cancelled', label: ORDER_STATUS_META.cancelled.label },
  { value: 'refunded', label: ORDER_STATUS_META.refunded.label },
];

const ORDER_SORT_OPTIONS: Array<{ value: OrderSortKey; label: string }> = [
  { value: 'date_desc', label: '주문일 최신순' },
  { value: 'date_asc', label: '주문일 오래된순' },
  { value: 'amount_desc', label: '금액 높은순' },
  { value: 'amount_asc', label: '금액 낮은순' },
  { value: 'status', label: '상태 (다운로드 가능 우선)' },
];

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: '카드 결제',
  bank_transfer: '무통장입금',
  virtual_account: '가상계좌',
  kakaopay: '카카오페이',
  toss: '토스페이',
  payco: '페이코',
  naverpay: '네이버페이',
  cash: '보유 캐시',
  paypal: 'PayPal',
  inicis: 'KG이니시스',
  transfer: '계좌이체',
};

const ORDER_STATUS_FALLBACK_MAP: Record<string, OrderStatus> = {
  in_progress: 'payment_confirmed',
  processing: 'payment_confirmed',
  ready: 'payment_confirmed',
};

const REFUNDABLE_STATUSES: OrderStatus[] = ['payment_confirmed', 'completed'];
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'awaiting_deposit', 'payment_confirmed', 'completed'];
const KOREAN_PAYMENT_METHODS = ['card', 'bank_transfer', 'kakaopay'] as const;

const normalizeOrderStatus = (status: string | null | undefined): OrderStatus => {
  if (!status) return 'pending';
  const normalized = status.toLowerCase().replace(/[\s-]/g, '_');
  if ((Object.keys(ORDER_STATUS_META) as OrderStatus[]).includes(normalized as OrderStatus)) {
    return normalized as OrderStatus;
  }
  if (normalized in ORDER_STATUS_FALLBACK_MAP) {
    return ORDER_STATUS_FALLBACK_MAP[normalized];
  }
  return 'pending';
};

const normalizePaymentMethodKey = (method: string) =>
  method.toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_');

const getPaymentMethodLabel = (method: string | null | undefined, order?: Order | null) => {
  if (!method) {
    // payment_method가 null인 경우, 주문 메타데이터에서 결제수단 추론 시도
    if (order) {
      const meta = order.metadata as Record<string, any> | null;
      // 메타데이터의 payment_provider로 추론
      if (meta?.payment_provider === 'portone') return '포트원 결제';
      if (meta?.portone_payment_id) return '포트원 결제';
      // order_type으로 추론
      if (order.order_type === 'cash') return '캐시 충전';
      // payment_status로 추론
      if (order.payment_status === 'awaiting_deposit') return '무통장입금';
    }
    return '미확인';
  }
  const key = normalizePaymentMethodKey(method);
  return PAYMENT_METHOD_LABELS[key] ?? method;
};

const getOrderStatusMetaSafe = (status: string | null | undefined) => {
  if (!status) {
    return {
      label: '미정',
      className: 'bg-gray-100 text-gray-600',
      description: '상태 정보가 없습니다.',
    };
  }

  const normalized = normalizeOrderStatus(status);
  return (
    ORDER_STATUS_META[normalized] ?? {
      label: status,
      className: 'bg-gray-100 text-gray-600',
      description: '상태 정보가 없습니다.',
    }
  );
};

type CashTransactionType = 'charge' | 'use' | 'admin_add' | 'admin_deduct';

interface CashTransactionRecord {
  id: string;
  user_id: string;
  transaction_type: CashTransactionType;
  amount: number;
  bonus_amount: number;
  balance_after: number;
  description: string | null;
  sheet_id?: string | null;
  order_id?: string | null;
  created_by?: string | null;
  created_at: string;
  sheet?: {
    id: string;
    title: string | null;
  } | null;
}

interface CashStats {
  totalMembers: number;
  totalBalance: number;
  monthlyCharged: number;
  monthlyUsed: number;
}

const CASH_TRANSACTION_TYPE_META: Record<CashTransactionType, { label: string; className: string }> = {
  charge: { label: '충전', className: 'bg-emerald-100 text-emerald-700' },
  use: { label: '사용', className: 'bg-blue-100 text-blue-700' },
  admin_add: { label: '관리자 추가', className: 'bg-purple-100 text-purple-700' },
  admin_deduct: { label: '관리자 차감', className: 'bg-rose-100 text-rose-700' },
};

type CustomOrderStatus = 'pending' | 'quoted' | 'payment_confirmed' | 'in_progress' | 'completed' | 'cancelled';

interface CustomOrder {
  id: string;
  user_id: string;
  song_title: string;
  artist: string;
  song_url: string | null;
  requirements: string | null;
  status: CustomOrderStatus;
  estimated_price: number | null;
  completed_pdf_url: string | null;
  completed_pdf_filename: string | null;
  download_count: number | null;
  max_download_count: number | null;
  download_expires_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

const CUSTOM_ORDER_STATUS_META: Record<CustomOrderStatus, { label: string; className: string; description: string }> = {
  pending: {
    label: '견적중',
    className: 'bg-amber-100 text-amber-700',
    description: '요청 확인 후 견적을 검토하고 있습니다.',
  },
  quoted: {
    label: '결제대기',
    className: 'bg-sky-100 text-sky-700',
    description: '견적이 전달되었으며 입금을 기다리고 있습니다.',
  },
  payment_confirmed: {
    label: '입금확인',
    className: 'bg-emerald-100 text-emerald-700',
    description: '입금이 확인되어 제작 준비 중입니다.',
  },
  in_progress: {
    label: '작업중',
    className: 'bg-indigo-100 text-indigo-700',
    description: '악보 제작이 진행 중입니다.',
  },
  completed: {
    label: '작업완료',
    className: 'bg-purple-100 text-purple-700',
    description: '악보 제작이 완료되었습니다.',
  },
  cancelled: {
    label: '취소됨',
    className: 'bg-red-100 text-red-700',
    description: '주문이 취소되었습니다.',
  },
};

type SiteSettingsMeta = {
  updatedAt: string;
  updatedBy: string | null;
};

const SETTINGS_TABS: SiteSettingKey[] = ['general', 'payment', 'event', 'system', 'notification'];

const SETTINGS_TAB_CONFIG: Record<SiteSettingKey, { label: string; description: string; icon: string }> = {
  general: {
    label: '기본 정보',
    description: '사이트 기본 정보와 연락처를 관리합니다.',
    icon: 'ri-home-gear-line',
  },
  payment: {
    label: '결제 정보',
    description: '입금 계좌 및 결제 안내를 설정합니다.',
    icon: 'ri-bank-card-line',
  },
  event: {
    label: '이벤트 기본값',
    description: '이벤트 할인에 사용할 기본값을 지정합니다.',
    icon: 'ri-discount-percent-line',
  },
  system: {
    label: '시스템 설정',
    description: '유지보수 모드 및 시스템 정책을 제어합니다.',
    icon: 'ri-settings-5-line',
  },
  notification: {
    label: '알림 설정',
    description: '각종 관리자 알림 수신 여부를 제어합니다.',
    icon: 'ri-notification-3-line',
  },
};

const createDefaultSettingsMeta = (): Record<SiteSettingKey, SiteSettingsMeta> => ({
  general: { updatedAt: '', updatedBy: null },
  payment: { updatedAt: '', updatedBy: null },
  event: { updatedAt: '', updatedBy: null },
  system: { updatedAt: '', updatedBy: null },
  notification: { updatedAt: '', updatedBy: null },
});

const formatSettingsTimestamp = (value: string) => {
  if (!value) {
    return '미저장';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '미저장';
  }

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const buildSettingsMeta = (rows: SiteSettingRow[]): Record<SiteSettingKey, SiteSettingsMeta> => {
  const meta = createDefaultSettingsMeta();

  rows.forEach((row) => {
    if (!row) {
      return;
    }

    meta[row.key] = {
      updatedAt: row.updated_at ?? '',
      updatedBy: row.updated_by ?? null,
    };
  });

  return meta;
};

interface CustomerInquiry {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  category: string;
  title: string;
  content: string;
  status: string;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}

const getInquiryStatusLabel = (status: string) => {
  switch (status) {
    case 'pending':
      return '대기중';
    case 'in_progress':
      return '처리중';
    case 'answered':
      return '답변 완료';
    case 'resolved':
    case 'completed':
      return '처리 완료';
    case 'closed':
      return '종료';
    default:
      return status;
  }
};

const getInquiryStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-700';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700';
    case 'answered':
      return 'bg-purple-100 text-purple-700';
    case 'resolved':
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'closed':
      return 'bg-gray-200 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

interface Collection {
  id: string;
  title: string;
  description?: string;
  thumbnail_url?: string;
  original_price: number;
  sale_price: number;
  discount_percentage: number;
  is_active: boolean;
  category_id?: string;
  category_ids?: string[]; // 여러 카테고리 선택을 위한 배열
  created_at: string;
  updated_at: string;
  title_translations?: Record<string, string> | null;
  description_translations?: Record<string, string> | null;
}

type CollectionFormState = {
  title: string;
  description: string;
  thumbnail_url: string;
  original_price: number;
  sale_price: number;
  discount_percentage: number;
  is_active: boolean;
  category_id: string;
  category_ids: string[];
  title_translations: Record<string, string>;
  description_translations: Record<string, string>;
};

const createEmptyCollectionFormState = (): CollectionFormState => ({
  title: '',
  description: '',
  thumbnail_url: '',
  original_price: 0,
  sale_price: 0,
  discount_percentage: 0,
  is_active: true,
  category_id: '',
  category_ids: [],
  title_translations: {},
  description_translations: {},
});

interface CollectionSheet {
  id: string;
  collection_id: string;
  drum_sheet_id: string;
  drum_sheets?: DrumSheet;
}

type CollectionTranslationField = 'title' | 'description';
type CollectionFormStateSetter = React.Dispatch<React.SetStateAction<CollectionFormState>>;

const translationStateKeyMap: Record<CollectionTranslationField, 'title_translations' | 'description_translations'> = {
  title: 'title_translations',
  description: 'description_translations',
};

const buildInitialTranslations = (
  existing: Record<string, string> | null | undefined,
  fallback: string | null | undefined,
): Record<string, string> => {
  const safeFallback = fallback ?? '';
  const initial: Record<string, string> = {};

  languages.forEach(({ code }) => {
    if (existing?.[code]) {
      initial[code] = existing[code] ?? '';
    } else if (code === 'ko') {
      initial[code] = safeFallback;
    } else {
      initial[code] = '';
    }
  });

  if (!initial.ko) {
    initial.ko = safeFallback;
  }

  return initial;
};

const updateCollectionTranslation = (
  setState: CollectionFormStateSetter,
  lang: string,
  field: CollectionTranslationField,
  value: string,
) => {
  setState((prev) => {
    const translationKey = translationStateKeyMap[field];
    const updatedTranslations = { ...(prev[translationKey] ?? {}) };
    updatedTranslations[lang] = value;

    const nextState: CollectionFormState = {
      ...prev,
      [translationKey]: updatedTranslations,
    };

    if (lang === 'ko') {
      nextState[field] = value;
    }

    return nextState;
  });
};

const copyKoreanTranslationsToAll = (setState: CollectionFormStateSetter) => {
  setState((prev) => {
    const { title, description } = prev;
    const titleTranslations = { ...(prev.title_translations ?? {}) };
    const descriptionTranslations = { ...(prev.description_translations ?? {}) };

    languages.forEach(({ code }) => {
      titleTranslations[code] = title;
      descriptionTranslations[code] = description;
    });

    return {
      ...prev,
      title_translations: titleTranslations,
      description_translations: descriptionTranslations,
    };
  });
};

const renderTranslationEditor = (
  formState: CollectionFormState,
  activeLang: string,
  setActiveLang: React.Dispatch<React.SetStateAction<string>>,
  onChange: (lang: string, field: CollectionTranslationField, value: string) => void,
  onCopyKoreanToAll: () => void,
) => {
  const currentLanguage = languages.find((lang) => lang.code === activeLang) ?? languages[0];
  const resolvedLang = currentLanguage.code;

  const getFieldValue = (field: CollectionTranslationField) => {
    if (resolvedLang === 'ko') {
      return formState[field];
    }
    const translationKey = translationStateKeyMap[field];
    return formState[translationKey]?.[resolvedLang] ?? '';
  };

  return (
    <div className="space-y-4 border border-gray-200 rounded-xl p-4 bg-gray-50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {languages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => setActiveLang(lang.code)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${activeLang === lang.code ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200'
                }`}
            >
              <span className="mr-1" aria-hidden="true">
                {lang.flagEmoji}
              </span>
              {lang.nativeName}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCopyKoreanToAll}
          className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          한국어 내용을 전체 언어에 복사
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            제목 ({currentLanguage.nativeName})
          </label>
          <input
            type="text"
            value={getFieldValue('title')}
            onChange={(e) => onChange(resolvedLang, 'title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            placeholder="제목을 입력하세요"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            설명 ({currentLanguage.nativeName})
          </label>
          <textarea
            value={getFieldValue('description')}
            onChange={(e) => onChange(resolvedLang, 'description', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            placeholder="설명을 입력하세요"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500">
        언어별 제목과 설명을 입력하면 해당 언어 사이트에서 노출됩니다. 입력하지 않은 언어는 한국어(기본값)으로 노출됩니다.
      </p>
    </div>
  );
};

interface EventSheetCandidate {
  id: string;
  title: string;
  artist: string;
  price: number;
  thumbnail_url?: string | null;
  category_id?: string | null;
}

interface EventFormState {
  event_start: string;
  event_end: string;
  discount_price: number;
  original_price: number;
  is_active: boolean;
}

const DEFAULT_EVENT_PRICE = 100;

const EVENT_STATUS_META: Record<EventDiscountStatus, { label: string; className: string }> = {
  active: { label: '진행 중', className: 'bg-green-100 text-green-700' },
  scheduled: { label: '예정', className: 'bg-blue-100 text-blue-700' },
  ended: { label: '종료', className: 'bg-gray-200 text-gray-700' },
  disabled: { label: '비활성', className: 'bg-gray-300 text-gray-700' },
};

const toDatetimeLocalString = (value: string | Date | null | undefined) => {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

const datetimeLocalToIsoString = (value: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString();
};

const calculateDiscountPercent = (original: number, discount: number) => {
  if (!original || original <= 0) return 0;
  const percent = (1 - discount / original) * 100;
  return Math.round(percent * 10) / 10;
};

const formatCurrency = (value: number | null | undefined) => {
  const amount = value ?? 0;
  return `₩${amount.toLocaleString()}`;
};
const extractPaymentLabelFromDescription = (value: string | null | undefined) => {
  if (!value) return '미확인';
  const match = value.match(/\(([^)]+)\)/);
  if (match?.[1]) {
    return match[1].trim();
  }
  return value;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ko-KR');
};

// 주문 요약 정보 생성 함수
const getOrderSummary = (order: Order): string => {
  const orderType = order.order_type;
  const orderItems = order.order_items ?? [];

  if (orderType === 'cash') {
    return `캐쉬 충전 ${formatCurrency(order.total_amount)}`;
  }

  if (orderType === 'product') {
    if (orderItems.length === 0) {
      return '악보 정보 없음';
    }
    if (orderItems.length === 1) {
      const firstItem = orderItems[0];
      const title = firstItem.sheet_title ?? firstItem.drum_sheets?.title ?? '제목 미확인';
      return title;
    }
    // 여러 개인 경우
    const firstItem = orderItems[0];
    const firstTitle = firstItem.sheet_title ?? firstItem.drum_sheets?.title ?? '제목 미확인';
    const remainingCount = orderItems.length - 1;
    return `${firstTitle} 외 ${remainingCount}곡`;
  }

  // order_type이 null/undefined인 경우 기존 로직 유지
  if (orderItems.length === 0) {
    return '구매 내역 없음';
  }
  return `총 ${orderItems.length}개 악보`;
};

const formatPercentChange = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  const formatted = value.toFixed(1);
  return `${value > 0 ? '+' : ''}${formatted}%`;
};

const getChangeBadgeClassName = (value: number) =>
  value >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600';

const createDefaultEventForm = (): EventFormState => {
  const start = new Date();
  const end = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
  return {
    event_start: toDatetimeLocalString(start),
    event_end: toDatetimeLocalString(end),
    discount_price: DEFAULT_EVENT_PRICE,
    original_price: 0,
    is_active: true,
  };
};
const AdminPage: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 기존 상태 선언
  const [dashboardStats, setDashboardStats] = useState({
    totalUsers: 0,
    totalSheets: 0,
    totalOrders: 0,
    totalRevenue: 0,
    monthlyGrowth: 0
  });
  const [dashboardAnalyticsPeriod, setDashboardAnalyticsPeriod] =
    useState<DashboardAnalyticsPeriod>('daily');
  const [dashboardAnalyticsData, setDashboardAnalyticsData] =
    useState<DashboardAnalyticsResult | null>(null);
  const [dashboardAnalyticsLoading, setDashboardAnalyticsLoading] = useState(false);
  const [dashboardAnalyticsError, setDashboardAnalyticsError] = useState<string | null>(null);

  const [members, setMembers] = useState<Profile[]>([]);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberCurrentPage, setMemberCurrentPage] = useState(1);
  const [memberItemsPerPage] = useState(20);
  const [newMember, setNewMember] = useState({
    email: '',
    name: '',
    kakao_id: '',
    google_id: '',
    is_admin: false
  });

  const [cashMembers, setCashMembers] = useState<Profile[]>([]);
  const [cashStats, setCashStats] = useState<CashStats>({
    totalMembers: 0,
    totalBalance: 0,
    monthlyCharged: 0,
    monthlyUsed: 0,
  });
  const [cashLoading, setCashLoading] = useState(false);
  const [cashSearchTerm, setCashSearchTerm] = useState('');
  const [cashCurrentPage, setCashCurrentPage] = useState(1);
  const [cashItemsPerPage] = useState(20);
  const [showCashAdjustModal, setShowCashAdjustModal] = useState(false);
  const [selectedCashMember, setSelectedCashMember] = useState<Profile | null>(null);
  const [cashAdjustType, setCashAdjustType] = useState<'admin_add' | 'admin_deduct'>('admin_add');
  const [cashAdjustAmount, setCashAdjustAmount] = useState<number>(0);
  const [cashAdjustReason, setCashAdjustReason] = useState('');
  const [showCashHistoryModal, setShowCashHistoryModal] = useState(false);
  const [cashHistory, setCashHistory] = useState<CashTransactionRecord[]>([]);
  const [cashHistoryLoading, setCashHistoryLoading] = useState(false);
  const [cashHistoryPage, setCashHistoryPage] = useState(1);
  const cashHistoryPageSize = 20;
  const [cashHistoryTotal, setCashHistoryTotal] = useState(0);

  const [showMemberBulkModal, setShowMemberBulkModal] = useState(false);
  const [memberCsvFile, setMemberCsvFile] = useState<File | null>(null);
  const [memberCsvData, setMemberCsvData] = useState<any[]>([]);
  const [isMemberCsvProcessing, setIsMemberCsvProcessing] = useState(false);

  const [sheets, setSheets] = useState<DrumSheet[]>([]);
  const [sheetSearchTerm, setSheetSearchTerm] = useState('');
  const [sheetCategoryFilter, setSheetCategoryFilter] = useState<string>('all');
  const [isAddingSheet, setIsAddingSheet] = useState(false);
  const [sheetCurrentPage, setSheetCurrentPage] = useState(1);
  const [sheetItemsPerPage] = useState(20);
  const [showSheetBulkModal, setShowSheetBulkModal] = useState(false);
  const [sheetCsvFile, setSheetCsvFile] = useState<File | null>(null);
  const [sheetCsvData, setSheetCsvData] = useState<any[]>([]);
  const [isSheetCsvProcessing, setIsSheetCsvProcessing] = useState(false);
  const [bulkPdfFiles, setBulkPdfFiles] = useState<File[]>([]); // 대량 PDF 파일 상태
  const [newSheet, setNewSheet] = useState({
    title: '',
    artist: '',
    difficulty: 'beginner',
    price: 0,
    category_id: '',
    category_ids: [] as string[],
    thumbnail_url: '',
    thumbnail_file: null as File | null,
    album_name: '',
    page_count: 0,
    tempo: 0,
    pdf_file: null as File | null,
    preview_image_url: '',
    pdf_url: '',
    youtube_url: ''
  });
  const [isLoadingSpotify, setIsLoadingSpotify] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [editingSheet, setEditingSheet] = useState<DrumSheet | null>(null);
  const [editingSheetData, setEditingSheetData] = useState({
    title: '',
    artist: '',
    difficulty: 'beginner',
    price: 0,
    category_id: '',
    category_ids: [] as string[],
    thumbnail_url: '',
    album_name: '',
    page_count: 0,
    tempo: 0,
    youtube_url: '',
    is_active: true
  });
  const [selectedSheetIds, setSelectedSheetIds] = useState<string[]>([]);
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    category_id: '',
    difficulty: '',
    price: '',
    is_active: null as boolean | null
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategory, setNewCategory] = useState({
    name: '',
    description: ''
  });

  const [orders, setOrders] = useState<Order[]>([]);
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | OrderStatus>('all');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState<'all' | string>('all');
  const [orderStartDate, setOrderStartDate] = useState('');
  const [orderEndDate, setOrderEndDate] = useState('');
  const [orderSortKey, setOrderSortKey] = useState<OrderSortKey>('date_desc');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isOrderDetailModalOpen, setIsOrderDetailModalOpen] = useState(false);
  const [orderActionLoading, setOrderActionLoading] = useState<'delete' | 'refund' | 'confirm' | null>(null);
  const [depositConfirmed, setDepositConfirmed] = useState(false); // 입금 확인 체크박스 상태
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const isOrderExpanded = useCallback(
    (orderId: string) => expandedOrderIds.includes(orderId),
    [expandedOrderIds],
  );
  const toggleOrderExpanded = useCallback((orderId: string) => {
    setExpandedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    );
  }, []);

  const [customOrders, setCustomOrders] = useState<CustomOrder[]>([]);
  const [customOrderSearchTerm, setCustomOrderSearchTerm] = useState('');
  const [customOrderStatusFilter, setCustomOrderStatusFilter] = useState<'all' | CustomOrderStatus>('all');
  const [selectedCustomOrderId, setSelectedCustomOrderId] = useState<string | null>(null);
  const [isCustomOrderModalOpen, setIsCustomOrderModalOpen] = useState(false);

  const [customerInquiries, setCustomerInquiries] = useState<CustomerInquiry[]>([]);
  const [isLoadingInquiries, setIsLoadingInquiries] = useState(false);
  const [inquirySearchTerm, setInquirySearchTerm] = useState('');
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState('all');
  const [inquiryReplyDrafts, setInquiryReplyDrafts] = useState<Record<string, string>>({});
  const [inquiryReplySubmitting, setInquiryReplySubmitting] = useState<string | null>(null);

  const [collections, setCollections] = useState<Collection[]>([]);
  const [isAddingCollection, setIsAddingCollection] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [newCollection, setNewCollection] = useState<CollectionFormState>(createEmptyCollectionFormState());
  const [editingCollectionData, setEditingCollectionData] = useState<CollectionFormState>(createEmptyCollectionFormState());
  const [newCollectionActiveLang, setNewCollectionActiveLang] = useState<string>('ko');
  const [editingCollectionActiveLang, setEditingCollectionActiveLang] = useState<string>('ko');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [collectionSheets, setCollectionSheets] = useState<CollectionSheet[]>([]);
  const [availableSheets, setAvailableSheets] = useState<DrumSheet[]>([]);
  const [showCollectionSheetsModal, setShowCollectionSheetsModal] = useState(false);
  const [selectedSheetsForNewCollection, setSelectedSheetsForNewCollection] = useState<DrumSheet[]>([]);
  const [collectionSheetSearchTerm, setCollectionSheetSearchTerm] = useState('');
  const [collectionArtistSearchTerm, setCollectionArtistSearchTerm] = useState('');
  const [isAddingCollectionLoading, setIsAddingCollectionLoading] = useState(false);

  const [copyrightStartDate, setCopyrightStartDate] = useState<string>(
    () => getRangeForQuickKey('this-month').start,
  );
  const [copyrightEndDate, setCopyrightEndDate] = useState<string>(
    () => getRangeForQuickKey('this-month').end,
  );
  const [copyrightQuickRange, setCopyrightQuickRange] = useState<CopyrightRangeState>('this-month');
  const [copyrightReportData, setCopyrightReportData] = useState<CopyrightReportRow[]>([]);
  const [copyrightReportLoading, setCopyrightReportLoading] = useState(false);
  const [copyrightReportError, setCopyrightReportError] = useState<string | null>(null);
  const [directSalesData, setDirectSalesData] = useState<DirectSaleRow[]>([]);
  const [cashChargeData, setCashChargeData] = useState<CashChargeRow[]>([]);

  const [eventDiscounts, setEventDiscounts] = useState<EventDiscountSheet[]>([]);
  const [isLoadingEventDiscounts, setIsLoadingEventDiscounts] = useState(false);
  const [eventSearchTerm, setEventSearchTerm] = useState('');
  const [eventSearchResults, setEventSearchResults] = useState<EventSheetCandidate[]>([]);
  const [isEventSearchLoading, setIsEventSearchLoading] = useState(false);
  const [selectedEventSheet, setSelectedEventSheet] = useState<EventSheetCandidate | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState>(() => createDefaultEventForm());
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isSavingEventDiscount, setIsSavingEventDiscount] = useState(false);
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>('30d');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsExporting, setAnalyticsExporting] = useState(false);
  const analyticsLoadedRef = useRef(false);

  // 월별 매출 데이터
  interface MonthlyRevenueRow {
    year: number;
    month: number;
    revenue: number;
    orderCount: number;
  }
  interface YearlyRevenueData {
    year: number;
    months: MonthlyRevenueRow[];
    yearTotal: number;
    yearOrderCount: number;
  }
  const [monthlyRevenueData, setMonthlyRevenueData] = useState<YearlyRevenueData[]>([]);
  const [monthlyRevenueLoading, setMonthlyRevenueLoading] = useState(false);
  const [monthlyRevenueYear, setMonthlyRevenueYear] = useState<number>(new Date().getFullYear());
  const copyrightInitialFetchRef = useRef(false);

  const loadAnalyticsData = useCallback(
    async (periodValue: AnalyticsPeriod) => {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        const data = await fetchAnalyticsData(periodValue);
        setAnalyticsData(data);
        analyticsLoadedRef.current = true;
      } catch (error: unknown) {
        console.error('분석 데이터 로드 오류:', error);
        const message =
          error instanceof Error ? error.message : '분석 데이터를 불러오지 못했습니다.';
        setAnalyticsError(message);
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [],
  );

  const loadMonthlyRevenue = useCallback(async () => {
    if (!isAdmin) return;
    setMonthlyRevenueLoading(true);
    try {
      // 2025년 1월부터 현재 연도 12월까지 완료된 주문 조회
      const startYear = 2025;
      const currentYear = new Date().getFullYear();
      const startIso = `${startYear}-01-01T00:00:00.000Z`;
      const endIso = `${currentYear}-12-31T23:59:59.999Z`;

      const { data, error } = await supabase
        .from('orders')
        .select('created_at, total_amount')
        .eq('status', 'completed')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // 연도-월별로 집계
      const monthMap = new Map<string, { revenue: number; orderCount: number }>();

      (data ?? []).forEach((order) => {
        if (!order.created_at) return;
        const date = new Date(order.created_at);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const key = `${year}-${month}`;
        const existing = monthMap.get(key) ?? { revenue: 0, orderCount: 0 };
        existing.revenue += order.total_amount ?? 0;
        existing.orderCount += 1;
        monthMap.set(key, existing);
      });

      // 연도별 데이터 구성
      const yearlyData: YearlyRevenueData[] = [];
      for (let year = startYear; year <= currentYear; year++) {
        const months: MonthlyRevenueRow[] = [];
        let yearTotal = 0;
        let yearOrderCount = 0;
        for (let month = 1; month <= 12; month++) {
          const key = `${year}-${month}`;
          const entry = monthMap.get(key) ?? { revenue: 0, orderCount: 0 };
          months.push({ year, month, revenue: entry.revenue, orderCount: entry.orderCount });
          yearTotal += entry.revenue;
          yearOrderCount += entry.orderCount;
        }
        yearlyData.push({ year, months, yearTotal, yearOrderCount });
      }

      setMonthlyRevenueData(yearlyData);
    } catch (error) {
      console.error('월별 매출 로드 실패:', error);
    } finally {
      setMonthlyRevenueLoading(false);
    }
  }, [isAdmin]);

  // 드럼레슨 분석 데이터
  const [drumLessonAnalytics, setDrumLessonAnalytics] = useState<DrumLessonAnalyticsData | null>(null);
  const [drumLessonAnalyticsLoading, setDrumLessonAnalyticsLoading] = useState(false);
  const [drumLessonAnalyticsPeriod, setDrumLessonAnalyticsPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const loadDrumLessonAnalytics = useCallback(async (period: '7d' | '30d' | '90d') => {
    if (!isAdmin) return;
    setDrumLessonAnalyticsLoading(true);
    try {
      const data = await fetchDrumLessonAnalytics(period);
      setDrumLessonAnalytics(data);
    } catch (error) {
      console.error('드럼레슨 분석 데이터 로드 실패:', error);
    } finally {
      setDrumLessonAnalyticsLoading(false);
    }
  }, [isAdmin]);

  const [siteSettings, setSiteSettings] = useState<SiteSettings>(() => createDefaultSiteSettings());
  const [settingsMeta, setSettingsMeta] = useState<Record<SiteSettingKey, SiteSettingsMeta>>(
    () => createDefaultSettingsMeta()
  );
  const [activeSettingsTab, setActiveSettingsTab] = useState<SiteSettingKey>('general');
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const loadSiteSettings = async () => {
    if (!isAdmin) {
      return;
    }

    setIsLoadingSettings(true);
    setSettingsError(null);

    try {
      const { settings, rows } = await fetchSettings();
      setSiteSettings(settings);
      setSettingsMeta(buildSettingsMeta(rows));
    } catch (error) {
      console.error('사이트 설정 불러오기 오류:', error);
      const message =
        error instanceof Error ? error.message : '사이트 설정을 불러오지 못했습니다.';
      setSettingsError(message);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const handleSaveSettings = async (key: SiteSettingKey) => {
    setIsSavingSettings(true);

    try {
      const payload = {
        [key]: siteSettings[key],
      } as Partial<{ [K in SiteSettingKey]: SiteSettings[K] }>;

      const { settings, rows } = await updateSettings(payload, {
        updatedBy: user?.email ?? user?.id ?? null,
      });

      setSiteSettings(settings);
      setSettingsMeta(buildSettingsMeta(rows));
    } catch (error) {
      console.error('사이트 설정 저장 오류:', error);
      const message =
        error instanceof Error ? error.message : '사이트 설정을 저장하지 못했습니다.';
      alert(message);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const updateGeneralSetting = <K extends keyof SiteSettings['general']>(
    key: K,
    value: SiteSettings['general'][K],
  ) => {
    setSiteSettings((prev) => ({
      ...prev,
      general: {
        ...prev.general,
        [key]: value,
      },
    }));
  };

  const updatePaymentSetting = <K extends keyof SiteSettings['payment']>(
    key: K,
    value: SiteSettings['payment'][K],
  ) => {
    setSiteSettings((prev) => ({
      ...prev,
      payment: {
        ...prev.payment,
        [key]: value,
      },
    }));
  };

  const updateEventSetting = <K extends keyof SiteSettings['event']>(
    key: K,
    value: SiteSettings['event'][K],
  ) => {
    setSiteSettings((prev) => ({
      ...prev,
      event: {
        ...prev.event,
        [key]: value,
      },
    }));
  };

  const updateSystemSetting = <K extends keyof SiteSettings['system']>(
    key: K,
    value: SiteSettings['system'][K],
  ) => {
    setSiteSettings((prev) => ({
      ...prev,
      system: {
        ...prev.system,
        [key]: value,
      },
    }));
  };

  const updateNotificationSetting = <K extends keyof SiteSettings['notification']>(
    key: K,
    value: SiteSettings['notification'][K],
  ) => {
    setSiteSettings((prev) => ({
      ...prev,
      notification: {
        ...prev.notification,
        [key]: value,
      },
    }));
  };

  // 관리자 이메일 목록
  const ADMIN_EMAILS = ['copydrum@hanmail.net'];

  // 관리자 권한 확인 함수 추가
  const checkAdminStatus = async (currentUser: User) => {
    try {
      const userEmail = currentUser.email || '';

      // 1. 먼저 이메일로 관리자 여부 확인 (빠른 체크)
      const isAdminEmail = ADMIN_EMAILS.includes(userEmail);

      // 2. 프로필 조회 시도
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', currentUser.id)
        .single();

      if (error) {
        console.log('프로필 조회 오류:', error);

        if (error.code === 'PGRST116') {
          // 프로필이 없으면 생성
          const isAdmin = isAdminEmail; // 이메일로 관리자 여부 결정

          const { error: insertError } = await supabase
            .from('profiles')
            .insert([{
              id: currentUser.id,
              email: userEmail,
              name: currentUser.user_metadata?.name || userEmail.split('@')[0] || '',
              is_admin: isAdmin
            }]);

          if (insertError) {
            console.error('프로필 생성 오류:', insertError);
            // 프로필 생성 실패해도 이메일로 관리자 체크
            if (isAdminEmail) {
              setIsAdmin(true);
              setAuthChecked(true);
              await loadDashboardData();
              return;
            }
            window.location.href = LOGIN_PATH;
            return;
          }

          // 관리자로 생성된 경우
          if (isAdmin) {
            setIsAdmin(true);
            setAuthChecked(true);
            await loadDashboardData();
            return;
          }

          // 일반 사용자로 설정
          setIsAdmin(false);
          setAuthChecked(true);
          window.location.href = '/';
          return;
        }

        // 프로필 조회 실패 시 이메일로 체크
        console.log('프로필 조회 실패, 이메일로 관리자 체크:', userEmail);
        if (isAdminEmail) {
          setIsAdmin(true);
          setAuthChecked(true);
          await loadDashboardData();
          return;
        }

        // 프로필 조회 실패하고 관리자 이메일도 아니면 로그인으로
        console.error('프로필 조회 오류:', error);
        window.location.href = LOGIN_PATH;
        return;
      }

      // 프로필이 있는 경우
      const isAdminFromProfile = profile?.is_admin || false;
      const isAdmin = isAdminFromProfile || isAdminEmail; // 프로필 또는 이메일로 관리자 확인

      if (isAdmin) {
        setIsAdmin(true);
        setAuthChecked(true);
        // 관리자인 경우 대시보드 데이터 로드
        await loadDashboardData();
      } else {
        setIsAdmin(false);
        setAuthChecked(true);
        window.location.href = '/';
      }
    } catch (error) {
      console.error('관리자 권한 확인 오류:', error);
      // 에러 발생 시에도 이메일로 체크
      const userEmail = currentUser.email || '';
      if (ADMIN_EMAILS.includes(userEmail)) {
        setIsAdmin(true);
        setAuthChecked(true);
        await loadDashboardData();
        return;
      }
      window.location.href = LOGIN_PATH;
    }
  };

  // 개선된 인증 확인 함수
  const checkAuth = async () => {
    try {
      // 1. 먼저 세션 확인
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('세션 확인 오류:', sessionError);
        window.location.href = LOGIN_PATH;
        return;
      }

      if (session?.user) {
        setUser(session.user);
        await checkAdminStatus(session.user);
        return;
      }

      // 2. 세션이 없으면 상태 변화 대기 (탭 복귀·리다이렉트 지연 대응)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
        if (session?.user) {
          setUser(session.user);
          await checkAdminStatus(session.user);
          subscription.unsubscribe();
        } else if (event === 'SIGNED_OUT' || !session) {
          window.location.href = LOGIN_PATH;
        }
      });

      // 3. 1.5초 정도 대기 후에도 세션 없으면 로그인으로
      setTimeout(() => {
        if (!authChecked) {
          window.location.href = LOGIN_PATH;
        }
      }, 1500);

    } catch (error) {
      console.error('Auth check failed:', error);
      window.location.href = LOGIN_PATH;
    }
  };

  // 초기 인증 확인
  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    setExpandedOrderIds((prev) => prev.filter((id) => orders.some((order) => order.id === id)));
  }, [orders]);

  useEffect(() => {
    if (activeMenu !== 'analytics' || !isAdmin) {
      return;
    }
    void loadAnalyticsData(analyticsPeriod);
    void loadMonthlyRevenue();
    void loadDrumLessonAnalytics(drumLessonAnalyticsPeriod);
  }, [activeMenu, analyticsPeriod, isAdmin, loadAnalyticsData, loadMonthlyRevenue, loadDrumLessonAnalytics, drumLessonAnalyticsPeriod]);

  // loadCopyrightReport 함수는 아래에서 정의되므로, useEffect는 함수 정의 이후로 이동됨

  // 기존 코드: loadDashboardData, loadMembers, loadSheets, loadCategories, loadOrders, loadCustomOrders
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      const { count: sheetCount } = await supabase
        .from('drum_sheets')
        .select('*', { count: 'exact', head: true });

      const { count: orderCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });

      const { data: revenueData } = await supabase
        .from('orders')
        .select('total_amount')
        .eq('status', 'completed');

      const totalRevenue =
        revenueData?.reduce(
          (sum: number, order: { total_amount: number | null }) => sum + (order.total_amount ?? 0),
          0
        ) ?? 0;

      setDashboardStats({
        totalUsers: userCount || 0,
        totalSheets: sheetCount || 0,
        totalOrders: orderCount || 0,
        totalRevenue,
        monthlyGrowth: 12.5 // 임시 값
      });

    } catch (error) {
      console.error('대시보드 데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };
  const loadMembers = async () => {
    try {
      // 먼저 총 개수 확인
      const { count: totalCount, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('회원 개수 확인 오류:', countError);
        throw countError;
      }

      console.log(`📊 총 회원 개수: ${totalCount}명`);

      let allMembers: Profile[] = [];
      let from = 0;
      const pageSize = 1000;
      const totalPages = Math.ceil((totalCount || 0) / pageSize);

      console.log(`회원 데이터 로드 시작... (총 ${totalPages}페이지 예상)`);

      // 1000개씩 페이지네이션하여 모든 데이터 가져오기
      for (let page = 0; page < totalPages; page++) {
        const to = from + pageSize - 1;
        console.log(`[${page + 1}/${totalPages}] 회원 데이터 로드 중: ${from} ~ ${to}`);

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to)
          .limit(pageSize);

        if (error) {
          console.error(`[${page + 1}/${totalPages}] 회원 데이터 로드 오류:`, error);
          throw error;
        }

        if (data && data.length > 0) {
          allMembers = [...allMembers, ...data];
          console.log(`✅ [${page + 1}/${totalPages}] 현재까지 로드된 회원 수: ${allMembers.length}명 (이번 페이지: ${data.length}명)`);
          from += pageSize;
        } else {
          console.log(`⚠️ [${page + 1}/${totalPages}] 데이터가 없습니다.`);
          break;
        }
      }

      setMembers(allMembers);
      console.log(`🎉 최종 로드 완료: 총 ${allMembers.length}명의 회원을 로드했습니다. (예상: ${totalCount}명)`);

      if (allMembers.length !== totalCount) {
        console.warn(`⚠️ 경고: 로드된 회원 수(${allMembers.length})와 총 개수(${totalCount})가 일치하지 않습니다.`);
      }
    } catch (error) {
      console.error('회원 목록 로드 오류:', error);
    }
  };

  const loadCashOverview = async () => {
    setCashLoading(true);
    try {
      const { count: totalCount, error: countError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      if (countError) {
        throw countError;
      }

      const totalMembersCount = totalCount ?? 0;
      const pageSize = 1000;
      const totalPages = totalMembersCount > 0 ? Math.ceil(totalMembersCount / pageSize) : 0;
      let allProfiles: Profile[] = [];

      for (let page = 0; page < totalPages; page++) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, name, kakao_id, google_id, is_admin, credits, created_at, updated_at')
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) {
          throw error;
        }

        if (!data?.length) {
          break;
        }

        allProfiles = [...allProfiles, ...data];

        if (data.length < pageSize) {
          break;
        }
      }

      const memberList: Profile[] = allProfiles.map((profile) => ({
        ...profile,
        credits: profile.credits ?? 0,
      }));

      setCashMembers(memberList);
      setCashCurrentPage(1);

      const totalBalance = memberList.reduce((sum, profile) => sum + (profile.credits ?? 0), 0);
      const now = new Date();
      const startOfMonthIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: transactionData, error: transactionError } = await supabase
        .from('cash_transactions')
        .select('transaction_type, amount, bonus_amount')
        .gte('created_at', startOfMonthIso);

      if (transactionError) {
        throw transactionError;
      }

      let monthlyCharged = 0;
      let monthlyUsed = 0;

      (transactionData ?? []).forEach((transaction) => {
        const amount = transaction.amount ?? 0;
        const bonus = transaction.bonus_amount ?? 0;
        if (transaction.transaction_type === 'charge' || transaction.transaction_type === 'admin_add') {
          monthlyCharged += amount + bonus;
        }
        if (transaction.transaction_type === 'use' || transaction.transaction_type === 'admin_deduct') {
          monthlyUsed += Math.abs(amount);
        }
      });

      setCashStats({
        totalMembers: totalMembersCount,
        totalBalance,
        monthlyCharged,
        monthlyUsed,
      });
    } catch (error) {
      console.error('적립금 데이터 로드 오류:', error);
      alert('적립금 데이터를 불러오는 중 문제가 발생했습니다.');
    } finally {
      setCashLoading(false);
    }
  };

  const handleOpenCashAdjustModal = (member: Profile) => {
    setSelectedCashMember(member);
    setCashAdjustType('admin_add');
    setCashAdjustAmount(0);
    setCashAdjustReason('');
    setShowCashAdjustModal(true);
  };

  const handleCloseCashAdjustModal = () => {
    setShowCashAdjustModal(false);
    setCashAdjustAmount(0);
    setCashAdjustReason('');
    setSelectedCashMember(null);
  };

  const handleSubmitCashAdjust = async () => {
    if (!selectedCashMember) {
      return;
    }

    if (cashAdjustAmount <= 0 || Number.isNaN(cashAdjustAmount)) {
      alert('1원 이상의 금액을 입력하세요.');
      return;
    }

    const baseAmount = Math.abs(Math.floor(cashAdjustAmount));
    const diff = cashAdjustType === 'admin_deduct' ? -baseAmount : baseAmount;
    const currentCredits = selectedCashMember.credits ?? 0;
    const newBalance = currentCredits + diff;

    if (newBalance < 0) {
      alert('차감 후 잔액이 0 미만이 될 수 없습니다.');
      return;
    }

    try {
      const description =
        cashAdjustReason.trim() ||
        (cashAdjustType === 'admin_add' ? '관리자 캐쉬 추가' : '관리자 캐쉬 차감');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: newBalance })
        .eq('id', selectedCashMember.id);

      if (updateError) {
        throw updateError;
      }

      const { error: insertError } = await supabase
        .from('cash_transactions')
        .insert([
          {
            user_id: selectedCashMember.id,
            transaction_type: cashAdjustType,
            amount: diff,
            bonus_amount: 0,
            balance_after: newBalance,
            description,
            created_by: user?.id ?? null,
          },
        ]);

      if (insertError) {
        throw insertError;
      }

      alert('캐쉬가 업데이트되었습니다.');
      handleCloseCashAdjustModal();
      await loadCashOverview();
    } catch (error) {
      console.error('캐쉬 수정 오류:', error);
      alert('캐쉬 수정 중 오류가 발생했습니다.');
    }
  };
  const fetchCashHistory = async (memberId: string, page = 1) => {
    setCashHistoryLoading(true);
    try {
      const from = (page - 1) * cashHistoryPageSize;
      const to = from + cashHistoryPageSize - 1;

      const { data, error, count } = await supabase
        .from('cash_transactions')
        .select(
          `
            id,
            user_id,
            transaction_type,
            amount,
            bonus_amount,
            balance_after,
            description,
            sheet_id,
            order_id,
            created_by,
            created_at,
            sheet:drum_sheets (id, title)
          `,
          { count: 'exact' }
        )
        .eq('user_id', memberId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        throw error;
      }

      setCashHistory((data as unknown as CashTransactionRecord[]) ?? []);
      setCashHistoryTotal(count ?? 0);
      setCashHistoryPage(page);
    } catch (error) {
      console.error('캐쉬 내역 로드 오류:', error);
      alert('캐쉬 내역을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setCashHistoryLoading(false);
    }
  };

  const handleOpenCashHistoryModal = async (member: Profile) => {
    setSelectedCashMember(member);
    setShowCashHistoryModal(true);
    await fetchCashHistory(member.id, 1);
  };

  const handleChangeCashHistoryPage = async (page: number) => {
    if (!selectedCashMember) {
      return;
    }
    await fetchCashHistory(selectedCashMember.id, page);
  };

  const handleCloseCashHistoryModal = () => {
    setShowCashHistoryModal(false);
    setCashHistory([]);
    setCashHistoryPage(1);
    setCashHistoryTotal(0);
    setSelectedCashMember(null);
  };

  const loadSheets = async () => {
    try {
      // 먼저 총 개수 확인
      const { count: totalCount, error: countError } = await supabase
        .from('drum_sheets')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('악보 개수 확인 오류:', countError);
        throw countError;
      }

      console.log(`📊 총 악보 개수: ${totalCount}개`);

      let allSheets: DrumSheet[] = [];
      let from = 0;
      const pageSize = 1000;
      const totalPages = Math.ceil((totalCount || 0) / pageSize);

      console.log(`악보 데이터 로드 시작... (총 ${totalPages}페이지 예상)`);

      // 1000개씩 페이지네이션하여 모든 데이터 가져오기
      for (let page = 0; page < totalPages; page++) {
        const to = from + pageSize - 1;
        console.log(`[${page + 1}/${totalPages}] 악보 데이터 로드 중: ${from} ~ ${to}`);

        const { data, error } = await supabase
          .from('drum_sheets')
          .select('id, title, artist, difficulty, price, category_id, created_at, is_active, thumbnail_url, album_name, page_count, tempo, youtube_url, categories (id, name)')
          .order('created_at', { ascending: false })
          .range(from, to)
          .limit(pageSize);

        if (error) {
          console.error(`[${page + 1}/${totalPages}] 악보 데이터 로드 오류:`, error);
          throw error;
        }

        if (data && data.length > 0) {
          // 난이도 필드 확인용 디버깅 (첫 3개 악보)
          if (page === 0 && data.length > 0) {
            console.log('🔍 악보 난이도 확인 (처음 3개):');
            data.slice(0, 3).forEach((sheet: any, index: number) => {
              console.log(`  [${index + 1}] ID: ${sheet.id}, 제목: ${sheet.title}, 난이도: "${sheet.difficulty}" (타입: ${typeof sheet.difficulty})`);
            });
          }
          allSheets = [...allSheets, ...data];
          console.log(`✅ [${page + 1}/${totalPages}] 현재까지 로드된 악보 수: ${allSheets.length}개 (이번 페이지: ${data.length}개)`);
          from += pageSize;
        } else {
          console.log(`⚠️ [${page + 1}/${totalPages}] 데이터가 없습니다.`);
          break;
        }
      }

      // 난이도 필드 통계 확인
      const difficultyStats: { [key: string]: number } = {};
      allSheets.forEach((sheet: any) => {
        const diff = sheet.difficulty;
        const key = diff ? String(diff) : 'null/undefined';
        difficultyStats[key] = (difficultyStats[key] || 0) + 1;
      });
      console.log('📊 난이도 필드 통계:', difficultyStats);

      // 난이도가 없는 악보 샘플 출력
      const sheetsWithoutDifficulty = allSheets.filter((sheet: any) => !sheet.difficulty).slice(0, 5);
      if (sheetsWithoutDifficulty.length > 0) {
        console.warn(`⚠️ 난이도가 없는 악보 (최대 5개):`, sheetsWithoutDifficulty.map((s: any) => ({ id: s.id, title: s.title })));
      }

      // drum_sheet_categories 관계 조회하여 category_ids 추가
      if (allSheets.length > 0) {
        const sheetIds = allSheets.map((sheet: any) => sheet.id);
        const categoryMap = new Map<string, string[]>();

        const batchSize = 100;
        for (let i = 0; i < sheetIds.length; i += batchSize) {
          const batch = sheetIds.slice(i, i + batchSize);
          const { data: categoryRelations, error: relationError } = await supabase
            .from('drum_sheet_categories')
            .select('sheet_id, category_id')
            .in('sheet_id', batch);

          if (relationError) {
            console.error('카테고리 관계 조회 오류:', relationError);
          } else if (categoryRelations) {
            categoryRelations.forEach((relation: any) => {
              if (relation.sheet_id && relation.category_id) {
                const existing = categoryMap.get(relation.sheet_id) || [];
                if (!existing.includes(relation.category_id)) {
                  existing.push(relation.category_id);
                  categoryMap.set(relation.sheet_id, existing);
                }
              }
            });
          }
        }

        allSheets = allSheets.map((sheet: any) => ({
          ...sheet,
          category_ids: categoryMap.get(sheet.id) || [],
        }));
      }

      setSheets(allSheets);
      console.log(`🎉 최종 로드 완료: 총 ${allSheets.length}개의 악보를 로드했습니다. (예상: ${totalCount}개)`);

      if (allSheets.length !== totalCount) {
        console.warn(`⚠️ 경고: 로드된 악보 수(${allSheets.length})와 총 개수(${totalCount})가 일치하지 않습니다.`);
      }
    } catch (error) {
      console.error('악보 목록 로드 오류:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('카테고리 목록 로드 오류:', error);
    }
  };

  // 관리자용: 모든 회원의 주문 조회 (필터 없음)
  // RLS 정책에서 관리자는 모든 주문을 볼 수 있도록 허용됨
  const loadOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(
          `
          id,
          order_number,
          user_id,
          total_amount,
          status,
          payment_method,
          payment_status,
          payment_note,
          transaction_id,
          depositor_name,
          payment_confirmed_at,
          virtual_account_info,
          metadata,
          order_type,
          created_at,
          updated_at,
          profiles (
            id,
            email,
            name
          ),
          order_items (
            id,
            drum_sheet_id,
            sheet_title,
            price,
            created_at,
            download_attempt_count,
            last_downloaded_at,
            drum_sheets (
              id,
              title,
              artist,
              price,
              thumbnail_url,
              pdf_url,
              preview_image_url
            )
          )
        `
        )
        .order('created_at', { ascending: false });

      if (error) throw error;

      const normalizedOrders: Order[] =
        data?.map((order: any) => ({
          ...order,
          order_number: order.order_number ?? null,
          status: normalizeOrderStatus(order.status),
          raw_status: order.status ?? null,
          payment_method: order.payment_method ?? null,
          payment_status: order.payment_status ?? null,
          transaction_id: order.transaction_id ?? null,
          depositor_name: order.depositor_name ?? null,
          payment_confirmed_at: order.payment_confirmed_at ?? null,
          virtual_account_info: (order.virtual_account_info ?? null) as VirtualAccountInfo | null,
          metadata: order.metadata ?? null,
          order_type: order.order_type ?? null, // 주문 타입 추가
          order_items: Array.isArray(order.order_items)
            ? order.order_items.map((item: any) => ({
              ...item,
              sheet_id: item.drum_sheet_id ?? item.sheet_id ?? null,
              drum_sheets: item.drum_sheets ?? null,
            }))
            : [],
        })) ?? [];

      setOrders(normalizedOrders);

      if (selectedOrder) {
        const updatedSelected = normalizedOrders.find((item) => item.id === selectedOrder.id);
        if (updatedSelected) {
          setSelectedOrder(updatedSelected);
        }
      }
    } catch (error) {
      console.error('주문 목록 로드 오류:', error);
    }
  };

  const handleOpenOrderDetail = (order: Order) => {
    setSelectedOrder(order);
    setIsOrderDetailModalOpen(true);
    setDepositConfirmed(false); // 주문 상세 열 때 체크박스 초기화
  };

  const handleCloseOrderDetail = () => {
    setIsOrderDetailModalOpen(false);
    setSelectedOrder(null);
    setOrderActionLoading(null);
  };

  const handleDeleteOrderWithoutRefund = async () => {
    if (!selectedOrder) {
      return;
    }

    if (orderActionLoading) {
      return;
    }

    const {
      data: latestOrder,
      error: latestOrderError,
    } = await supabase
      .from('orders')
      .select('status,order_number')
      .eq('id', selectedOrder.id)
      .single();

    if (latestOrderError) {
      alert('최신 주문 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const latestStatus = (latestOrder?.status ?? '').toLowerCase() as OrderStatus | '';
    if (latestStatus === 'refunded') {
      alert('이미 환불 완료된 주문입니다.');
      return;
    }

    if (latestStatus === 'cancelled') {
      alert('이미 취소된 주문입니다.');
      return;
    }

    if (latestStatus && !CANCELLABLE_STATUSES.includes(latestStatus as OrderStatus)) {
      alert('이 주문은 현재 상태에서 취소할 수 없습니다.');
      return;
    }

    const displayNumber =
      latestOrder?.order_number ??
      selectedOrder.order_number ??
      selectedOrder.id.slice(0, 8).toUpperCase();

    const confirmed = window.confirm(
      `이 주문을 환불 없이 취소하시겠습니까?\n주문 번호: ${displayNumber}\n취소 시 다운로드 권한이 즉시 제거됩니다.`,
    );
    if (!confirmed) {
      return;
    }

    setOrderActionLoading('delete');
    try {
      const { data: cancelResult, error: cancelError } = await supabase.functions.invoke('admin-cancel-order', {
        body: {
          orderId: selectedOrder.id,
          doRefund: false,
        },
      });

      if (cancelError) {
        throw cancelError;
      }

      await loadOrders();
      alert(cancelResult?.status === 'cancelled' ? '주문이 환불 없이 취소되었습니다.' : '주문 처리가 완료되었습니다.');
      handleCloseOrderDetail();
    } catch (error: any) {
      console.error('주문 취소 오류:', error);
      alert(error?.message || '주문 취소 중 오류가 발생했습니다.');
    } finally {
      setOrderActionLoading(null);
    }
  };

  // [추가] 맞춤 제작 주문을 일반 악보로 등록하기 위한 핸들러
  const handleRegisterCustomOrderAsSheet = (customOrder: CustomOrder) => {
    if (!customOrder.completed_pdf_url) {
      alert('완료된 PDF 파일이 없는 주문입니다.');
      return;
    }

    // 1. 새 악보 폼 데이터 채우기
    setNewSheet({
      title: customOrder.song_title,
      artist: customOrder.artist,
      difficulty: '초급', // 기본값
      price: 3000, // 기본 판매가 설정 (필요시 수정)
      category_id: '', // 카테고리는 직접 선택하도록 비워둠
      category_ids: [],
      thumbnail_url: '',
      thumbnail_file: null,
      album_name: '',
      page_count: 0,
      tempo: 0,
      pdf_file: null,
      preview_image_url: '',
      pdf_url: customOrder.completed_pdf_url || '', // 주문제작 완료 PDF URL
      youtube_url: customOrder.song_url || ''
    });

    // 2. Spotify 정보 자동 검색 시도 (썸네일 등을 위해)
    fetchSpotifyInfo(customOrder.song_title, customOrder.artist);

    // 3. UI 상태 변경: 메뉴를 '악보 관리'로 이동하고 모달 열기
    setActiveMenu('sheets');
    setIsAddingSheet(true);
    
    // 알림 (선택 사항)
    alert(`'${customOrder.song_title}' 정보를 불러왔습니다.\n카테고리 선택 및 PDF 파일을 업로드하여 등록을 완료해주세요.`);
  };

  const handleRefundOrder = async () => {
    if (!selectedOrder) {
      return;
    }

    if (orderActionLoading) {
      return;
    }

    const {
      data: latestOrder,
      error: latestOrderError,
    } = await supabase
      .from('orders')
      .select('status,total_amount,order_number')
      .eq('id', selectedOrder.id)
      .single();

    if (latestOrderError) {
      alert('최신 주문 정보를 가져오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const latestStatus = (latestOrder?.status ?? '').toLowerCase() as OrderStatus | '';
    if (latestStatus === 'refunded') {
      alert('이미 환불 처리된 주문입니다.');
      return;
    }

    if (latestStatus && !REFUNDABLE_STATUSES.includes(latestStatus as OrderStatus)) {
      alert('이 주문은 환불 가능한 상태가 아닙니다.');
      return;
    }

    const refundAmount = Math.max(0, latestOrder?.total_amount ?? selectedOrder.total_amount ?? 0);
    const displayNumber =
      latestOrder?.order_number ??
      selectedOrder.order_number ??
      selectedOrder.id.slice(0, 8).toUpperCase();

    if (refundAmount === 0) {
      const confirmedZero = window.confirm(
        `환불 가능한 금액이 없습니다. 주문 상태만 '환불 완료'로 변경하시겠습니까?`,
      );
      if (!confirmedZero) {
        return;
      }
    }

    const confirmed = window.confirm(
      `이 주문을 환불 처리하고 상태를 '환불 완료'로 변경하시겠습니까?\n환불 금액: ${formatCurrency(refundAmount)}P`,
    );
    if (!confirmed) {
      return;
    }

    setOrderActionLoading('refund');
    try {
      const { data: refundResult, error: refundError } = await supabase.functions.invoke('admin-cancel-order', {
        body: {
          orderId: selectedOrder.id,
          doRefund: true,
        },
      });

      if (refundError) {
        throw refundError;
      }

      await loadOrders();
      alert(refundResult?.status === 'refunded' ? '환불 처리가 완료되었습니다.' : '주문 처리가 완료되었습니다.');
      handleCloseOrderDetail();
    } catch (error: any) {
      console.error('주문 환불 오류:', error);
      alert(error?.message || '주문 환불 처리 중 오류가 발생했습니다.');
    } finally {
      setOrderActionLoading(null);
    }
  };
  const handleConfirmBankDeposit = async () => {
    if (!selectedOrder) {
      return;
    }

    if (orderActionLoading) {
      return;
    }

    // 체크박스 확인
    if (!depositConfirmed) {
      alert('입금자명과 금액을 계좌 입금 내역과 대조했는지 확인해주세요.');
      return;
    }

    const paymentKey = selectedOrder.payment_method
      ? normalizePaymentMethodKey(selectedOrder.payment_method)
      : '';
    const isBankTransfer = ['bank_transfer', 'virtual_account'].includes(paymentKey);

    if (!isBankTransfer) {
      alert('무통장입금 주문이 아닙니다.');
      return;
    }

    const normalizedPaymentStatus = (selectedOrder.payment_status ?? '').toLowerCase();
    if (normalizedPaymentStatus !== 'awaiting_deposit' && normalizedPaymentStatus !== 'pending') {
      alert('입금 대기 상태의 주문만 수동 확인할 수 있습니다.');
      return;
    }

    const confirmed = window.confirm('입금을 확인하고 주문을 완료 상태로 전환하시겠습니까?');
    if (!confirmed) {
      return;
    }

    setOrderActionLoading('confirm');

    try {
      console.log('[입금확인] 처리 시작', {
        orderId: selectedOrder.id,
        paymentMethod: selectedOrder.payment_method,
        paymentStatus: selectedOrder.payment_status,
        metadata: selectedOrder.metadata,
        orderItems: selectedOrder.order_items?.length ?? 0,
      });

      const nowIso = new Date().toISOString();
      const manualTransactionId =
        selectedOrder.transaction_id && selectedOrder.transaction_id.trim().length > 0
          ? selectedOrder.transaction_id
          : `manual-${Date.now()}`;

      // 공통 함수를 사용하여 주문 완료 처리 (일반 import로 변경하여 동적 import 오류 방지)
      const paymentMethod = (selectedOrder.payment_method as any) || 'bank_transfer';

      await completeOrderAfterPayment(selectedOrder.id, paymentMethod, {
        transactionId: manualTransactionId,
        paymentConfirmedAt: nowIso,
        depositorName: selectedOrder.depositor_name ?? undefined,
        paymentProvider: 'manual',
        metadata: {
          confirmedBy: 'admin',
          confirmedByUserId: user?.id,
        },
      });

      // 캐시 충전인 경우 캐시 개요 갱신
      const isCashCharge =
        (selectedOrder.metadata?.type === 'cash_charge' ||
          selectedOrder.metadata?.purpose === 'cash_charge') &&
        (selectedOrder.order_items?.length ?? 0) === 0;

      if (isCashCharge) {
        await loadCashOverview();
      }

      console.log('[입금확인] 주문 완료 처리 성공');

      await loadOrders();
      console.log('[입금확인] 주문 목록 갱신 완료');
      alert('입금 확인 처리가 완료되었습니다.');
      handleCloseOrderDetail();
    } catch (error: any) {
      console.error('입금 확인 처리 오류:', error);
      alert(error?.message ?? '입금 확인 처리 중 오류가 발생했습니다.');
    } finally {
      setOrderActionLoading(null);
    }
  };

  const clearOrderFilters = () => {
    setOrderStatusFilter('all');
    setOrderPaymentFilter('all');
    setOrderStartDate('');
    setOrderEndDate('');
    setOrderSortKey('date_desc');
  };

  const handleExportOrders = () => {
    if (sortedOrders.length === 0) {
      alert('내보낼 주문이 없습니다. 검색/필터 조건을 확인해주세요.');
      return;
    }

    const headers = ['주문ID', '주문일시', '고객명', '이메일', '결제수단', '상태', '총금액', '구매악보수'];
    const rows = sortedOrders.map((order) => {
      const paymentLabel = getPaymentMethodLabel(order.payment_method, order);
      const statusLabel = getOrderStatusMetaSafe(order.status).label;
      const itemCount = order.order_items?.length ?? 0;

      return [
        order.id,
        formatDateTime(order.created_at),
        order.profiles?.name ?? '이름 미확인',
        order.profiles?.email ?? '',
        paymentLabel,
        statusLabel,
        order.total_amount,
        itemCount,
      ];
    });

    const escapeCsv = (value: unknown) => {
      if (value === null || value === undefined) {
        return '';
      }
      const stringValue = String(value);
      if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };

    const csvRows = [headers, ...rows]
      .map((row) => row.map((cell) => escapeCsv(cell)).join(','));
    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `orders_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleSelectAllOrders = (checked: boolean) => {
    if (checked) {
      // 현재 필터링/정렬된 주문 전체 선택
      const allIds = sortedOrders.map((o) => o.id);
      setSelectedOrderIds(new Set(allIds));
    } else {
      setSelectedOrderIds(new Set());
    }
  };

  const handleBulkDeleteOrders = async () => {
    if (selectedOrderIds.size === 0) return;

    if (
      !window.confirm(
        `선택한 ${selectedOrderIds.size}개의 주문을 삭제하시겠습니까?\n삭제된 주문은 복구할 수 없습니다.`,
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .in('id', Array.from(selectedOrderIds));

      if (error) throw error;

      alert('선택한 주문이 삭제되었습니다.');
      setSelectedOrderIds(new Set());
      void loadOrders(); // 목록 새로고침
    } catch (error) {
      console.error('Error deleting orders:', error);
      alert('주문 삭제 중 오류가 발생했습니다.');
    }
  };
  const loadCopyrightReport = useCallback(
    async (rangeOverride?: { start: string; end: string }) => {
      const appliedStart = rangeOverride?.start ?? copyrightStartDate;
      const appliedEnd = rangeOverride?.end ?? copyrightEndDate;

      if (!appliedStart || !appliedEnd) {
        setCopyrightReportError('조회 기간을 선택해주세요.');
        return;
      }

      const startDateObj = new Date(`${appliedStart}T00:00:00`);
      const endDateObj = new Date(`${appliedEnd}T00:00:00`);
      if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime())) {
        setCopyrightReportError('유효한 날짜를 선택해주세요.');
        return;
      }

      if (startDateObj > endDateObj) {
        setCopyrightReportError('조회 시작일이 종료일보다 늦습니다.');
        return;
      }

      setCopyrightReportLoading(true);
      setCopyrightReportError(null);
      setDirectSalesData([]);
      setCashChargeData([]);

      try {
        const startTimestamp = `${appliedStart}T00:00:00`;
        const endTimestamp = `${appliedEnd}T23:59:59.999`;

        const { data, error } = await supabase
          .from('orders')
          .select(
            `
            id,
            order_number,
            created_at,
            status,
            payment_method,
            total_amount,
            profiles:profiles!orders_user_id_fkey (
              id,
              email
            ),
            order_items (
              id,
              drum_sheet_id,
              sheet_title,
              price,
              created_at,
              drum_sheets (
                id,
                title,
                artist,
                price,
                album_name
              )
            )
          `,
          )
          .eq('status', 'completed')
          .in('payment_method', [...KOREAN_PAYMENT_METHODS])
          .gte('created_at', startTimestamp)
          .lte('created_at', endTimestamp)
          .order('created_at', { ascending: false });

        if (error) {
          throw error;
        }

        const aggregatedMap = new Map<string, CopyrightReportRow>();
        const sheetIds = new Set<string>();

        (data ?? []).forEach((order: any) => {
          const items = Array.isArray(order.order_items) ? order.order_items : [];
          items.forEach((item: any) => {
            const sheet = item.drum_sheets ?? null;
            const sheetId = sheet?.id ?? item.drum_sheet_id ?? null;
            if (!sheetId) {
              return;
            }

            sheetIds.add(sheetId);

            const resolvedTitle = sheet?.title ?? item.sheet_title ?? '';
            const resolvedArtist = sheet?.artist ?? '';
            const resolvedAlbum = (sheet?.album_name ?? null) as string | null;

            const resolvedAmount = Number(
              typeof item.price === 'number' ? item.price : sheet?.price ?? 0,
            );
            const normalizedAmount = Number.isFinite(resolvedAmount) ? resolvedAmount : 0;

            const existing = aggregatedMap.get(sheetId);
            if (existing) {
              existing.purchaseCount += 1;
              existing.revenue += normalizedAmount;
              if (!existing.albumName && resolvedAlbum) {
                existing.albumName = resolvedAlbum;
              }
            } else {
              aggregatedMap.set(sheetId, {
                songId: sheetId,
                title: resolvedTitle,
                artist: resolvedArtist,
                albumName: resolvedAlbum,
                categoryName: null,
                purchaseCount: 1,
                unitAmount: normalizedAmount,
                revenue: normalizedAmount,
              });
            }
          });
        });

        const directSalesRows: DirectSaleRow[] = (data ?? []).map((order: any) => {
          const orderItems = Array.isArray(order.order_items) ? order.order_items : [];
          const paymentMethod: string | null = order.payment_method ?? null;
          const paymentMethodLabel = getPaymentMethodLabel(paymentMethod, order);

          return {
            orderId: order.id,
            orderNumber: order.order_number ?? null,
            orderedAt: order.created_at,
            paymentMethod,
            paymentMethodLabel,
            totalAmount: Number(order.total_amount ?? 0),
            itemCount: orderItems.length,
            customerEmail: order.profiles?.email ?? null,
          };
        });

        setDirectSalesData(directSalesRows);

        const { data: cashData, error: cashError } = await supabase
          .from('cash_transactions')
          .select(
            `
            id,
            user_id,
            amount,
            bonus_amount,
            balance_after,
            description,
            created_at,
            profiles:profiles!cash_transactions_user_id_fkey (
              email
            )
          `,
          )
          .eq('transaction_type', 'charge')
          .gte('created_at', startTimestamp)
          .lte('created_at', endTimestamp)
          .order('created_at', { ascending: false });

        if (cashError) {
          throw cashError;
        }

        const cashRows: CashChargeRow[] = (cashData ?? []).map((transaction: any) => {
          const amount = Number(transaction.amount ?? 0);
          const bonusAmount = Number(transaction.bonus_amount ?? 0);
          const totalCredit = amount + bonusAmount;

          return {
            id: transaction.id,
            userId: transaction.user_id,
            userEmail: transaction.profiles?.email ?? null,
            chargedAt: transaction.created_at,
            amount,
            bonusAmount,
            totalCredit,
            description: transaction.description ?? null,
            paymentLabel: extractPaymentLabelFromDescription(transaction.description),
          };
        });

        setCashChargeData(cashRows);

        // 카테고리 정보 별도 조회
        if (sheetIds.size > 0) {
          const { data: categoryData, error: categoryError } = await supabase
            .from('drum_sheet_categories')
            .select(
              `
              sheet_id,
              category:categories (
                name
              )
            `,
            )
            .in('sheet_id', Array.from(sheetIds));

          if (!categoryError && categoryData) {
            const categoryMap = new Map<string, string>();
            categoryData.forEach((row: any) => {
              if (row.sheet_id && row.category?.name) {
                const existingCategory = categoryMap.get(row.sheet_id);
                if (!existingCategory) {
                  categoryMap.set(row.sheet_id, row.category.name);
                }
              }
            });

            // 카테고리 정보 적용
            aggregatedMap.forEach((row) => {
              const categoryName = categoryMap.get(row.songId);
              if (categoryName) {
                row.categoryName = categoryName;
              }
            });
          }
        }

        const rows = Array.from(aggregatedMap.values()).map((row) => ({
          ...row,
          unitAmount:
            row.purchaseCount > 0 ? Number(row.revenue / row.purchaseCount) : row.unitAmount,
        }));

        rows.sort((a, b) => {
          if (b.revenue !== a.revenue) {
            return b.revenue - a.revenue;
          }
          if (b.purchaseCount !== a.purchaseCount) {
            return b.purchaseCount - a.purchaseCount;
          }
          return a.title.localeCompare(b.title, 'ko');
        });

        setCopyrightReportData(rows);
      } catch (error: unknown) {
        console.error('저작권 보고 데이터 로드 오류:', error);
        const message =
          error instanceof Error ? error.message : '데이터를 불러오는 중 문제가 발생했습니다.';
        setCopyrightReportError(message);
      } finally {
        setCopyrightReportLoading(false);
      }
    },
    [copyrightStartDate, copyrightEndDate],
  );

  useEffect(() => {
    if (activeMenu !== 'copyright-report') {
      copyrightInitialFetchRef.current = false;
      return;
    }
    if (!copyrightInitialFetchRef.current) {
      copyrightInitialFetchRef.current = true;
      void loadCopyrightReport();
    }
  }, [activeMenu, loadCopyrightReport]);

  const handleSelectCopyrightQuickRange = (key: CopyrightQuickRangeKey) => {
    const range = getRangeForQuickKey(key);
    setCopyrightQuickRange(key);
    setCopyrightStartDate(range.start);
    setCopyrightEndDate(range.end);
    void loadCopyrightReport(range);
  };

  const handleCopyrightStartDateChange = (value: string) => {
    setCopyrightStartDate(value);
    setCopyrightQuickRange('custom');
  };

  const handleCopyrightEndDateChange = (value: string) => {
    setCopyrightEndDate(value);
    setCopyrightQuickRange('custom');
  };

  const handleCopyrightSearch = () => {
    void loadCopyrightReport();
  };

  const handleCopyrightExport = async () => {
    if (copyrightReportData.length === 0) {
      alert('다운로드할 데이터가 없습니다. 먼저 조회를 실행해주세요.');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const worksheetData = [
        ['SONG ID', '앨범명', '작품명', '가수명', '구매 수', '', '장르 카테고리', '매출액'],
        ...copyrightReportData.map((row) => [
          row.songId,
          row.albumName ?? '',
          row.title,
          row.artist,
          row.purchaseCount,
          '',
          row.categoryName ?? '',
          Math.round(row.revenue),
        ]),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '저작권보고');

      const startToken = copyrightStartDate.replace(/-/g, '');
      const endToken = copyrightEndDate.replace(/-/g, '');
      const fileName = `저작권보고_${startToken}_${endToken}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('저작권 보고 엑셀 생성 오류:', error);
      alert('엑셀 파일 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
  };

  const loadCustomOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('custom_orders')
        .select(`
          *,
          profiles (
            id,
            email,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomOrders(data || []);
    } catch (error) {
      console.error('맞춤 제작 주문 목록 로드 오류:', error);
    }
  };

  const loadCustomerInquiries = async () => {
    setIsLoadingInquiries(true);
    try {
      const { data, error } = await supabase
        .from('customer_inquiries')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setCustomerInquiries(data ?? []);
    } catch (error) {
      console.error('고객 문의 로드 오류:', error);
    } finally {
      setIsLoadingInquiries(false);
    }
  };

  useEffect(() => {
    setInquiryReplyDrafts((prev) => {
      const next: Record<string, string> = {};
      customerInquiries.forEach((inquiry) => {
        next[inquiry.id] = Object.prototype.hasOwnProperty.call(prev, inquiry.id)
          ? prev[inquiry.id]
          : inquiry.admin_reply ?? '';
      });
      return next;
    });
  }, [customerInquiries]);

  const handleInquiryReplyDraftChange = (inquiryId: string, value: string) => {
    setInquiryReplyDrafts((prev) => ({
      ...prev,
      [inquiryId]: value,
    }));
  };

  const handleInquiryReplyReset = (inquiry: CustomerInquiry) => {
    setInquiryReplyDrafts((prev) => ({
      ...prev,
      [inquiry.id]: inquiry.admin_reply ?? '',
    }));
  };

  const handleInquiryReplySubmit = async (inquiry: CustomerInquiry) => {
    const draftValue = inquiryReplyDrafts[inquiry.id] ?? '';
    if (draftValue === (inquiry.admin_reply ?? '')) {
      alert('변경된 내용이 없습니다.');
      return;
    }

    const draft = draftValue.trim();
    const isClearing = draft.length === 0;

    if (isClearing) {
      const confirmed = window.confirm('답변을 비우면 문의 상태가 대기중으로 변경됩니다. 계속하시겠습니까?');
      if (!confirmed) {
        return;
      }
    }

    setInquiryReplySubmitting(inquiry.id);
    try {
      const updatePayload = {
        admin_reply: isClearing ? null : draft,
        status: isClearing ? 'pending' : 'answered',
        replied_at: isClearing ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('customer_inquiries').update(updatePayload).eq('id', inquiry.id);
      if (error) {
        throw error;
      }

      await loadCustomerInquiries();
      setInquiryReplyDrafts((prev) => ({
        ...prev,
        [inquiry.id]: isClearing ? '' : draft,
      }));
      alert(isClearing ? '답변이 삭제되었습니다.' : '답변이 저장되었습니다.');
    } catch (error) {
      console.error('문의 답변 저장 실패:', error);
      alert('답변 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setInquiryReplySubmitting(null);
    }
  };

  const loadEventDiscounts = async (withLoader = true) => {
    if (withLoader) {
      setIsLoadingEventDiscounts(true);
    }
    try {
      const data = await fetchEventDiscountList();
      setEventDiscounts(data);
    } catch (error) {
      console.error('이벤트 할인 악보 로드 오류:', error);
    } finally {
      if (withLoader) {
        setIsLoadingEventDiscounts(false);
      }
    }
  };

  const handleAnalyticsRefresh = () => {
    void loadAnalyticsData(analyticsPeriod);
  };
  const handleDirectSalesExport = async () => {
    if (directSalesData.length === 0) {
      alert('다운로드할 데이터가 없습니다. 먼저 조회를 실행해주세요.');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const worksheetData = [
        ['주문번호', '주문일시', '결제수단', '주문금액', '악보 수량', '고객 이메일'],
        ...directSalesData.map((order) => [
          order.orderNumber ?? order.orderId,
          formatDateTime(order.orderedAt),
          order.paymentMethodLabel,
          order.totalAmount,
          order.itemCount,
          order.customerEmail ?? '',
        ]),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '직접결제매출');

      const startToken = copyrightStartDate.replace(/-/g, '');
      const endToken = copyrightEndDate.replace(/-/g, '');
      const fileName = `직접결제매출_${startToken}_${endToken}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('직접 결제 매출 엑셀 생성 오류:', error);
      alert('직접 결제 매출 데이터를 내보내는 중 오류가 발생했습니다.');
    }
  };

  const handleCashChargeExport = async () => {
    if (cashChargeData.length === 0) {
      alert('다운로드할 데이터가 없습니다. 먼저 조회를 실행해주세요.');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const worksheetData = [
        ['충전일시', '고객 이메일', '충전 금액(유상)', '보너스 금액', '총 지급 캐시', '결제수단'],
        ...cashChargeData.map((transaction) => [
          formatDateTime(transaction.chargedAt),
          transaction.userEmail ?? '',
          transaction.amount,
          transaction.bonusAmount,
          transaction.totalCredit,
          transaction.paymentLabel,
        ]),
      ];

      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '캐시충전');

      const startToken = copyrightStartDate.replace(/-/g, '');
      const endToken = copyrightEndDate.replace(/-/g, '');
      const fileName = `캐시충전_${startToken}_${endToken}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('캐시 충전 엑셀 생성 오류:', error);
      alert('캐시 충전 데이터를 내보내는 중 오류가 발생했습니다.');
    }
  };

  const handleIntegratedCopyrightExport = async () => {
    const hasAnyData =
      copyrightReportData.length > 0 ||
      directSalesData.length > 0 ||
      cashChargeData.length > 0;

    if (!hasAnyData) {
      alert('다운로드할 데이터가 없습니다. 먼저 조회를 실행해주세요.');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      const purchaseSheetData = [
        ['SONG ID', '앨범명', '작품명', '가수명', '구매 수', '', '장르 카테고리', '매출액'],
        ...copyrightReportData.map((row) => [
          row.songId,
          row.albumName ?? '',
          row.title,
          row.artist,
          row.purchaseCount,
          '',
          row.categoryName ?? '',
          Math.round(row.revenue),
        ]),
      ];
      const purchaseSheet = XLSX.utils.aoa_to_sheet(purchaseSheetData);
      XLSX.utils.book_append_sheet(workbook, purchaseSheet, '곡당_구매수');

      const directSheetData = [
        ['주문번호', '주문일시', '결제수단', '주문금액', '악보 수량', '고객 이메일'],
        ...directSalesData.map((order) => [
          order.orderNumber ?? order.orderId,
          formatDateTime(order.orderedAt),
          order.paymentMethodLabel,
          order.totalAmount,
          order.itemCount,
          order.customerEmail ?? '',
        ]),
      ];
      const directSheet = XLSX.utils.aoa_to_sheet(directSheetData);
      XLSX.utils.book_append_sheet(workbook, directSheet, '직접결제_매출');

      const cashSheetData = [
        ['충전일시', '고객 이메일', '충전 금액(유상)', '보너스 금액', '총 지급 캐시', '결제수단'],
        ...cashChargeData.map((transaction) => [
          formatDateTime(transaction.chargedAt),
          transaction.userEmail ?? '',
          transaction.amount,
          transaction.bonusAmount,
          transaction.totalCredit,
          transaction.paymentLabel,
        ]),
      ];
      const cashSheet = XLSX.utils.aoa_to_sheet(cashSheetData);
      XLSX.utils.book_append_sheet(workbook, cashSheet, '캐시충전_유상');

      const totalPurchases = copyrightReportData.reduce(
        (sum, row) => sum + row.purchaseCount,
        0,
      );
      const totalDirectSalesAmount = directSalesData.reduce(
        (sum, order) => sum + (Number.isFinite(order.totalAmount) ? order.totalAmount : 0),
        0,
      );
      const totalCashChargeAmount = cashChargeData.reduce(
        (sum, transaction) => sum + (Number.isFinite(transaction.amount) ? transaction.amount : 0),
        0,
      );
      const totalCashBonusAmount = cashChargeData.reduce(
        (sum, transaction) => sum + (Number.isFinite(transaction.bonusAmount) ? transaction.bonusAmount : 0),
        0,
      );
      const summarySheetData = [
        ['항목', '값', '비고'],
        ['총 구매 수', totalPurchases, '해당 기간 내 판매된 악보의 구매 건수'],
        ['직접 결제 매출', totalDirectSalesAmount, '카드/무통장/카카오페이 결제 금액 합계'],
        ['캐시 충전 금액(유상)', totalCashChargeAmount, '실제 결제된 캐시 충전 금액'],
        ['캐시 보너스 지급', totalCashBonusAmount, '충전 시 추가 지급된 보너스 캐시'],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, '요약통계');

      const startToken = copyrightStartDate.replace(/-/g, '');
      const endToken = copyrightEndDate.replace(/-/g, '');
      const fileName = `저작권보고_통합_${startToken}_${endToken}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('저작권 보고 통합 엑셀 생성 오류:', error);
      alert('통합 데이터를 내보내는 중 오류가 발생했습니다.');
    }
  };

  const handleAnalyticsExport = useCallback(async () => {
    if (!analyticsData) return;
    setAnalyticsExporting(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.json_to_sheet([
        {
          지표: '총 매출',
          값: analyticsData.summary.totalRevenue,
          '증감률(%)':
            analyticsData.summary.revenueGrowth != null
              ? Number(analyticsData.summary.revenueGrowth.toFixed(2))
              : '',
        },
        {
          지표: '총 주문 수',
          값: analyticsData.summary.totalOrders,
          '증감률(%)':
            analyticsData.summary.orderGrowth != null
              ? Number(analyticsData.summary.orderGrowth.toFixed(2))
              : '',
        },
        {
          지표: '총 회원 수',
          값: analyticsData.summary.totalCustomers,
          '증감률(%)':
            analyticsData.summary.customerGrowth != null
              ? Number(analyticsData.summary.customerGrowth.toFixed(2))
              : '',
        },
        {
          지표: '평균 주문 금액',
          값: analyticsData.summary.averageOrderValue,
          '증감률(%)':
            analyticsData.summary.averageOrderGrowth != null
              ? Number(analyticsData.summary.averageOrderGrowth.toFixed(2))
              : '',
        },
      ]);

      XLSX.utils.book_append_sheet(workbook, summarySheet, '요약');

      const revenueRows = analyticsData.revenueTrend.map((point) => ({
        구간: point.label,
        매출: point.revenue,
        주문수: point.orders,
        타임스탬프: new Date(point.timestamp).toISOString(),
      }));
      const revenueSheet = XLSX.utils.json_to_sheet(revenueRows);
      XLSX.utils.book_append_sheet(workbook, revenueSheet, '매출_주문_추이');

      const popularRows = analyticsData.popularSheets.map((sheet, index) => ({
        순위: index + 1,
        악보ID: sheet.sheetId,
        제목: sheet.title,
        아티스트: sheet.artist,
        주문수: sheet.orders,
        매출: sheet.revenue,
      }));
      const popularSheet = XLSX.utils.json_to_sheet(popularRows);
      XLSX.utils.book_append_sheet(workbook, popularSheet, '인기_악보_TOP10');

      const categoryRows = analyticsData.categoryBreakdown.map((category) => ({
        카테고리ID: category.categoryId ?? '',
        카테고리명: category.categoryName,
        주문수: category.orders,
        매출: category.revenue,
      }));
      const categorySheet = XLSX.utils.json_to_sheet(categoryRows);
      XLSX.utils.book_append_sheet(workbook, categorySheet, '카테고리별_판매');

      const customOrderStatusRows = analyticsData.customOrder.statusDistribution.map((item) => ({
        상태: item.status,
        건수: item.count,
      }));
      const customOrderMetricsSheet = XLSX.utils.json_to_sheet([
        { 항목: '총 요청 수', 값: analyticsData.customOrder.metrics.totalCount },
        { 항목: '진행 중', 값: analyticsData.customOrder.metrics.activeCount },
        { 항목: '평균 견적 금액', 값: analyticsData.customOrder.metrics.averageEstimatedPrice },
      ]);
      XLSX.utils.book_append_sheet(workbook, customOrderMetricsSheet, '커스텀주문_요약');
      const customOrderStatusSheet = XLSX.utils.json_to_sheet(customOrderStatusRows);
      XLSX.utils.book_append_sheet(workbook, customOrderStatusSheet, '커스텀주문_상태');

      const newUsersRows = analyticsData.newUsersTrend.map((point) => ({
        구간: point.label,
        신규회원수: point.count,
        타임스탬프: new Date(point.timestamp).toISOString(),
      }));
      const newUsersSheet = XLSX.utils.json_to_sheet(newUsersRows);
      XLSX.utils.book_append_sheet(workbook, newUsersSheet, '신규회원_추이');

      const fileName = `copydrum-analytics-${analyticsData.period}-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('분석 데이터 내보내기 오류:', error);
      alert('데이터 내보내기에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setAnalyticsExporting(false);
    }
  }, [analyticsData]);

  const handleAnalyticsPeriodChange = (value: AnalyticsPeriod) => {
    if (value === analyticsPeriod) return;
    setAnalyticsPeriod(value);
  };

  const searchEventCandidateSheets = async () => {
    const keyword = eventSearchTerm.trim();
    if (!keyword) {
      alert('검색어를 입력해주세요.');
      return;
    }
    setIsEventSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from('drum_sheets')
        .select('id, title, artist, price, thumbnail_url, category_id')
        .or(`title.ilike.%${keyword}%,artist.ilike.%${keyword}%`)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;

      const normalized = (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        artist: item.artist,
        price: item.price ?? 0,
        thumbnail_url: item.thumbnail_url,
        category_id: item.category_id,
      })) as EventSheetCandidate[];

      setEventSearchResults(normalized);
    } catch (error) {
      console.error('이벤트 할인 악보 검색 오류:', error);
      alert('악보 검색 중 오류가 발생했습니다.');
    } finally {
      setIsEventSearchLoading(false);
    }
  };

  const resetEventFormState = () => {
    setSelectedEventSheet(null);
    setEventForm(createDefaultEventForm());
    setEditingEventId(null);
    setEventSearchResults([]);
  };

  const updateEventForm = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setEventForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const clearSelectedEventSheet = () => {
    setSelectedEventSheet(null);
    setEditingEventId(null);
    setEventForm(createDefaultEventForm());
  };

  const handleSelectEventCandidate = (sheet: EventSheetCandidate) => {
    setSelectedEventSheet(sheet);
    const existing = eventDiscounts.find((item) => item.sheet_id === sheet.id);

    if (existing) {
      setEditingEventId(existing.id);
      setEventForm({
        event_start: toDatetimeLocalString(existing.event_start),
        event_end: toDatetimeLocalString(existing.event_end),
        discount_price: existing.discount_price ?? DEFAULT_EVENT_PRICE,
        original_price: existing.original_price ?? sheet.price ?? 0,
        is_active: existing.is_active,
      });
    } else {
      const defaultForm = createDefaultEventForm();
      setEditingEventId(null);
      setEventForm({
        ...defaultForm,
        original_price: sheet.price ?? 0,
      });
    }
  };
  const handleEditEventDiscount = (event: EventDiscountSheet) => {
    setEditingEventId(event.id);
    setSelectedEventSheet({
      id: event.sheet_id,
      title: event.title || '',
      artist: event.artist || '',
      price: event.original_price ?? DEFAULT_EVENT_PRICE,
      thumbnail_url: event.thumbnail_url ?? undefined,
      category_id: event.category_id ?? undefined,
    });
    setEventForm({
      event_start: toDatetimeLocalString(event.event_start),
      event_end: toDatetimeLocalString(event.event_end),
      discount_price: event.discount_price ?? DEFAULT_EVENT_PRICE,
      original_price: event.original_price ?? DEFAULT_EVENT_PRICE,
      is_active: event.is_active,
    });
  };

  const handleDeleteEventDiscount = async (eventId: string) => {
    if (!window.confirm('해당 이벤트 할인 악보를 삭제하시겠습니까?')) {
      return;
    }
    setDeletingEventId(eventId);
    try {
      await deleteEventDiscountById(eventId);
      await loadEventDiscounts();
      if (editingEventId === eventId) {
        resetEventFormState();
      }
      alert('이벤트 할인 악보가 삭제되었습니다.');
    } catch (error) {
      console.error('이벤트 할인 악보 삭제 오류:', error);
      alert('이벤트 할인 악보 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeletingEventId(null);
    }
  };

  const handleToggleEventDiscount = async (event: EventDiscountSheet) => {
    setUpdatingEventId(event.id);
    try {
      await upsertEventDiscountSheet({
        id: event.id,
        sheet_id: event.sheet_id,
        discount_price: event.discount_price ?? DEFAULT_EVENT_PRICE,
        original_price: event.original_price ?? DEFAULT_EVENT_PRICE,
        event_start: event.event_start,
        event_end: event.event_end,
        is_active: !event.is_active,
      });
      await loadEventDiscounts(false);
      if (editingEventId === event.id) {
        setEventForm((prev) => ({
          ...prev,
          is_active: !event.is_active,
        }));
      }
    } catch (error) {
      console.error('이벤트 할인 악보 상태 변경 오류:', error);
      alert('이벤트 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingEventId(null);
    }
  };

  const handleSaveEventDiscount = async () => {
    if (!selectedEventSheet) {
      alert('이벤트로 등록할 악보를 먼저 선택해주세요.');
      return;
    }

    const { event_start, event_end, original_price, is_active } = eventForm;

    if (!event_start || !event_end) {
      alert('이벤트 시작 시간과 종료 시간을 모두 입력해주세요.');
      return;
    }

    const startIso = datetimeLocalToIsoString(event_start);
    const endIso = datetimeLocalToIsoString(event_end);

    if (!startIso || !endIso) {
      alert('이벤트 기간 값이 올바르지 않습니다.');
      return;
    }

    if (new Date(startIso) >= new Date(endIso)) {
      alert('이벤트 종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }

    if (!original_price || original_price <= DEFAULT_EVENT_PRICE) {
      if (!window.confirm('정가가 100원 이하입니다. 그래도 이벤트를 등록하시겠습니까?')) {
        return;
      }
    }

    setIsSavingEventDiscount(true);
    try {
      await upsertEventDiscountSheet({
        id: editingEventId ?? undefined,
        sheet_id: selectedEventSheet.id,
        original_price: original_price,
        discount_price: DEFAULT_EVENT_PRICE,
        event_start: startIso,
        event_end: endIso,
        is_active,
      });

      await loadEventDiscounts();
      alert(editingEventId ? '이벤트 할인 악보가 수정되었습니다.' : '이벤트 할인 악보가 등록되었습니다.');
      resetEventFormState();
      setEventSearchTerm('');
    } catch (error) {
      console.error('이벤트 할인 악보 저장 오류:', error);
      alert('이벤트 할인 악보 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingEventDiscount(false);
    }
  };

  const loadCollections = async () => {
    try {
      const { data, error } = await supabase
        .from('collections')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const normalized = (data || []).map((collection: any) => ({
        ...collection,
        category_ids: collection.category_ids || (collection.category_id ? [collection.category_id] : [])
      }));
      setCollections(normalized);
    } catch (error) {
      console.error('모음집 목록 로드 오류:', error);
    }
  };

  const loadCollectionSheets = async (collectionId: string) => {
    try {
      const { data, error } = await supabase
        .from('collection_sheets')
        .select(`
          *,
          drum_sheets (
            id,
            title,
            artist,
            thumbnail_url
          )
        `)
        .eq('collection_id', collectionId);

      if (error) throw error;
      setCollectionSheets(data || []);
    } catch (error) {
      console.error('모음집 악보 목록 로드 오류:', error);
    }
  };

  // 선택한 악보들의 가격 합산
  const calculateTotalPrice = (selectedSheets: DrumSheet[]): number => {
    return selectedSheets.reduce((total, sheet) => total + (sheet.price || 0), 0);
  };

  // 할인가 변경 시 할인율 자동 계산
  const calculateDiscountPercentage = (originalPrice: number, salePrice: number): number => {
    if (originalPrice <= 0 || salePrice <= 0 || salePrice >= originalPrice) return 0;
    return Math.round(((originalPrice - salePrice) / originalPrice) * 100);
  };

  // 악보 검색 필터링 (성능 최적화: useMemo 사용)
  const filteredSheetsForCollection = React.useMemo(() => {
    const searchLower = collectionSheetSearchTerm.toLowerCase();
    const artistLower = collectionArtistSearchTerm.toLowerCase();
    const selectedIds = new Set(selectedSheetsForNewCollection.map(s => s.id));

    return sheets.filter(sheet => {
      const matchesSearch = !collectionSheetSearchTerm ||
        sheet.title.toLowerCase().includes(searchLower) ||
        sheet.artist.toLowerCase().includes(searchLower);
      const matchesArtist = !collectionArtistSearchTerm ||
        sheet.artist.toLowerCase().includes(artistLower);
      const notSelected = !selectedIds.has(sheet.id);
      return matchesSearch && matchesArtist && notSelected;
    });
  }, [sheets, collectionSheetSearchTerm, collectionArtistSearchTerm, selectedSheetsForNewCollection]);

  // 아티스트별 악보 그룹화
  const sheetsByArtist = filteredSheetsForCollection.reduce((acc, sheet) => {
    const artist = sheet.artist || '알 수 없음';
    if (!acc[artist]) acc[artist] = [];
    acc[artist].push(sheet);
    return acc;
  }, {} as Record<string, DrumSheet[]>);

  const handleAddSheetToNewCollection = (sheet: DrumSheet) => {
    if (!selectedSheetsForNewCollection.some(s => s.id === sheet.id)) {
      const updated = [...selectedSheetsForNewCollection, sheet];
      setSelectedSheetsForNewCollection(updated);
      const totalPrice = calculateTotalPrice(updated);
      setNewCollection({ ...newCollection, original_price: totalPrice });
    }
  };

  const handleRemoveSheetFromNewCollection = (sheetId: string) => {
    const updated = selectedSheetsForNewCollection.filter(s => s.id !== sheetId);
    setSelectedSheetsForNewCollection(updated);
    const totalPrice = calculateTotalPrice(updated);
    setNewCollection({ ...newCollection, original_price: totalPrice });
  };

  const handleSelectArtistSheets = (artist: string) => {
    const artistSheets = sheetsByArtist[artist] || [];
    const newSheets = artistSheets.filter(sheet =>
      !selectedSheetsForNewCollection.some(s => s.id === sheet.id)
    );
    const updated = [...selectedSheetsForNewCollection, ...newSheets];
    setSelectedSheetsForNewCollection(updated);
    const totalPrice = calculateTotalPrice(updated);
    setNewCollection({ ...newCollection, original_price: totalPrice });
  };
  const handleAddCollection = async () => {
    if (!newCollection.title) {
      alert('제목은 필수입니다.');
      return;
    }

    if (selectedSheetsForNewCollection.length === 0) {
      alert('최소 1개 이상의 악보를 선택해주세요.');
      return;
    }

    setIsAddingCollectionLoading(true);

    try {
      const discount = calculateDiscountPercentage(newCollection.original_price, newCollection.sale_price);
      const titleTranslations = buildInitialTranslations(newCollection.title_translations, newCollection.title);
      const descriptionTranslations = buildInitialTranslations(
        newCollection.description_translations,
        newCollection.description,
      );

      // category_ids 처리: 빈 배열이면 null, 있으면 배열로
      const categoryIds = newCollection.category_ids && newCollection.category_ids.length > 0
        ? newCollection.category_ids
        : null;

      // category_id는 첫 번째 선택된 카테고리 또는 null
      const categoryId = categoryIds && categoryIds.length > 0 ? categoryIds[0] : null;

      const insertData: any = {
        title: newCollection.title,
        description: newCollection.description || null,
        thumbnail_url: newCollection.thumbnail_url || null,
        original_price: newCollection.original_price,
        sale_price: newCollection.sale_price,
        discount_percentage: discount,
        is_active: newCollection.is_active,
        category_id: categoryId,
        category_ids: categoryIds,
        title_translations: titleTranslations,
        description_translations: descriptionTranslations,
      };

      // 모음집 생성
      const { data: collectionData, error: collectionError } = await supabase
        .from('collections')
        .insert([insertData])
        .select()
        .single();

      if (collectionError) throw collectionError;

      // 선택한 악보들을 모음집에 추가 (배치 처리로 성능 최적화)
      if (selectedSheetsForNewCollection.length > 0) {
        const collectionSheetInserts = selectedSheetsForNewCollection.map(sheet => ({
          collection_id: collectionData.id,
          drum_sheet_id: sheet.id
        }));

        // 100개씩 나눠서 배치 처리 (대량 데이터 처리 시 성능 향상)
        const batchSize = 100;
        for (let i = 0; i < collectionSheetInserts.length; i += batchSize) {
          const batch = collectionSheetInserts.slice(i, i + batchSize);
          const { error: sheetsError } = await supabase
            .from('collection_sheets')
            .insert(batch);

          if (sheetsError) throw sheetsError;
        }
      }

      alert('모음집이 추가되었습니다.');
      setIsAddingCollection(false);
      setNewCollection(createEmptyCollectionFormState());
      setNewCollectionActiveLang('ko');
      setSelectedSheetsForNewCollection([]);
      setCollectionSheetSearchTerm('');
      setCollectionArtistSearchTerm('');
      loadCollections();
    } catch (error) {
      console.error('모음집 추가 오류:', error);
      alert('모음집 추가에 실패했습니다.');
    } finally {
      setIsAddingCollectionLoading(false);
    }
  };

  const handleUpdateCollection = async () => {
    if (!editingCollection) return;
    if (!editingCollectionData.title) {
      alert('제목은 필수입니다.');
      return;
    }

    try {
      const discount = editingCollectionData.original_price > 0 && editingCollectionData.sale_price > 0
        ? Math.round(((editingCollectionData.original_price - editingCollectionData.sale_price) / editingCollectionData.original_price) * 100)
        : 0;
      const titleTranslations = buildInitialTranslations(
        editingCollectionData.title_translations,
        editingCollectionData.title,
      );
      const descriptionTranslations = buildInitialTranslations(
        editingCollectionData.description_translations,
        editingCollectionData.description,
      );

      // category_ids 처리: 빈 배열이면 null, 있으면 배열로
      const categoryIds = editingCollectionData.category_ids && editingCollectionData.category_ids.length > 0
        ? editingCollectionData.category_ids
        : null;

      // category_id는 첫 번째 선택된 카테고리 또는 null
      const categoryId = categoryIds && categoryIds.length > 0 ? categoryIds[0] : null;

      const updateData: any = {
        title: editingCollectionData.title,
        description: editingCollectionData.description || null,
        thumbnail_url: editingCollectionData.thumbnail_url || null,
        original_price: editingCollectionData.original_price,
        sale_price: editingCollectionData.sale_price,
        discount_percentage: discount,
        is_active: editingCollectionData.is_active,
        category_id: categoryId,
        category_ids: categoryIds,
        title_translations: titleTranslations,
        description_translations: descriptionTranslations,
      };

      const { error } = await supabase
        .from('collections')
        .update(updateData)
        .eq('id', editingCollection.id);

      if (error) {
        console.error('모음집 수정 오류 상세:', error);
        throw error;
      }

      alert('모음집이 수정되었습니다.');
      setEditingCollection(null);
      setEditingCollectionData(createEmptyCollectionFormState());
      setEditingCollectionActiveLang('ko');
      loadCollections();
    } catch (error: any) {
      console.error('모음집 수정 오류:', error);
      alert(`모음집 수정에 실패했습니다: ${error.message || '알 수 없는 오류'}`);
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (!confirm('정말 이 모음집을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('id', id);

      if (error) throw error;

      alert('모음집이 삭제되었습니다.');
      loadCollections();
    } catch (error) {
      console.error('모음집 삭제 오류:', error);
      alert('모음집 삭제에 실패했습니다.');
    }
  };

  const handleAddSheetToCollection = async (sheetId: string) => {
    if (!selectedCollectionId) return;

    try {
      const { error } = await supabase
        .from('collection_sheets')
        .insert([{
          collection_id: selectedCollectionId,
          drum_sheet_id: sheetId
        }]);

      if (error) throw error;

      alert('악보가 모음집에 추가되었습니다.');
      if (selectedCollectionId) {
        loadCollectionSheets(selectedCollectionId);
      }
    } catch (error: any) {
      if (error.code === '23505') {
        alert('이미 모음집에 포함된 악보입니다.');
      } else {
        console.error('악보 추가 오류:', error);
        alert('악보 추가에 실패했습니다.');
      }
    }
  };

  const handleRemoveSheetFromCollection = async (collectionSheetId: string) => {
    if (!confirm('이 악보를 모음집에서 제거하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('collection_sheets')
        .delete()
        .eq('id', collectionSheetId);

      if (error) throw error;

      alert('악보가 모음집에서 제거되었습니다.');
      if (selectedCollectionId) {
        loadCollectionSheets(selectedCollectionId);
      }
    } catch (error) {
      console.error('악보 제거 오류:', error);
      alert('악보 제거에 실패했습니다.');
    }
  };

  // 기존 코드: 회원, CSV, 악보, 카테고리, 로그아웃 등 함수들
  const handleAddMember = async () => {
    if (!newMember.email || !newMember.name) {
      alert('이메일과 이름은 필수입니다.');
      return;
    }

    try {
      const { error } = await supabase
        .from('profiles')
        .insert([{
          email: newMember.email,
          name: newMember.name,
          kakao_id: newMember.kakao_id || null,
          google_id: newMember.google_id || null,
          is_admin: newMember.is_admin
        }]);

      if (error) throw error;

      alert('회원이 추가되었습니다.');
      setIsAddingMember(false);
      setNewMember({
        email: '',
        name: '',
        kakao_id: '',
        google_id: '',
        is_admin: false
      });
      loadMembers();
    } catch (error) {
      console.error('회원 추가 오류:', error);
      alert('회원 추가 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteMember = async (id: string) => {
    if (!confirm('정말로 이 회원을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      alert('회원이 삭제되었습니다.');
      loadMembers();
    } catch (error) {
      console.error('회원 삭제 오류:', error);
      alert('회원 삭제 중 오류가 발생했습니다.');
    }
  };

  const startBulkAddMembers = () => {
    setShowMemberBulkModal(true);
  };

  const downloadMemberCsvSample = () => {
    const csvContent = 'email,name,kakao_id,google_id\nexample@email.com,홍길동,kakao123,google456\ntest@test.com,김철수,,google789';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'member_sample.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processMemberCsvData = async () => {
    if (memberCsvData.length === 0) {
      alert('처리할 데이터가 없습니다.');
      return;
    }

    setIsMemberCsvProcessing(true);

    try {
      const raw = memberCsvData || [];
      const norm = (s: any) => (s ?? '').trim();
      const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
      const seen = new Set();
      const parsed = [];

      for (const r of raw) {
        const email = norm(r.email || r.Email || r.E_MAIL || '');
        const name = norm(r.name || r.Name || '');
        const kakao = norm(r.kakao_id || r.kakao || r.kakaoID || '');
        const google = norm(r.google_id || r.google || r.googleID || '');

        if (!email || email.toLowerCase() === 'email' || !emailOk(email)) continue;
        const em = email.toLowerCase();
        if (seen.has(em)) continue;
        seen.add(em);

        const row: any = { email: em };
        if (name) row.name = name;
        if (kakao) row.kakao_id = kakao;
        if (google) row.google_id = google;

        parsed.push(row);
      }

      console.log('최종 파싱된 데이터 length:', parsed.length);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        alert('로그인이 만료되었습니다. 다시 로그인해주세요.');
        window.location.href = LOGIN_PATH;
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_PUBLIC_SUPABASE_URL}/functions/v1/bulk-import-users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.NEXT_PUBLIC_PUBLIC_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ users: parsed })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const result = await response.json();

      if (result.success) {
        alert(`CSV 처리가 완료되었습니다.\n성공: ${result.successCount}개\n실패: ${result.errorCount}개`);

        setShowMemberBulkModal(false);
        setMemberCsvFile(null);
        setMemberCsvData([]);

        await loadMembers();
      } else {
        throw new Error(result.error || '알 수 없는 오류가 발생했습니다.');
      }

    } catch (error) {
      console.error('CSV 처리 오류:', error);
      alert(`CSV 처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsMemberCsvProcessing(false);
    }
  };

  const handleMemberCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMemberCsvFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      console.log('CSV 파일 내용:', text);

      const lines = text.split('\n').filter(line => line.trim());
      console.log('파싱된 라인 수:', lines.length);

      if (lines.length < 2) {
        alert('CSV 파일에 데이터가 없습니다.');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      console.log('헤더:', headers);

      const expectedHeaders = ['email', 'name', 'kakao_id', 'google_id'];

      const isValidFormat = expectedHeaders.every(header =>
        headers.some(h => h.toLowerCase().includes(header.toLowerCase()))
      );

      if (!isValidFormat) {
        alert('CSV 파일 형식이 올바르지 않습니다.\n필요한 컬럼: email, name, kakao_id, google_id');
        return;
      }

      const data = lines.slice(1).map((line, index) => {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
          } else {
            current += char;
          }
        }
        values.push(current.trim().replace(/^"|"$/g, ''));

        console.log(`행 ${index + 1} 파싱 결과:`, values);

        return {
          id: index + 1,
          email: values[0] || '',
          name: values[1] || '',
          kakao_id: values[2]?.trim() || null,
          google_id: values[3]?.trim() || null,
          valid: values[0] && values[1]
        };
      }).filter(item => item.email && item.name);

      console.log('최종 파싱된 데이터:', data);
      setMemberCsvData(data);
    };

    reader.onerror = (error) => {
      console.error('파일 읽기 오류:', error);
      alert('파일을 읽는 중 오류가 발생했습니다.');
    };

    reader.readAsText(file, 'UTF-8');
  };

  const fetchSpotifyInfo = async (title: string, artist: string) => {
    if (!title || !artist) return;

    setIsLoadingSpotify(true);
    try {
      const result = await searchTrackAndGetCoverWithAlbum(artist, title);
      if (result) {
        setNewSheet(prev => ({
          ...prev,
          thumbnail_url: result.albumCoverUrl || '',
          album_name: result.albumName || ''
        }));

        // 장르가 있으면 카테고리 자동 선택 (선택사항)
        if (result.genre) {
          const matchingCategory = categories.find(cat =>
            cat.name.toLowerCase().includes(result.genre!.toLowerCase())
          );
          if (matchingCategory && !newSheet.category_id) {
            setNewSheet(prev => ({
              ...prev,
              category_id: matchingCategory.id
            }));
          }
        }
      }
    } catch (error) {
      console.error('Spotify 정보 가져오기 오류:', error);
    } finally {
      setIsLoadingSpotify(false);
    }
  };

  // 유튜브 URL에서 영상 ID 추출
  const extractVideoId = (url: string): string | null => {
    if (!url) return null;

    // 다양한 유튜브 URL 형식 지원
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  };

  // 유튜브 썸네일 가져오기
  const fetchYoutubeThumbnail = async (youtubeUrl: string, isEditing: boolean = false) => {
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      alert('유효한 유튜브 URL이 아닙니다.');
      return;
    }

    // 먼저 maxresdefault.jpg 시도
    const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    try {
      // 이미지 존재 여부 확인
      const response = await fetch(maxResUrl, { method: 'HEAD' });

      if (response.ok) {
        if (isEditing) {
          setEditingSheetData(prev => ({ ...prev, thumbnail_url: maxResUrl }));
        } else {
          setNewSheet(prev => ({ ...prev, thumbnail_url: maxResUrl }));
        }
        return;
      }
    } catch (error) {
      console.log('maxresdefault.jpg 로드 실패, 0.jpg로 폴백');
    }

    // 폴백: 0.jpg 사용
    const fallbackUrl = `https://img.youtube.com/vi/${videoId}/0.jpg`;
    if (isEditing) {
      setEditingSheetData(prev => ({ ...prev, thumbnail_url: fallbackUrl }));
    } else {
      setNewSheet(prev => ({ ...prev, thumbnail_url: fallbackUrl }));
    }
  };

  // PDF 페이지수 추출
  const extractPdfPageCount = async (file: File): Promise<number> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      return pdf.numPages;
    } catch (error) {
      console.error('PDF 페이지수 추출 오류:', error);
      return 0;
    }
  };

  // 이미지 데이터에 모자이크 효과 적용
  const applyMosaicToImageData = (imageData: ImageData, blockSize: number = 15): ImageData => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    // 하단 절반에만 모자이크 적용
    const startY = Math.floor(height * 0.4);

    for (let y = startY; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        // 블록의 평균 색상 계산
        let r = 0, g = 0, b = 0, count = 0;

        for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
          for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }

        if (count > 0) {
          r = Math.floor(r / count);
          g = Math.floor(g / count);
          b = Math.floor(b / count);

          // 블록 전체를 평균 색상으로 채우기
          for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
            for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4;
              data[idx] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
              // alpha는 유지
            }
          }
        }
      }
    }

    return imageData;
  };
  // PDF 파일 업로드 및 미리보기 생성
  const handlePdfUpload = async (file: File) => {
    setIsUploadingPdf(true);
    try {
      // 1. 페이지수 추출
      const pageCount = await extractPdfPageCount(file);
      setNewSheet(prev => ({ ...prev, page_count: pageCount }));

      // 2. PDF 파일을 Supabase Storage에 업로드
      // [수정] 파일명 안전하게 처리 (한글/공백/특수문자 제거)
      const fileExt = file.name.split('.').pop() || 'pdf';
      // 영문, 숫자, ., -, _ 만 남기고 모두 제거
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      // 만약 이름이 다 지워졌다면(한글로만 된 파일 등), 랜덤 ID 사용
      const safeName = sanitizedName.length > 2 
        ? sanitizedName 
        : `sheet_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
      
      // 타임스탬프 + 안전한 파일명 조합
      const fileName = `${Date.now()}_${safeName}`;
      const filePath = `pdfs/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('drum-sheets')
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 3. 업로드된 PDF의 공개 URL 가져오기
      const { data: urlData } = supabase.storage
        .from('drum-sheets')
        .getPublicUrl(filePath);

      const pdfUrl = urlData.publicUrl;

      // 4. 미리보기 이미지 생성 (클라이언트 사이드에서 PDF.js로 렌더링)
      let previewImageUrl = '';
      try {
        console.log('미리보기 이미지 생성 시작 (클라이언트 사이드 렌더링)');
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        if (pdf.numPages === 0) {
          throw new Error('PDF에 페이지가 없습니다.');
        }
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Canvas context를 가져올 수 없습니다.');
        }
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const mosaicImageData = applyMosaicToImageData(imageData, 15);
        context.putImageData(mosaicImageData, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas를 Blob으로 변환 실패'));
            }
          }, 'image/jpeg', 0.85);
        });

        // 미리보기 이미지명도 안전하게 처리
        const imageFileName = `preview_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const imageFilePath = `previews/${imageFileName}`;

        const { error: imageUploadError } = await supabase.storage
          .from('drum-sheets')
          .upload(imageFilePath, blob, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (imageUploadError) {
          throw new Error(`이미지 업로드 실패: ${imageUploadError.message}`);
        }

        const { data: imageUrlData } = supabase.storage
          .from('drum-sheets')
          .getPublicUrl(imageFilePath);

        previewImageUrl = imageUrlData.publicUrl;
        setNewSheet(prev => ({ ...prev, preview_image_url: previewImageUrl }));

      } catch (previewError) {
        console.warn('미리보기 이미지 생성 중 오류 발생 (악보 등록은 계속 진행):', previewError);
      }

      setNewSheet(prev => ({ ...prev, pdf_url: pdfUrl }));
      if (previewImageUrl) {
        alert(`PDF 업로드 완료! 페이지수: ${pageCount}페이지`);
      } else {
        alert(`PDF 업로드 완료! 페이지수: ${pageCount}페이지\n\n⚠️ 미리보기 이미지 생성에 실패했습니다.`);
      }
    } catch (error: any) {
      console.error('PDF 업로드 오류:', error);
      alert(`PDF 업로드 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  // 썸네일 파일 업로드
  const handleThumbnailUpload = async (file: File) => {
    setIsUploadingThumbnail(true);
    try {
      // 이미지 파일 형식 확인
      const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      if (!allowedExtensions.includes(fileExt)) {
        alert('지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP 파일만 업로드 가능합니다.');
        setIsUploadingThumbnail(false);
        return;
      }

      // 파일명 안전하게 처리 (한글/공백/특수문자 제거)
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      // 만약 이름이 다 지워졌다면(한글로만 된 파일 등), 랜덤 ID 사용
      const safeName = sanitizedName.length > 2 
        ? sanitizedName 
        : `thumbnail_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
      
      // 타임스탬프 + 안전한 파일명 조합
      const fileName = `${Date.now()}_${safeName}`;
      const filePath = `thumbnails/${fileName}`;

      // Supabase Storage에 업로드
      const contentType = fileExt === 'png' ? 'image/png' : 
                          fileExt === 'webp' ? 'image/webp' : 
                          'image/jpeg';

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('drum-sheets')
        .upload(filePath, file, {
          contentType: contentType,
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 업로드된 썸네일의 공개 URL 가져오기
      const { data: urlData } = supabase.storage
        .from('drum-sheets')
        .getPublicUrl(filePath);

      const thumbnailUrl = urlData.publicUrl;

      // 상태 업데이트
      setNewSheet(prev => ({ 
        ...prev, 
        thumbnail_url: thumbnailUrl,
        thumbnail_file: file
      }));

      alert('썸네일이 업로드되었습니다.');
    } catch (error: any) {
      console.error('썸네일 업로드 오류:', error);
      alert(`썸네일 업로드 중 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`);
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const handleAddSheet = async () => {
    if (!newSheet.title || !newSheet.artist || newSheet.category_ids.length === 0) {
      alert('제목, 아티스트, 카테고리는 필수입니다.');
      return;
    }

    if (!newSheet.pdf_url) {
      alert('PDF 파일을 업로드해주세요.');
      return;
    }

    try {
      // difficulty 값 검증 및 정규화
      // ⚠️ 중요: 데이터베이스는 한국어 값('초급', '중급', '고급')만 허용합니다!
      let difficultyInput = (newSheet.difficulty || '초급').trim();

      // 영어/한국어 난이도를 한국어로 변환 (데이터베이스 제약 조건에 맞춤)
      const difficultyMap: Record<string, string> = {
        // 영어 → 한국어 (대소문자 구분 없이)
        'beginner': '초급',
        'intermediate': '중급',
        'advanced': '고급',
        // 한국어 → 한국어 (그대로 유지)
        '초급': '초급',
        '중급': '중급',
        '고급': '고급'
      };

      // 소문자로 변환하여 매핑 (영어 값 처리)
      const normalizedInput = difficultyInput.toLowerCase();
      let difficulty = difficultyMap[normalizedInput] || difficultyMap[difficultyInput] || '초급';

      // 최종 검증: 허용된 한국어 값만 사용
      const validDifficulties = ['초급', '중급', '고급'];
      if (!validDifficulties.includes(difficulty)) {
        console.warn(`유효하지 않은 difficulty 값: ${newSheet.difficulty}, 기본값 '초급' 사용`);
        difficulty = '초급';
      }

      // category_id는 첫 번째 선택된 카테고리로 설정 (하위 호환성)
      const categoryId = newSheet.category_ids.length > 0 ? newSheet.category_ids[0] : '';

      const insertData: any = {
        title: newSheet.title.trim(),
        artist: newSheet.artist.trim(),
        difficulty: difficulty, // 정규화된 값 사용 (반드시 포함)
        price: Number(newSheet.price) || 0,
        category_id: categoryId,
        pdf_url: newSheet.pdf_url, // 필수 필드
        is_active: true
      };

      // 선택적 필드 추가
      if (newSheet.thumbnail_url) {
        insertData.thumbnail_url = newSheet.thumbnail_url.trim();
      }
      if (newSheet.album_name) {
        insertData.album_name = newSheet.album_name.trim();
      }
      if (newSheet.page_count && newSheet.page_count > 0) {
        insertData.page_count = Number(newSheet.page_count);
      }
      if (newSheet.tempo && newSheet.tempo > 0) {
        insertData.tempo = Number(newSheet.tempo);
      }
      if (newSheet.preview_image_url) {
        insertData.preview_image_url = newSheet.preview_image_url.trim();
      }
      if (newSheet.youtube_url) {
        insertData.youtube_url = newSheet.youtube_url.trim();
      }

      // difficulty 값 최종 확인 및 로깅
      console.log('=== 악보 추가 데이터 ===');
      console.log(JSON.stringify(insertData, null, 2));
      console.log('difficulty 값 확인:', {
        원본: newSheet.difficulty,
        정규화됨: difficulty,
        최종값: insertData.difficulty,
        타입: typeof insertData.difficulty
      });

      // difficulty 값이 확실히 올바른지 다시 한 번 확인 (한국어 값으로)
      const validKoreanDifficulties = ['초급', '중급', '고급'];
      if (!validKoreanDifficulties.includes(insertData.difficulty)) {
        console.error('❌ 유효하지 않은 difficulty 값 감지:', insertData.difficulty);
        insertData.difficulty = '초급';
        console.warn('difficulty를 기본값 "초급"으로 변경');
      }

      // 최종 검증: 모든 필수 필드 확인
      console.log('=== 최종 검증 ===');
      console.log('title:', insertData.title);
      console.log('artist:', insertData.artist);
      console.log('difficulty:', insertData.difficulty, '타입:', typeof insertData.difficulty);
      console.log('price:', insertData.price, typeof insertData.price);
      console.log('category_id:', insertData.category_id);
      console.log('pdf_url:', insertData.pdf_url ? '있음' : '없음');

      // difficulty 값을 문자열로 명시적으로 변환 (혹시 모를 타입 문제 방지)
      insertData.difficulty = String(insertData.difficulty);

      // 최종 검증: difficulty가 정확히 허용된 한국어 값 중 하나인지 확인
      const finalDifficulty = validKoreanDifficulties.find(
        d => d === insertData.difficulty
      ) || '초급';

      if (finalDifficulty !== insertData.difficulty) {
        console.warn(`difficulty 값 "${insertData.difficulty}"를 "${finalDifficulty}"로 수정`);
        insertData.difficulty = finalDifficulty;
      }

      console.log('=== 최종 difficulty 값 (한국어) ===', insertData.difficulty);

      // ─── slug 자동 생성 (아티스트-제목 형식) ───
      const generateSlug = (artist: string, title: string): string => {
        const raw = `${artist}-${title}`;
        return raw
          .toLowerCase()
          .trim()
          .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '') // 영문, 숫자, 한글, 일본어, 중국어, 하이픈, 공백만 유지
          .replace(/\s+/g, '-')      // 공백 → 하이픈
          .replace(/-+/g, '-')       // 연속 하이픈 → 단일 하이픈
          .replace(/^-|-$/g, '');    // 앞뒤 하이픈 제거
      };

      let baseSlug = generateSlug(insertData.artist, insertData.title);
      if (!baseSlug) baseSlug = `sheet-${Date.now()}`; // 만약 빈 문자열이면 fallback

      // 중복 slug 확인 및 유니크 slug 생성
      let slug = baseSlug;
      let slugSuffix = 0;
      while (true) {
        const { data: existingSlug } = await supabase
          .from('drum_sheets')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();

        if (!existingSlug) break; // 중복 없음 → 사용 가능
        slugSuffix++;
        slug = `${baseSlug}-${slugSuffix}`;
      }

      insertData.slug = slug;
      console.log('=== 생성된 slug ===', slug);

      const { data, error } = await supabase
        .from('drum_sheets')
        .insert([insertData])
        .select();

      if (error) {
        console.error('=== Supabase 에러 상세 ===');
        console.error('에러 메시지:', error.message);
        console.error('에러 코드:', error.code);
        console.error('에러 상세:', error.details);
        console.error('에러 힌트:', error.hint);
        console.error('전체 에러 객체:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('악보 추가 성공:', data);

      // drum_sheet_categories 테이블에 관계 데이터 삽입
      if (data && data.length > 0 && newSheet.category_ids.length > 0) {
        const sheetId = data[0].id;
        const categoryRelations = newSheet.category_ids.map(categoryId => ({
          sheet_id: sheetId,
          category_id: categoryId
        }));

        const { error: relationError } = await supabase
          .from('drum_sheet_categories')
          .insert(categoryRelations);

        if (relationError) {
          console.error('카테고리 관계 추가 오류:', relationError);
          // 악보는 추가되었지만 카테고리 관계 추가 실패 시 경고만 표시
          alert('악보가 추가되었지만 카테고리 관계 추가 중 오류가 발생했습니다.');
        }
      }

      alert('악보가 추가되었습니다.');
      setIsAddingSheet(false);
      setNewSheet({
        title: '',
        artist: '',
        difficulty: '초급',
        price: 0,
        category_id: '',
        category_ids: [],
        thumbnail_url: '',
        thumbnail_file: null,
        album_name: '',
        page_count: 0,
        tempo: 0,
        pdf_file: null,
        preview_image_url: '',
        pdf_url: '',
        youtube_url: ''
      });
      loadSheets();
    } catch (error: any) {
      console.error('악보 추가 오류:', error);

      // Supabase 에러인 경우 상세 메시지 표시
      let errorMessage = '악보 추가 중 오류가 발생했습니다.';
      if (error?.message) {
        errorMessage += `\n\n오류: ${error.message}`;
      }
      if (error?.details) {
        errorMessage += `\n상세: ${error.details}`;
      }
      if (error?.hint) {
        errorMessage += `\n힌트: ${error.hint}`;
      }

      alert(errorMessage);
    }
  };

  const handleDeleteSheet = async (sheetId: string) => {
    if (!confirm('정말로 이 악보를 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('drum_sheets')
        .delete()
        .eq('id', sheetId);

      if (error) throw error;

      alert('악보가 삭제되었습니다.');
      loadSheets();
    } catch (error) {
      console.error('악보 삭제 오류:', error);
      alert('악보 삭제 중 오류가 발생했습니다.');
    }
  };

  const startBulkAddSheets = () => {
    setShowSheetBulkModal(true);
  };

  const downloadSheetCsvSample = () => {
    const csvContent = `곡명,아티스트,난이도,파일명,유튜브링크,장르,가격,템포
ONE MORE TIME,ALLDAY PROJECT,중급,ALLDAY PROJECT - ONE MORE TIME.pdf,https://www.youtube.com/watch?v=영상ID,POP,3000,120
곡 제목 2,아티스트 2,초급,아티스트2-곡제목2.pdf,,ROCK,5000,95
곡 제목 3,아티스트 3,고급,아티스트3-곡제목3.pdf,https://youtu.be/영상ID,KPOP,10000,140`;
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // UTF-8 BOM 추가
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', '악보_대량등록_샘플.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF 파일을 로컬 폴더에서 읽는 함수 (Electron이나 Tauri 같은 데스크톱 앱이 아닌 경우 제한적)
  // 브라우저에서는 직접 파일 시스템 접근이 불가하므로, 사용자가 PDF 파일을 선택하도록 안내
  const processSheetCsvData = async () => {
    if (sheetCsvData.length === 0) {
      alert('처리할 데이터가 없습니다.');
      return;
    }

    setIsSheetCsvProcessing(true);

    try {
      const norm = (s: any) => (s ?? '').toString().trim();
      const num = (s: any) => {
        const n = parseFloat(norm(s));
        return isNaN(n) ? 0 : n;
      };

      // [수정] 장르 매핑 테이블 (CSV 입력값 -> 사이트 카테고리명)
      // 소문자로 비교하므로 키값은 모두 소문자로 작성
      const genreMap: Record<string, string> = {
        // 요청하신 매핑
        'drum solo': '드럼솔로',
        'drumsolo': '드럼솔로',
        'kpop': '가요',
        'k-pop': '가요',
        'rock': '락',
        'jazz': '재즈',
        'ccm': 'CCM',
        'ost': 'OST',
        'jpop': 'J-POP',
        'j-pop': 'J-POP',
        'drum lesson': '드럼레슨',
        'drumlesson': '드럼레슨',
        'drum cover': '드럼커버',
        'drumcover': '드럼커버',
        'pop': '팝',
        
        // 그 외 편의를 위한 추가 매핑
        '트로트': '트로트/성인가요',
        'trot': '트로트/성인가요',
        '성인가요': '트로트/성인가요',
        'newage': '뉴에이지',
        'classic': '클래식',
        'latin': '라틴',
        'carol': '캐롤'
      };

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      // 각 행을 순차적으로 처리 (Spotify API 호출 및 PDF 처리 포함)
      for (let i = 0; i < sheetCsvData.length; i++) {
        const row = sheetCsvData[i];
        const rowNum = i + 2; // 헤더 제외하고 1부터 시작, 실제로는 2행부터

        try {
          // [수정] CSV 필드 파싱 (템포 추가)
          const title = norm(row.곡명 || row.title || row.Title || row['곡 제목'] || '');
          const artist = norm(row.아티스트 || row.artist || row.Artist || '');
          const difficultyInput = norm(row.난이도 || row.difficulty || row.Difficulty || '초급');
          const fileName = norm(row.파일명 || row.filename || row.fileName || row['파일명'] || '');
          const youtubeUrl = norm(row.유튜브링크 || row.youtube_url || row.youtubeUrl || row['유튜브링크'] || '');
          const genreInput = norm(row.장르 || row.genre || row.Genre || row['장르'] || '');
          const price = num(row.가격 || row.price || row.Price || 0);
          const tempo = num(row.템포 || row.tempo || row.Tempo || 0); // [추가] 템포

          if (!title || !artist) {
            console.warn(`행 ${rowNum}: 제목 또는 아티스트가 없어 건너뜁니다.`);
            errorCount++;
            errors.push(`행 ${rowNum}: 제목 또는 아티스트 없음`);
            continue;
          }

          console.log(`\n=== 행 ${rowNum} 처리 시작: ${title} - ${artist} ===`);

          // 1. difficulty 값 정규화 (한국어로 변환)
          let difficulty = difficultyInput;
          const difficultyMap: Record<string, string> = {
            'beginner': '초급',
            'intermediate': '중급',
            'advanced': '고급',
            '초급': '초급',
            '중급': '중급',
            '고급': '고급'
          };
          difficulty = difficultyMap[difficulty.toLowerCase()] || '초급';

          // 2. Spotify API로 썸네일 및 앨범 정보 가져오기
          let thumbnailUrl = '';
          let albumName = '';
          let categoryId = '';

          try {
            console.log(`행 ${rowNum}: Spotify 정보 가져오기 시작...`);
            const spotifyResult = await searchTrackAndGetCoverWithAlbum(artist, title);

            if (spotifyResult) {
              thumbnailUrl = spotifyResult.albumCoverUrl || '';
              albumName = spotifyResult.albumName || '';

              // CSV에서 장르가 없고 Spotify에서 장르를 가져온 경우 카테고리 자동 선택
              if (!genreInput && spotifyResult.genre) {
                const matchingCategory = categories.find(cat =>
                  cat.name.toLowerCase().includes(spotifyResult.genre!.toLowerCase())
                );
                if (matchingCategory) {
                  categoryId = matchingCategory.id;
                  console.log(`행 ${rowNum}: Spotify 장르로 카테고리 자동 선택: ${matchingCategory.name}`);
                }
              }
            }

            console.log(`행 ${rowNum}: Spotify 정보 가져오기 완료 - 썸네일: ${thumbnailUrl ? '있음' : '없음'}`);
          } catch (spotifyError) {
            console.warn(`행 ${rowNum}: Spotify 정보 가져오기 실패 (계속 진행):`, spotifyError);
          }

          // 3. 장르 매핑 및 카테고리 선택 로직
          if (genreInput && !categoryId) {
            // 입력값을 소문자로 변환하여 매핑 테이블에서 찾음. 없으면 입력값 그대로 사용.
            const mappedGenre = genreMap[genreInput.toLowerCase()] || genreInput;

            if (mappedGenre) {
              // 카테고리 이름에 매핑된 장르명이 포함되어 있는지 확인 (부분 일치 허용)
              const matchingCategory = categories.find(cat =>
                cat.name.toLowerCase() === mappedGenre.toLowerCase() || // 정확히 일치하거나
                cat.name.toLowerCase().includes(mappedGenre.toLowerCase()) // 포함하거나
              );

              if (matchingCategory) {
                categoryId = matchingCategory.id;
                console.log(`행 ${rowNum}: 장르 "${genreInput}" -> "${mappedGenre}" -> 카테고리: ${matchingCategory.name}`);
              } else {
                console.log(`행 ${rowNum}: 장르 "${genreInput}"에 해당하는 카테고리를 찾을 수 없습니다. (매핑됨: ${mappedGenre})`);
              }
            }
          }

          // 4. PDF 파일 처리 (업로드된 파일 목록에서 매칭)
          let pdfUrl = '';
          let previewImageUrl = '';
          let pageCount = 0;

          if (fileName) {
            // [추가] 사용자가 선택한 파일들 중에서 이름이 일치하는 파일 찾기
            const matchedFile = bulkPdfFiles.find(f => f.name === fileName);

            if (matchedFile) {
              console.log(`행 ${rowNum}: PDF 파일 매칭 성공 (${fileName})`);
              // PDF 업로드 로직 실행
              try {
                // [수정] 안전한 파일명 생성 로직 적용
                const fileExt = matchedFile.name.split('.').pop() || 'pdf';
                // 한글/공백 제거
                const sanitizedName = matchedFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
                const safeName = sanitizedName.length > 2 
                  ? sanitizedName 
                  : `imported_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
                const uploadFileName = `${Date.now()}_${safeName}`;
                
                const uploadPath = `pdfs/${uploadFileName}`;
                const { error: uploadError } = await supabase.storage
                  .from('drum-sheets')
                  .upload(uploadPath, matchedFile, {
                    contentType: 'application/pdf',
                    upsert: false
                  });

                if (!uploadError) {
                  const { data: urlData } = supabase.storage
                    .from('drum-sheets')
                    .getPublicUrl(uploadPath);
                  pdfUrl = urlData.publicUrl;

                  // 페이지 수 추출 (선택 사항)
                  try {
                    const pageCountResult = await extractPdfPageCount(matchedFile);
                    if (pageCountResult > 0) pageCount = pageCountResult;
                  } catch (e) {
                    console.warn(`행 ${rowNum}: 페이지 수 추출 실패`);
                  }
                } else {
                  console.error(`행 ${rowNum}: PDF 업로드 실패`, uploadError);
                  errors.push(`행 ${rowNum}: PDF 업로드 실패 (${fileName})`);
                }
              } catch (e) {
                console.error(`행 ${rowNum}: PDF 업로드 실패`, e);
                errors.push(`행 ${rowNum}: PDF 업로드 실패 (${fileName})`);
              }
            } else {
              console.warn(`행 ${rowNum}: 일치하는 PDF 파일을 찾을 수 없음 (${fileName})`);
              // PDF 파일이 없어도 계속 진행 (경고만 표시)
            }
          }

          // 5. 데이터베이스에 삽입
          const insertData: any = {
            title: title.trim(),
            artist: artist.trim(),
            difficulty: difficulty,
            price: Math.max(0, price),
            tempo: Math.max(0, tempo), // [추가] 템포 저장
            is_active: true
          };

          if (categoryId) {
            insertData.category_id = categoryId;
          }
          if (thumbnailUrl) {
            insertData.thumbnail_url = thumbnailUrl;
          }
          if (albumName) {
            insertData.album_name = albumName;
          }
          if (youtubeUrl) {
            insertData.youtube_url = youtubeUrl;
          }
          if (pdfUrl) {
            insertData.pdf_url = pdfUrl;
          }
          if (previewImageUrl) {
            insertData.preview_image_url = previewImageUrl;
          }
          if (pageCount > 0) {
            insertData.page_count = pageCount;
          }

          // ─── slug 자동 생성 (CSV 일괄 등록) ───
          const csvSlugRaw = `${insertData.artist}-${insertData.title}`;
          let csvBaseSlug = csvSlugRaw
            .toLowerCase()
            .trim()
            .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
          if (!csvBaseSlug) csvBaseSlug = `sheet-${Date.now()}`;

          let csvSlug = csvBaseSlug;
          let csvSlugSuffix = 0;
          while (true) {
            const { data: existingSlug } = await supabase
              .from('drum_sheets')
              .select('id')
              .eq('slug', csvSlug)
              .maybeSingle();
            if (!existingSlug) break;
            csvSlugSuffix++;
            csvSlug = `${csvBaseSlug}-${csvSlugSuffix}`;
          }
          insertData.slug = csvSlug;

          console.log(`행 ${rowNum}: 데이터베이스 삽입 시작... (slug: ${csvSlug})`);
          const { error: insertError } = await supabase
            .from('drum_sheets')
            .insert([insertData]);

          if (insertError) {
            console.error(`행 ${rowNum} 삽입 오류:`, insertError);
            errorCount++;
            errors.push(`행 ${rowNum}: ${insertError.message}`);
          } else {
            successCount++;
            console.log(`행 ${rowNum}: 성공적으로 등록됨`);
          }

          // API 부하 방지를 위한 대기 (Spotify API 호출 간격)
          if (i < sheetCsvData.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

        } catch (rowError) {
          console.error(`행 ${rowNum} 처리 오류:`, rowError);
          errorCount++;
          errors.push(`행 ${rowNum}: ${rowError instanceof Error ? rowError.message : '알 수 없는 오류'}`);
        }
      }

      let message = `CSV 처리가 완료되었습니다.\n성공: ${successCount}개\n실패: ${errorCount}개`;
      if (errors.length > 0 && errors.length <= 10) {
        message += `\n\n오류 상세:\n${errors.join('\n')}`;
      } else if (errors.length > 10) {
        message += `\n\n오류 상세 (최대 10개):\n${errors.slice(0, 10).join('\n')}\n... 외 ${errors.length - 10}개`;
      }
      alert(message);

      setShowSheetBulkModal(false);
      setSheetCsvFile(null);
      setSheetCsvData([]);
      setBulkPdfFiles([]);

      await loadSheets();
    } catch (error) {
      console.error('CSV 처리 오류:', error);
      alert(`CSV 처리 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsSheetCsvProcessing(false);
    }
  };

  const handleSheetCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSheetCsvFile(file);

    const reader = new FileReader();

    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      // 1. 먼저 UTF-8로 디코딩 시도
      let text = new TextDecoder('utf-8').decode(buffer);

      // 2. 헤더 확인 (제대로 읽혔는지 체크)
      let lines = text.split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        const firstLine = lines[0];
        // 필수 헤더인 '곡명'이나 'title'이 제대로 보이는지 확인
        const hasValidHeader = ['곡명', 'title', '아티스트', 'artist'].some(keyword => 
          firstLine.toLowerCase().includes(keyword)
        );

        // 3. UTF-8이 아니라고 판단되면 EUC-KR(한국 엑셀 표준)로 다시 디코딩
        if (!hasValidHeader) {
          console.log('CSV 인코딩 감지: EUC-KR로 재시도');
          text = new TextDecoder('euc-kr').decode(buffer);
          // 다시 줄 나누기
          lines = text.split('\n').filter(line => line.trim());
        }
      }

      if (lines.length < 2) {
        alert('CSV 파일 형식이 올바르지 않거나 데이터가 없습니다. (최소 2줄 필요)');
        return;
      }

      // CSV 파싱 로직 (따옴표 처리 포함)
      const parseCsvLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      };

      // 헤더 파싱
      const headers = parseCsvLine(lines[0]).map(h => h.trim().replace(/"/g, ''));
      console.log('CSV 헤더 파싱 결과:', headers);

      // 데이터 매핑
      const data = lines.slice(1).map((line, index) => {
        const values = parseCsvLine(line);
        const row: any = {};
        headers.forEach((header, idx) => {
          if (header) row[header] = values[idx] || '';
        });
        return row;
      }).filter(item => {
        // 필수 값이 있는 행만 포함
        const title = item.곡명 || item.title || item.Title || item['곡 제목'] || '';
        const artist = item.아티스트 || item.artist || item.Artist || '';
        return title.trim() || artist.trim();
      });

      console.log(`총 ${data.length}개의 데이터가 로드되었습니다.`);
      setSheetCsvData(data);
      
      if (data.length === 0) {
        alert('데이터를 찾을 수 없습니다. CSV 파일의 인코딩이나 헤더명을 확인해주세요.');
      }
    };

    reader.onerror = (error) => {
      console.error('파일 읽기 오류:', error);
      alert('파일을 읽는 중 오류가 발생했습니다.');
    };

    // 텍스트가 아닌 ArrayBuffer로 읽어서 직접 디코딩
    reader.readAsArrayBuffer(file);
  };

  const handleAddCategory = async () => {
    if (!newCategory.name) {
      alert('카테고리 이름은 필수입니다.');
      return;
    }

    try {
      const { error } = await supabase
        .from('categories')
        .insert([{
          name: newCategory.name,
          description: newCategory.description
        }]);

      if (error) throw error;

      alert('카테고리가 추가되었습니다.');
      setIsAddingCategory(false);
      setNewCategory({
        name: '',
        description: ''
      });
      loadCategories();
    } catch (error) {
      console.error('카테고리 추가 오류:', error);
      alert('카테고리 추가 중 오류가 발생했습니다.');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !editingCategory.name) {
      alert('카테고리 이름은 필수입니다.');
      return;
    }

    try {
      const { error } = await supabase
        .from('categories')
        .update({
          name: editingCategory.name,
          description: editingCategory.description || ''
        })
        .eq('id', editingCategory.id);

      if (error) throw error;

      alert('카테고리가 수정되었습니다.');
      setEditingCategory(null);
      loadCategories();
    } catch (error) {
      console.error('카테고리 수정 오류:', error);
      alert('카테고리 수정 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm('정말 이 카테고리를 삭제하시겠습니까?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      alert('카테고리가 삭제되었습니다.');
      loadCategories();
    } catch (error) {
      console.error('카테고리 삭제 오류:', error);
      alert('카테고리 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const loadDashboardAnalytics = useCallback(
    async (period: DashboardAnalyticsPeriod) => {
      if (!isAdmin) return;

      setDashboardAnalyticsLoading(true);
      setDashboardAnalyticsError(null);

      try {
        const result = await getDashboardAnalytics(period);
        setDashboardAnalyticsData(result);
      } catch (error) {
        console.error('대시보드 통계 로드 실패:', error);
        setDashboardAnalyticsError(
          error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
        );
      } finally {
        setDashboardAnalyticsLoading(false);
      }
    },
    [isAdmin]
  );

  // 메뉴별 데이터 로드
  useEffect(() => {
    if (!isAdmin) return;

    switch (activeMenu) {
      case 'dashboard':
        loadOrders();
        loadCustomOrders();
        break;
      case 'member-list':
        loadMembers();
        break;
      case 'sheets':
        loadSheets();
        loadCategories();
        break;
      case 'categories':
        loadCategories();
        break;
      case 'collections':
        loadCollections();
        loadSheets();
        loadCategories();
        break;
      case 'orders':
        loadOrders();
        break;
      case 'custom-orders':
        loadCustomOrders();
        break;
      case 'inquiries':
        loadCustomerInquiries();
        break;
      case 'points':
        loadCashOverview();
        break;
      case 'event-discounts':
        loadEventDiscounts();
        break;
      case 'settings':
        loadSiteSettings();
        break;
    }
  }, [activeMenu, isAdmin]);

  useEffect(() => {
    if (!isAdmin || activeMenu !== 'dashboard') {
      return;
    }

    void loadDashboardAnalytics(dashboardAnalyticsPeriod);
    // 대시보드에서도 미처리 문의 확인을 위해 문의 목록 로드
    loadCustomerInquiries();

    // 30초마다 자동 새로고침
    const intervalId = setInterval(() => {
      void loadDashboardAnalytics(dashboardAnalyticsPeriod);
      loadCustomerInquiries();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [isAdmin, activeMenu, dashboardAnalyticsPeriod, loadDashboardAnalytics]);

  // 문의 관리 메뉴에서 자동 새로고침
  useEffect(() => {
    if (!isAdmin || activeMenu !== 'inquiries') {
      return;
    }

    // 60초마다 자동 새로고침
    const intervalId = setInterval(() => {
      loadCustomerInquiries();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [isAdmin, activeMenu]);

  // 필터링된 데이터
  const filteredMembers = members.filter(member =>
    member.email.toLowerCase().includes(memberSearchTerm.toLowerCase()) ||
    member.name.toLowerCase().includes(memberSearchTerm.toLowerCase())
  );

  const renderInquiryManagement = () => {
    const statusOptions = ['all', ...Array.from(new Set(customerInquiries.map((inquiry) => inquiry.status)))];
    const keyword = inquirySearchTerm.trim().toLowerCase();
    const filtered = customerInquiries.filter((inquiry) => {
      const matchesSearch =
        !keyword ||
        inquiry.name.toLowerCase().includes(keyword) ||
        inquiry.email.toLowerCase().includes(keyword) ||
        inquiry.title.toLowerCase().includes(keyword) ||
        inquiry.content.toLowerCase().includes(keyword) ||
        inquiry.category.toLowerCase().includes(keyword) ||
        (inquiry.admin_reply ? inquiry.admin_reply.toLowerCase().includes(keyword) : false);

      const matchesStatus = inquiryStatusFilter === 'all' || inquiry.status === inquiryStatusFilter;

      return matchesSearch && matchesStatus;
    });

    const totalCount = customerInquiries.length;
    const pendingCount = customerInquiries.filter((inquiry) => inquiry.status === 'pending').length;

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">1:1 문의 관리</h2>
              <p className="text-sm text-gray-500">고객 문의를 확인하고 빠르게 대응하세요.</p>
            </div>
            <div className="flex flex-col items-start gap-2 text-sm text-gray-500 sm:flex-row sm:items-center">
              <span>총 {totalCount.toLocaleString('ko-KR')}건 · 대기 {pendingCount.toLocaleString('ko-KR')}건</span>
              <button
                type="button"
                onClick={loadCustomerInquiries}
                className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <i className="ri-refresh-line mr-2"></i>
                새로고침
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setInquiryStatusFilter(status)}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${inquiryStatusFilter === status
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {status === 'all' ? '전체' : getInquiryStatusLabel(status)}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="search"
                value={inquirySearchTerm}
                onChange={(event) => setInquirySearchTerm(event.target.value)}
                placeholder="이름, 이메일, 제목, 내용 검색"
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {isLoadingInquiries ? (
              <div className="p-10 text-center text-sm text-gray-500">문의 내역을 불러오는 중입니다...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-500">표시할 문의가 없습니다.</div>
            ) : (
              filtered.map((inquiry) => {
                const draftValue = inquiryReplyDrafts[inquiry.id] ?? '';
                const originalReply = inquiry.admin_reply ?? '';
                const hasChanged = draftValue !== originalReply;
                const isSubmitting = inquiryReplySubmitting === inquiry.id;

                return (
                  <div key={inquiry.id} className="p-6 space-y-5">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                            {inquiry.category}
                          </span>
                          <h3 className="text-lg font-semibold text-gray-900">{inquiry.title}</h3>
                        </div>
                        <div className="text-sm text-gray-500">
                          {inquiry.name} · {inquiry.email}
                        </div>
                      </div>
                      <div className="flex flex-col items-start gap-2 text-sm text-gray-500 md:items-end">
                        <span>{formatDateTime(inquiry.created_at)}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getInquiryStatusBadgeClass(
                            inquiry.status
                          )}`}
                        >
                          {getInquiryStatusLabel(inquiry.status)}
                        </span>
                      </div>
                    </div>

                    <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
                      {inquiry.content}
                    </div>

                    <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-700">관리자 답변</span>
                          {inquiry.replied_at ? (
                            <span className="text-xs text-gray-500">
                              마지막 업데이트 {formatDateTime(inquiry.replied_at)}
                            </span>
                          ) : null}
                        </div>
                        <span className="text-xs text-gray-400">문의 접수 {formatDateTime(inquiry.created_at)}</span>
                      </div>

                      <textarea
                        rows={5}
                        maxLength={1000}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="고객에게 전달할 답변을 입력하세요."
                        value={draftValue}
                        onChange={(event) => handleInquiryReplyDraftChange(inquiry.id, event.target.value)}
                      />

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span className="text-xs text-gray-500">
                          답변을 저장하면 고객 마이페이지에서 즉시 확인할 수 있습니다.
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleInquiryReplyReset(inquiry)}
                            disabled={!hasChanged || isSubmitting}
                            className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            초기화
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInquiryReplySubmit(inquiry)}
                            disabled={!hasChanged || isSubmitting}
                            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                          >
                            {isSubmitting ? '저장 중...' : inquiry.admin_reply ? '답변 업데이트' : '답변 저장'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  // 회원 페이지네이션 계산
  const memberTotalPages = Math.ceil(filteredMembers.length / memberItemsPerPage);
  const memberStartIndex = (memberCurrentPage - 1) * memberItemsPerPage;
  const memberEndIndex = memberStartIndex + memberItemsPerPage;
  const paginatedMembers = filteredMembers.slice(memberStartIndex, memberEndIndex);

  // 검색어 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setMemberCurrentPage(1);
  }, [memberSearchTerm]);

  const filteredCashMembers = React.useMemo(() => {
    const keyword = cashSearchTerm.trim().toLowerCase();
    if (!keyword) {
      return cashMembers;
    }
    return cashMembers.filter((member) => {
      const email = member.email?.toLowerCase() ?? '';
      const name = member.name?.toLowerCase() ?? '';
      return email.includes(keyword) || name.includes(keyword);
    });
  }, [cashMembers, cashSearchTerm]);

  const cashTotalPages = Math.max(1, Math.ceil(filteredCashMembers.length / cashItemsPerPage));
  const cashStartIndex = (cashCurrentPage - 1) * cashItemsPerPage;
  const cashEndIndex = cashStartIndex + cashItemsPerPage;
  const paginatedCashMembers = filteredCashMembers.slice(cashStartIndex, cashEndIndex);

  useEffect(() => {
    setCashCurrentPage(1);
  }, [cashSearchTerm]);

  const filteredSheets = sheets.filter(sheet => {
    // 검색어 필터
    const matchesSearch = sheet.title.toLowerCase().includes(sheetSearchTerm.toLowerCase()) ||
      sheet.artist.toLowerCase().includes(sheetSearchTerm.toLowerCase());

    // 카테고리 필터
    const matchesCategory =
      sheetCategoryFilter === 'all' ||
      sheet.category_id === sheetCategoryFilter ||
      (sheet.category_ids && sheet.category_ids.includes(sheetCategoryFilter));

    return matchesSearch && matchesCategory;
  });

  // 페이지네이션 계산
  const sheetTotalPages = Math.ceil(filteredSheets.length / sheetItemsPerPage);
  const sheetStartIndex = (sheetCurrentPage - 1) * sheetItemsPerPage;
  const sheetEndIndex = sheetStartIndex + sheetItemsPerPage;
  const paginatedSheets = filteredSheets.slice(sheetStartIndex, sheetEndIndex);

  // 검색어 또는 카테고리 변경 시 첫 페이지로 리셋
  useEffect(() => {
    setSheetCurrentPage(1);
  }, [sheetSearchTerm, sheetCategoryFilter]);

  const orderPaymentOptions = React.useMemo(() => {
    const unique = new Set<string>();
    orders.forEach((order) => {
      if (order.payment_method) {
        unique.add(normalizePaymentMethodKey(order.payment_method));
      }
    });
    return Array.from(unique).sort();
  }, [orders]);

  const normalizedOrderSearch = orderSearchTerm.trim().toLowerCase();
  const filterStartDate = orderStartDate ? new Date(`${orderStartDate}T00:00:00`) : null;
  const filterEndDate = orderEndDate ? new Date(`${orderEndDate}T23:59:59.999`) : null;

  const filteredOrders = orders.filter((order) => {
    const statusMeta = getOrderStatusMetaSafe(order.status);
    const paymentLabel = getPaymentMethodLabel(order.payment_method, order);
    const searchableFields = [
      order.id,
      order.order_number ?? '',
      order.profiles?.name ?? '',
      order.profiles?.email ?? '',
      order.depositor_name ?? '', // 입금자명 검색 추가
      paymentLabel,
      statusMeta.label,
    ]
      .join(' ')
      .toLowerCase();

    const matchesSearch = normalizedOrderSearch ? searchableFields.includes(normalizedOrderSearch) : true;
    // 상태 필터: 'awaiting_deposit'인 경우 payment_status도 확인
    const matchesStatus =
      orderStatusFilter === 'all'
        ? true
        : orderStatusFilter === 'awaiting_deposit'
          ? order.status === 'awaiting_deposit' || order.payment_status === 'awaiting_deposit'
          : order.status === orderStatusFilter;

    const paymentKey = order.payment_method ? normalizePaymentMethodKey(order.payment_method) : '';
    const matchesPayment = orderPaymentFilter === 'all' ? true : paymentKey === orderPaymentFilter;

    const createdAt = order.created_at ? new Date(order.created_at) : null;
    const matchesStart = filterStartDate
      ? createdAt
        ? createdAt >= filterStartDate
        : false
      : true;
    const matchesEnd = filterEndDate
      ? createdAt
        ? createdAt <= filterEndDate
        : false
      : true;

    return matchesSearch && matchesStatus && matchesPayment && matchesStart && matchesEnd;
  });
  const statusPriority: Record<OrderStatus, number> = {
    completed: 0,
    payment_confirmed: 1,
    awaiting_deposit: 2,
    pending: 3,
    refunded: 4,
    cancelled: 5,
  };

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    switch (orderSortKey) {
      case 'date_asc':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'amount_desc':
        return b.total_amount - a.total_amount;
      case 'amount_asc':
        return a.total_amount - b.total_amount;
      case 'status': {
        const priorityDiff = statusPriority[a.status] - statusPriority[b.status];
        if (priorityDiff !== 0) {
          return priorityDiff;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      case 'date_desc':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const totalOrderCount = orders.length;
  const filteredOrderCount = filteredOrders.length;

  const filteredCustomOrders = customOrders.filter((order) => {
    const keyword = customOrderSearchTerm.toLowerCase();
    const matchesSearch =
      order.song_title.toLowerCase().includes(keyword) ||
      order.artist.toLowerCase().includes(keyword) ||
      (order.profiles?.email?.toLowerCase().includes(keyword) ?? false) ||
      (order.profiles?.name?.toLowerCase().includes(keyword) ?? false);

    const matchesStatus =
      customOrderStatusFilter === 'all' || order.status === customOrderStatusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeCustomOrderCount = customOrders.filter(
    (order) => order.status !== 'completed' && order.status !== 'cancelled'
  ).length;
  const pendingCustomOrderCount = customOrders.filter((order) =>
    ['pending', 'quoted'].includes(order.status)
  ).length;
  const totalInquiryCount = customerInquiries.length;
  const pendingInquiryCount = customerInquiries.filter((inquiry) => inquiry.status === 'pending').length;
  // 렌더링 함수들
  const renderDashboard = () => {
    const periodOptions: Array<{ value: DashboardAnalyticsPeriod; label: string }> = [
      { value: 'daily', label: '오늘' },
      { value: 'weekly', label: '최근 7일' },
      { value: 'monthly', label: '최근 한달' },
    ];
    type AnalyticsCard = {
      title: string;
      value: number;
      change: number;
      icon: string;
      iconClassName: string;
      description: string;
      formatter?: (value: number) => string;
    };
    const metrics = dashboardAnalyticsData?.metrics;
    const periodDescription = dashboardAnalyticsPeriod === 'daily' ? '어제 대비'
      : dashboardAnalyticsPeriod === 'weekly' ? '이전 7일 대비'
      : '이전 한달 대비';
    const cards: AnalyticsCard[] = [
      {
        title: '방문자 수',
        value: metrics?.totalVisitors ?? 0,
        change: metrics?.visitorsChangePct ?? 0,
        icon: 'ri-group-line',
        iconClassName: 'bg-blue-100 text-blue-600',
        description: periodDescription,
        formatter: (value) => `${value.toLocaleString('ko-KR')}명`,
      },
      {
        title: '페이지뷰',
        value: metrics?.totalPageViews ?? 0,
        change: metrics?.pageViewsChangePct ?? 0,
        icon: 'ri-eye-line',
        iconClassName: 'bg-sky-100 text-sky-600',
        description: periodDescription,
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
    const hasAnalytics = Boolean(dashboardAnalyticsData);
    const chartData = dashboardAnalyticsData?.series ?? [];
    const isInitialLoading = dashboardAnalyticsLoading && !hasAnalytics;
    const isUpdating = dashboardAnalyticsLoading && hasAnalytics;
    const tooltipFormatter = (value: number | string, name: string) => {
      const numericValue = typeof value === 'number' ? value : Number(value);
      if (name === '매출') {
        return [`₩${numericValue.toLocaleString('ko-KR')}`, name];
      }
      return [`${numericValue.toLocaleString('ko-KR')}명`, name];
    };

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
                  onClick={() => setDashboardAnalyticsPeriod(option.value)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${dashboardAnalyticsPeriod === option.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {option.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  void loadDashboardAnalytics(dashboardAnalyticsPeriod);
                }}
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                <i className="ri-refresh-line"></i>
                새로고침
              </button>
            </div>
          </div>
          {dashboardAnalyticsError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>데이터를 불러오는 중 오류가 발생했습니다: {dashboardAnalyticsError}</span>
                <button
                  type="button"
                  onClick={() => {
                    void loadDashboardAnalytics(dashboardAnalyticsPeriod);
                  }}
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
                      {dashboardAnalyticsPeriod === 'daily' ? '오늘 상세' : dashboardAnalyticsPeriod === 'weekly' ? '최근 7일 상세' : '최근 한달 상세'}
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
                                  {dashboardAnalyticsPeriod === 'weekly' ? '최근 7일 합계' : '최근 한달 합계'}
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
              onClick={() => setActiveMenu('custom-orders')}
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
              onClick={() => setActiveMenu('inquiries')}
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
                {orders.slice(0, 5).map((order) => (
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
                {customOrders.slice(0, 5).map((order) => (
                  <div key={order.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{order.song_title}</p>
                      <p className="text-sm text-gray-500">{order.artist}</p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          CUSTOM_ORDER_STATUS_META[order.status as CustomOrderStatus]?.className ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {CUSTOM_ORDER_STATUS_META[order.status as CustomOrderStatus]?.label ?? order.status}
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
  };
  const renderCashManagement = () => {
    const historyTotalPages = Math.max(1, Math.ceil(cashHistoryTotal / cashHistoryPageSize));

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-blue-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">총 회원 수</p>
                <p className="text-2xl font-bold text-gray-900">
                  {cashStats.totalMembers.toLocaleString('ko-KR')}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <i className="ri-user-3-line w-6 h-6 text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-emerald-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-600">총 보유 캐쉬</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(cashStats.totalBalance)}
                </p>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <i className="ri-wallet-3-line w-6 h-6 text-emerald-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">이번 달 충전액</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(cashStats.monthlyCharged)}
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <i className="ri-add-circle-line w-6 h-6 text-orange-500"></i>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-rose-100 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-rose-600">이번 달 사용액</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(cashStats.monthlyUsed)}
                </p>
              </div>
              <div className="w-12 h-12 bg-rose-100 rounded-lg flex items-center justify-center">
                <i className="ri-subtract-line w-6 h-6 text-rose-500"></i>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="p-6 border-b border-gray-100">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">적립금 관리</h2>
                <p className="text-sm text-gray-500">
                  회원의 캐쉬 잔액을 조회하고 직접 충전/차감하거나 사용 내역을 확인할 수 있습니다.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"></i>
                  <input
                    type="text"
                    placeholder="회원 이메일 또는 이름 검색"
                    value={cashSearchTerm}
                    onChange={(event) => setCashSearchTerm(event.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={loadCashOverview}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  <i className="ri-refresh-line w-4 h-4"></i>
                  새로고침
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto -mx-3 md:mx-0">
            <table className="w-full min-w-[640px] md:min-w-0">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    회원
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    보유 캐쉬
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    최근 가입
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    관리
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cashLoading ? (
                  <tr>
                    <td colSpan={4} className="px-3 md:px-6 py-6 md:py-8 text-center text-sm md:text-base text-gray-500">
                      적립금 데이터를 불러오는 중입니다...
                    </td>
                  </tr>
                ) : paginatedCashMembers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 md:px-6 py-6 md:py-8 text-center text-sm md:text-base text-gray-500">
                      {cashSearchTerm ? '검색 결과가 없습니다.' : '회원 정보가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  paginatedCashMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <div className="flex items-center">
                          <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                            <i className="ri-user-smile-line text-orange-500 text-base md:text-lg"></i>
                          </div>
                          <div className="ml-2 md:ml-4 min-w-0">
                            <p className="text-xs md:text-sm font-semibold text-gray-900 truncate">
                              {member.name || '이름 없음'}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-sm font-semibold text-gray-900">
                        {formatCurrency(member.credits ?? 0)}
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-sm text-gray-500">
                        {new Date(member.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <div className="flex flex-wrap gap-1.5 md:gap-2">
                          <button
                            onClick={() => handleOpenCashAdjustModal(member)}
                            className="inline-flex items-center gap-1 md:gap-2 rounded-lg bg-orange-500 px-2 md:px-3 py-1.5 md:py-1.5 text-xs md:text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
                          >
                            <i className="ri-edit-2-line w-3.5 h-3.5 md:w-4 md:h-4"></i>
                            <span className="hidden sm:inline">캐쉬 수정</span>
                            <span className="sm:hidden">수정</span>
                          </button>
                          <button
                            onClick={() => handleOpenCashHistoryModal(member)}
                            className="inline-flex items-center gap-1 md:gap-2 rounded-lg bg-gray-100 px-2 md:px-3 py-1.5 md:py-1.5 text-xs md:text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                          >
                            <i className="ri-time-line w-3.5 h-3.5 md:w-4 md:h-4"></i>
                            <span className="hidden sm:inline">내역 보기</span>
                            <span className="sm:hidden">내역</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {cashTotalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-600">
                전체 {filteredCashMembers.length}명 중{' '}
                {filteredCashMembers.length === 0
                  ? '0'
                  : `${cashStartIndex + 1}-${Math.min(cashEndIndex, filteredCashMembers.length)}`}명 표시
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCashCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={cashCurrentPage === 1}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${cashCurrentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                    }`}
                >
                  <i className="ri-arrow-left-s-line"></i>
                </button>
                {Array.from({ length: cashTotalPages }, (_, index) => index + 1).map((page) => {
                  if (
                    page === 1 ||
                    page === cashTotalPages ||
                    (page >= cashCurrentPage - 2 && page <= cashCurrentPage + 2)
                  ) {
                    return (
                      <button
                        key={page}
                        onClick={() => setCashCurrentPage(page)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${cashCurrentPage === page
                          ? 'bg-orange-500 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                          }`}
                      >
                        {page}
                      </button>
                    );
                  }
                  if (page === cashCurrentPage - 3 || page === cashCurrentPage + 3) {
                    return (
                      <span key={page} className="px-2 text-gray-400">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}
                <button
                  onClick={() => setCashCurrentPage((prev) => Math.min(cashTotalPages, prev + 1))}
                  disabled={cashCurrentPage === cashTotalPages}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${cashCurrentPage === cashTotalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                    }`}
                >
                  <i className="ri-arrow-right-s-line"></i>
                </button>
              </div>
            </div>
          )}
        </div>

        {showCashAdjustModal && selectedCashMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  캐쉬 수정 · {selectedCashMember.name || selectedCashMember.email}
                </h3>
                <button
                  onClick={handleCloseCashAdjustModal}
                  className="text-gray-400 transition-colors hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-5 px-6 py-6">
                <div className="rounded-xl bg-orange-50 p-4 text-sm text-orange-700">
                  <p className="font-semibold">현재 보유 캐쉬</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {formatCurrency(selectedCashMember.credits ?? 0)}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">조정 유형</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setCashAdjustType('admin_add')}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${cashAdjustType === 'admin_add'
                        ? 'border-orange-500 bg-orange-50 text-orange-600'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                    >
                      <i className="ri-add-circle-line"></i>
                      캐쉬 추가
                    </button>
                    <button
                      onClick={() => setCashAdjustType('admin_deduct')}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${cashAdjustType === 'admin_deduct'
                        ? 'border-rose-500 bg-rose-50 text-rose-600'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                        }`}
                    >
                      <i className="ri-subtract-line"></i>
                      캐쉬 차감
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">금액 (원)</label>
                  <input
                    type="number"
                    value={cashAdjustAmount}
                    min={0}
                    onChange={(event) => setCashAdjustAmount(Number(event.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    placeholder="예: 10000"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    음수는 입력할 수 없습니다. 차감은 \'캐쉬 차감\' 유형을 사용하세요.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">사유</label>
                  <textarea
                    value={cashAdjustReason}
                    onChange={(event) => setCashAdjustReason(event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                    placeholder="관리자 조정 사유를 입력하세요."
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 border-t border-gray-100 px-6 py-4">
                <button
                  onClick={handleCloseCashAdjustModal}
                  className="flex-1 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmitCashAdjust}
                  className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
                >
                  적용하기
                </button>
              </div>
            </div>
          </div>
        )}

        {showCashHistoryModal && selectedCashMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
            <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">캐쉬 내역</h3>
                  <p className="text-sm text-gray-500">
                    {selectedCashMember.name || selectedCashMember.email} · 현재 잔액{' '}
                    {formatCurrency(selectedCashMember.credits ?? 0)}
                  </p>
                </div>
                <button
                  onClick={handleCloseCashHistoryModal}
                  className="text-gray-400 transition-colors hover:text-gray-600"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="max-h-[520px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-white shadow-sm">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        일시
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        유형
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        금액
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        보너스
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        잔액
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        관련 악보/설명
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {cashHistoryLoading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                          캐쉬 내역을 불러오는 중입니다...
                        </td>
                      </tr>
                    ) : cashHistory.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                          기록이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      cashHistory.map((transaction) => {
                        const typeMeta = CASH_TRANSACTION_TYPE_META[transaction.transaction_type];
                        const amountDisplay = `${transaction.amount >= 0 ? '+' : '-'}${formatCurrency(
                          Math.abs(transaction.amount)
                        )}`;
                        return (
                          <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {new Date(transaction.created_at).toLocaleString('ko-KR')}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${typeMeta.className}`}
                              >
                                {typeMeta.label}
                              </span>
                            </td>
                            <td
                              className={`px-6 py-4 text-sm font-semibold ${transaction.amount >= 0 ? 'text-orange-600' : 'text-rose-600'
                                }`}
                            >
                              {amountDisplay}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {transaction.bonus_amount > 0
                                ? `+${formatCurrency(transaction.bonus_amount)}`
                                : '-'}
                            </td>
                            <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                              {formatCurrency(transaction.balance_after ?? 0)}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {transaction.description
                                ? transaction.description
                                : transaction.sheet?.title
                                  ? `악보: ${transaction.sheet.title}`
                                  : '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
                <div className="text-sm text-gray-600">
                  전체 {cashHistoryTotal}건 · {cashHistoryPage}/{historyTotalPages}페이지
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleChangeCashHistoryPage(Math.max(1, cashHistoryPage - 1))}
                    disabled={cashHistoryPage === 1}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${cashHistoryPage === 1
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                  >
                    <i className="ri-arrow-left-s-line"></i>
                  </button>
                  <span className="text-sm text-gray-500">
                    {cashHistoryPage}/{historyTotalPages}
                  </span>
                  <button
                    onClick={() =>
                      handleChangeCashHistoryPage(Math.min(historyTotalPages, cashHistoryPage + 1))
                    }
                    disabled={cashHistoryPage === historyTotalPages}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${cashHistoryPage === historyTotalPages
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                  >
                    <i className="ri-arrow-right-s-line"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };
  const renderMemberManagement = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">회원 관리</h2>
        <div className="flex space-x-3">
          <button
            onClick={() => setIsAddingMember(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <i className="ri-user-add-line w-4 h-4"></i>
            <span>새 회원 추가</span>
          </button>
          <button
            onClick={startBulkAddMembers}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <i className="ri-upload-line w-4 h-4"></i>
            <span>CSV 대량 등록</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4"></i>
                <input
                  type="text"
                  placeholder="회원 검색..."
                  value={memberSearchTerm}
                  onChange={(e) => setMemberSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={loadMembers}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2"
              >
                <i className="ri-refresh-line w-4 h-4"></i>
                <span>새로고침</span>
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto -mx-3 md:mx-0">
          <table className="w-full min-w-[640px] md:min-w-0">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">회원 정보</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">가입방법</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">가입일</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                <th className="px-3 md:px-6 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 md:px-6 py-6 md:py-8 text-center text-sm md:text-base text-gray-500">
                    {memberSearchTerm ? '검색 결과가 없습니다.' : '회원이 없습니다.'}
                  </td>
                </tr>
              ) : (
                paginatedMembers.map((member) => {
                  // 가입방법 확인
                  const hasKakao = member.kakao_id && member.kakao_id.trim() !== '';
                  const hasGoogle = member.google_id && member.google_id.trim() !== '';
                  const loginMethod = hasKakao && hasGoogle ? '카카오+구글' :
                    hasKakao ? '카카오' :
                      hasGoogle ? '구글' : '이메일';

                  return (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 md:h-10 md:w-10">
                            <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-blue-100 flex items-center justify-center">
                              <i className="ri-user-line text-blue-600 w-4 h-4 md:w-5 md:h-5"></i>
                            </div>
                          </div>
                          <div className="ml-2 md:ml-4 min-w-0">
                            <div className="text-xs md:text-sm font-medium text-gray-900 truncate">{member.name || '이름 없음'}</div>
                            <div className="text-xs md:text-sm text-gray-500 truncate">{member.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <div className="flex items-center flex-wrap gap-1 md:space-x-2">
                          {hasKakao && (
                            <span className="inline-flex items-center px-1.5 md:px-2 py-0.5 md:py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <i className="ri-kakao-talk-fill w-2.5 h-2.5 md:w-3 md:h-3 mr-0.5 md:mr-1"></i>
                              <span className="hidden sm:inline">카카오</span>
                              <span className="sm:hidden">K</span>
                            </span>
                          )}
                          {hasGoogle && (
                            <span className="inline-flex items-center px-1.5 md:px-2 py-0.5 md:py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <i className="ri-google-fill w-2.5 h-2.5 md:w-3 md:h-3 mr-0.5 md:mr-1"></i>
                              <span className="hidden sm:inline">구글</span>
                              <span className="sm:hidden">G</span>
                            </span>
                          )}
                          {!hasKakao && !hasGoogle && (
                            <span className="inline-flex items-center px-1.5 md:px-2 py-0.5 md:py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              <i className="ri-mail-line w-2.5 h-2.5 md:w-3 md:h-3 mr-0.5 md:mr-1"></i>
                              <span className="hidden sm:inline">이메일</span>
                              <span className="sm:hidden">E</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-sm text-gray-900">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4">
                        <span className={`inline-flex px-1.5 md:px-2 py-0.5 md:py-1 text-xs font-semibold rounded-full ${member.is_admin
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-green-100 text-green-800'
                          }`}>
                          {member.is_admin ? '관리자' : '일반회원'}
                        </span>
                      </td>
                      <td className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-sm font-medium">
                        <div className="flex space-x-1 md:space-x-2">
                          <button
                            onClick={() => handleDeleteMember(member.id)}
                            className="text-red-600 hover:text-red-900 p-1.5 md:p-0"
                            aria-label="회원 삭제"
                          >
                            <i className="ri-delete-bin-line w-4 h-4 md:w-4 md:h-4"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {memberTotalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              전체 {filteredMembers.length}개 중 {memberStartIndex + 1}-{Math.min(memberEndIndex, filteredMembers.length)}개 표시
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setMemberCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={memberCurrentPage === 1}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${memberCurrentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                <i className="ri-arrow-left-s-line"></i>
              </button>

              {Array.from({ length: memberTotalPages }, (_, i) => i + 1).map((page) => {
                // 현재 페이지 주변 2페이지씩만 표시
                if (
                  page === 1 ||
                  page === memberTotalPages ||
                  (page >= memberCurrentPage - 2 && page <= memberCurrentPage + 2)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => setMemberCurrentPage(page)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${memberCurrentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                        }`}
                    >
                      {page}
                    </button>
                  );
                } else if (
                  page === memberCurrentPage - 3 ||
                  page === memberCurrentPage + 3
                ) {
                  return (
                    <span key={page} className="px-2 text-gray-400">
                      ...
                    </span>
                  );
                }
                return null;
              })}

              <button
                onClick={() => setMemberCurrentPage(prev => Math.min(memberTotalPages, prev + 1))}
                disabled={memberCurrentPage === memberTotalPages}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${memberCurrentPage === memberTotalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                <i className="ri-arrow-right-s-line"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CSV 업로드 모달 */}
      {showMemberBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">CSV 대량 회원 등록</h3>
              <button
                onClick={() => setShowMemberBulkModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line w-5 h-5"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CSV 파일 선택
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleMemberCsvUpload}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="text-sm text-gray-600">
                <p className="mb-2">CSV 파일 형식:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>email (필수)</li>
                  <li>name (선택)</li>
                  <li>kakao_id (선택)</li>
                  <li>google_id (선택)</li>
                </ul>
              </div>

              <button
                onClick={downloadMemberCsvSample}
                className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2"
              >
                <i className="ri-download-line w-4 h-4"></i>
                <span>샘플 CSV 다운로드</span>
              </button>

              {memberCsvData.length > 0 && (
                <button
                  onClick={processMemberCsvData}
                  disabled={isMemberCsvProcessing}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {isMemberCsvProcessing ? '처리 중...' : `${memberCsvData.length}개 회원 등록`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 회원 추가 모달 */}
      {isAddingMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">새 회원 추가</h3>
              <button
                onClick={() => setIsAddingMember(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line w-5 h-5"></i>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이메일 *
                </label>
                <input
                  type="email"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이름
                </label>
                <input
                  type="text"
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isAdmin"
                  checked={newMember.is_admin}
                  onChange={(e) => setNewMember({ ...newMember, is_admin: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="isAdmin" className="ml-2 block text-sm text-gray-900">
                  관리자 권한 부여
                </label>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddingMember(false)}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleAddMember}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  추가
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const handleSelectAllSheets = (checked: boolean) => {
    if (checked) {
      setSelectedSheetIds(paginatedSheets.map(sheet => sheet.id));
    } else {
      setSelectedSheetIds([]);
    }
  };

  const handleSelectSheet = (sheetId: string, checked: boolean) => {
    if (checked) {
      setSelectedSheetIds([...selectedSheetIds, sheetId]);
    } else {
      setSelectedSheetIds(selectedSheetIds.filter(id => id !== sheetId));
    }
  };

  const handleBulkEdit = async () => {
    if (selectedSheetIds.length === 0) {
      alert('수정할 악보를 선택해주세요.');
      return;
    }

    try {
      const updateData: any = {};

      if (bulkEditData.category_id) {
        updateData.category_id = bulkEditData.category_id;
      }
      if (bulkEditData.difficulty) {
        updateData.difficulty = bulkEditData.difficulty;
      }
      if (bulkEditData.price !== '') {
        updateData.price = Number(bulkEditData.price);
      }
      if (bulkEditData.is_active !== null) {
        updateData.is_active = bulkEditData.is_active;
      }

      if (Object.keys(updateData).length === 0) {
        alert('수정할 항목을 선택해주세요.');
        return;
      }

      const { error } = await supabase
        .from('drum_sheets')
        .update(updateData)
        .in('id', selectedSheetIds);

      if (error) throw error;

      alert(`${selectedSheetIds.length}개의 악보가 수정되었습니다.`);
      setShowBulkEditModal(false);
      setSelectedSheetIds([]);
      setBulkEditData({
        category_id: '',
        difficulty: '',
        price: '',
        is_active: null
      });
      loadSheets();
    } catch (error) {
      console.error('일괄 수정 오류:', error);
      alert('일괄 수정 중 오류가 발생했습니다.');
    }
  };
  const renderSheetManagement = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">악보 관리</h2>
        <div className="flex space-x-2">
          {selectedSheetIds.length > 0 && (
            <button
              onClick={() => setShowBulkEditModal(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
            >
              <i className="ri-edit-box-line w-4 h-4"></i>
              <span>일괄 수정 ({selectedSheetIds.length}개)</span>
            </button>
          )}
          <button
            onClick={() => setIsAddingSheet(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <i className="ri-add-line w-4 h-4"></i>
            <span>새 악보 추가</span>
          </button>
          <button
            onClick={startBulkAddSheets}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <i className="ri-file-upload-line w-4 h-4"></i>
            <span>CSV 대량 등록</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4"></i>
              <input
                type="text"
                placeholder="악보 검색..."
                value={sheetSearchTerm}
                onChange={(e) => setSheetSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="sm:w-48">
              <select
                value={sheetCategoryFilter}
                onChange={(e) => setSheetCategoryFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="all">전체 카테고리</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={paginatedSheets.length > 0 && selectedSheetIds.length === paginatedSheets.length}
                    onChange={(e) => handleSelectAllSheets(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">앨범 이미지</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">악보 정보</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">카테고리</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">난이도</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">가격</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">등록일</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedSheets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    {sheetSearchTerm || sheetCategoryFilter !== 'all' ? '검색 결과가 없습니다.' : '악보가 없습니다.'}
                  </td>
                </tr>
              ) : (
                paginatedSheets.map((sheet) => {
                  const category = (sheet as any).categories;
                  const isSelected = selectedSheetIds.includes(sheet.id);
                  return (
                    <tr key={sheet.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectSheet(sheet.id, e.target.checked)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <img
                          src={(sheet as any).thumbnail_url || `https://readdy.ai/api/search-image?query=drum%20sheet%20music%20${sheet.title}%20modern%20minimalist%20background&width=60&height=60&seq=${sheet.id}&orientation=square`}
                          alt={sheet.title}
                          className="w-12 h-12 object-cover rounded border border-gray-200"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{sheet.title}</div>
                          <div className="text-sm text-gray-500">{sheet.artist}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                          {category?.name || '미분류'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {(() => {
                          // 난이도 값 가져오기 및 정규화
                          const rawDifficulty = sheet.difficulty;
                          if (!rawDifficulty) {
                            console.warn(`⚠️ 난이도 없음: 악보 ID ${sheet.id}, 제목: ${sheet.title}`);
                            return (
                              <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                                미설정
                              </span>
                            );
                          }

                          // 문자열로 변환하고 정규화
                          const difficulty = String(rawDifficulty).toLowerCase().trim();

                          let displayText = '미설정';
                          let bgColor = 'bg-gray-100 text-gray-800';

                          // 다양한 형식 지원
                          if (difficulty === 'beginner' || difficulty === '초급') {
                            displayText = '초급';
                            bgColor = 'bg-green-100 text-green-800';
                          } else if (difficulty === 'intermediate' || difficulty === '중급') {
                            displayText = '중급';
                            bgColor = 'bg-yellow-100 text-yellow-800';
                          } else if (difficulty === 'advanced' || difficulty === '고급') {
                            displayText = '고급';
                            bgColor = 'bg-red-100 text-red-800';
                          } else {
                            // 예상치 못한 값인 경우 원본 값 표시 (디버깅용)
                            console.warn(`⚠️ 예상치 못한 난이도 값: "${rawDifficulty}" (악보 ID: ${sheet.id}, 제목: ${sheet.title})`);
                            displayText = `미설정 (${rawDifficulty})`;
                            bgColor = 'bg-gray-100 text-gray-800';
                          }

                          return (
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${bgColor}`}>
                              {displayText}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ₩{sheet.price.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${sheet.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                          {sheet.is_active ? '활성' : '비활성'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(sheet.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={async () => {
                              setEditingSheet(sheet);
                              
                              // 기존 카테고리들을 drum_sheet_categories에서 불러오기
                              const { data: categoryRelations, error: categoryError } = await supabase
                                .from('drum_sheet_categories')
                                .select('category_id')
                                .eq('sheet_id', sheet.id);

                              let categoryIds: string[] = [];
                              if (!categoryError && categoryRelations) {
                                categoryIds = categoryRelations.map(rel => rel.category_id);
                              }
                              
                              // 기존 category_id가 있지만 categoryIds에 없으면 추가 (하위 호환성)
                              if (sheet.category_id && !categoryIds.includes(sheet.category_id)) {
                                categoryIds.push(sheet.category_id);
                              }

                              setEditingSheetData({
                                title: sheet.title,
                                artist: sheet.artist,
                                difficulty: sheet.difficulty,
                                price: sheet.price,
                                category_id: sheet.category_id || (categoryIds.length > 0 ? categoryIds[0] : ''),
                                category_ids: categoryIds,
                                thumbnail_url: (sheet as any).thumbnail_url || '',
                                album_name: (sheet as any).album_name || '',
                                page_count: (sheet as any).page_count || 0,
                                tempo: (sheet as any).tempo || 0,
                                youtube_url: (sheet as any).youtube_url || '',
                                is_active: sheet.is_active
                              });
                            }}
                            className="text-blue-600 hover:text-blue-900 transition-colors"
                          >
                            <i className="ri-edit-line w-4 h-4"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteSheet(sheet.id)}
                            className="text-red-600 hover:text-red-900 transition-colors"
                            title="삭제"
                          >
                            <i className="ri-delete-bin-line w-4 h-4"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {sheetTotalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              전체 {filteredSheets.length}개 중 {sheetStartIndex + 1}-{Math.min(sheetEndIndex, filteredSheets.length)}개 표시
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setSheetCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={sheetCurrentPage === 1}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${sheetCurrentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                <i className="ri-arrow-left-s-line"></i>
              </button>

              {Array.from({ length: sheetTotalPages }, (_, i) => i + 1).map((page) => {
                // 현재 페이지 주변 2페이지씩만 표시
                if (
                  page === 1 ||
                  page === sheetTotalPages ||
                  (page >= sheetCurrentPage - 2 && page <= sheetCurrentPage + 2)
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => setSheetCurrentPage(page)}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${sheetCurrentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                        }`}
                    >
                      {page}
                    </button>
                  );
                } else if (
                  page === sheetCurrentPage - 3 ||
                  page === sheetCurrentPage + 3
                ) {
                  return (
                    <span key={page} className="px-2 text-gray-400">
                      ...
                    </span>
                  );
                }
                return null;
              })}

              <button
                onClick={() => setSheetCurrentPage(prev => Math.min(sheetTotalPages, prev + 1))}
                disabled={sheetCurrentPage === sheetTotalPages}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${sheetCurrentPage === sheetTotalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                  }`}
              >
                <i className="ri-arrow-right-s-line"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CSV 대량 등록 모달 */}
      {showSheetBulkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900">CSV 대량 악보 등록</h3>
              <button
                onClick={() => {
                  setShowSheetBulkModal(false);
                  setSheetCsvData([]);
                  setBulkPdfFiles([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line w-6 h-6"></i>
              </button>
            </div>
            <div className="space-y-6">
              {/* 1단계: CSV 파일 선택 */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">Step 1. 데이터 파일 (CSV)</h4>
                <div className="flex gap-3 items-center">
                  <label className="flex-1 cursor-pointer">
                    <span className="block w-full px-4 py-2 bg-white border border-blue-300 rounded-lg text-blue-700 text-center hover:bg-blue-50 transition-colors">
                      {sheetCsvFile ? sheetCsvFile.name : 'CSV 파일 선택'}
                    </span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleSheetCsvUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={downloadSheetCsvSample}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors flex items-center gap-2"
                  >
                    <i className="ri-download-line"></i>
                    <span className="text-sm">샘플</span>
                  </button>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  * 필수 항목: 곡명, 아티스트<br/>
                  * 추가 항목: 난이도, 파일명, 유튜브링크, 장르(KPOP, POP 등), 가격, 템포
                </p>
              </div>
              {/* 2단계: PDF 파일 다중 선택 */}
              <div className="bg-green-50 border border-green-100 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-2">Step 2. 악보 파일 (PDF)</h4>
                <label className="block w-full cursor-pointer">
                  <div className="border-2 border-dashed border-green-300 rounded-lg p-6 text-center bg-white hover:bg-green-50 transition-colors">
                    <i className="ri-file-pdf-line text-3xl text-green-500 mb-2"></i>
                    <p className="text-green-800 font-medium">
                      {bulkPdfFiles.length > 0 
                        ? `${bulkPdfFiles.length}개의 파일이 선택됨` 
                        : '여기를 클릭하여 PDF 파일들을 선택하세요 (다중 선택 가능)'}
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      CSV의 '파일명' 컬럼과 정확히 일치하는 파일을 자동으로 매칭합니다.
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        setBulkPdfFiles(Array.from(e.target.files));
                      }
                    }}
                    className="hidden"
                  />
                </label>
                {bulkPdfFiles.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-600 bg-white p-2 rounded border border-green-200">
                    {bulkPdfFiles.map(f => f.name).join(', ')}
                  </div>
                )}
              </div>
              {/* 데이터 미리보기 및 등록 버튼 (항상 표시하되 데이터 없으면 비활성) */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-sm font-medium text-gray-700">
                    {sheetCsvData.length > 0 ? (
                      <span className="text-blue-600">총 {sheetCsvData.length}개 데이터 준비됨</span>
                    ) : (
                      <span className="text-gray-400">데이터가 로드되지 않았습니다.</span>
                    )}
                  </div>
                  
                  {/* PDF 매칭 정보 */}
                  {sheetCsvData.length > 0 && (
                    <span className="text-xs text-gray-500">
                      PDF 자동 매칭: {sheetCsvData.filter(row => {
                        const fname = row.파일명 || row.filename || row.fileName || row['파일명'];
                        const link = row.PDF링크 || row.pdf_url || row.pdfUrl || row['PDF URL'];
                        if (link) return true; // URL 있으면 매칭 성공으로 간주
                        return bulkPdfFiles.some(f => f.name === fname);
                      }).length}개 가능
                    </span>
                  )}
                </div>
                
                <button
                  onClick={processSheetCsvData}
                  disabled={isSheetCsvProcessing || sheetCsvData.length === 0}
                  className={`w-full py-3 rounded-lg font-bold text-white shadow-sm transition-all flex items-center justify-center gap-2 ${
                    isSheetCsvProcessing || sheetCsvData.length === 0
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {isSheetCsvProcessing ? (
                    <>
                      <i className="ri-loader-4-line animate-spin text-xl"></i>
                      <span>처리 중... (잠시만 기다려주세요)</span>
                    </>
                  ) : (
                    <>
                      <i className="ri-check-double-line text-xl"></i>
                      <span>
                        {sheetCsvData.length > 0 
                          ? `${sheetCsvData.length}개 일괄 등록 시작하기` 
                          : 'CSV 파일을 먼저 선택해주세요'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 새 악보 추가 모달 */}
      {isAddingSheet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl max-h-[90vh] flex flex-col">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">새 악보 추가</h3>
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="space-y-4">
                {/* 제목과 아티스트 - 가로 배치 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                    <input
                      type="text"
                      value={newSheet.title}
                      onChange={(e) => setNewSheet({ ...newSheet, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">아티스트</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newSheet.artist}
                        onChange={(e) => setNewSheet({ ...newSheet, artist: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => fetchSpotifyInfo(newSheet.title, newSheet.artist)}
                        disabled={!newSheet.title || !newSheet.artist || isLoadingSpotify}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 whitespace-nowrap"
                      >
                        {isLoadingSpotify ? (
                          <>
                            <i className="ri-loader-4-line animate-spin w-4 h-4"></i>
                            <span>검색 중...</span>
                          </>
                        ) : (
                          <>
                            <i className="ri-music-2-line w-4 h-4"></i>
                            <span>Spotify 검색</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 앨범명 입력 필드 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">앨범명 (선택)</label>
                  <input
                    type="text"
                    value={newSheet.album_name || ''}
                    onChange={(e) => setNewSheet({ ...newSheet, album_name: e.target.value })}
                    placeholder="앨범명을 입력하세요"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Spotify 정보 표시 */}
                {(newSheet.thumbnail_url || newSheet.album_name) && (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    {newSheet.thumbnail_url && (
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">앨범 썸네일</label>
                        <img
                          src={newSheet.thumbnail_url}
                          alt="앨범 썸네일"
                          className="w-32 h-32 object-cover rounded-lg border border-gray-300"
                        />
                      </div>
                    )}
                    {newSheet.album_name && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">앨범명</label>
                        <input
                          type="text"
                          value={newSheet.album_name}
                          onChange={(e) => setNewSheet({ ...newSheet, album_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* 유튜브 URL과 썸네일 URL - 가로 배치 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">유튜브 URL (선택)</label>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newSheet.youtube_url}
                        onChange={(e) => {
                          const url = e.target.value;
                          setNewSheet({ ...newSheet, youtube_url: url });
                          // 유튜브 URL이 입력되면 자동으로 썸네일 가져오기
                          if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
                            fetchYoutubeThumbnail(url);
                          }
                        }}
                        placeholder="https://www.youtube.com/watch?v=영상ID"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      {newSheet.youtube_url && extractVideoId(newSheet.youtube_url) && (
                        <button
                          type="button"
                          onClick={() => fetchYoutubeThumbnail(newSheet.youtube_url)}
                          className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-1 whitespace-nowrap"
                        >
                          <i className="ri-youtube-line w-4 h-4"></i>
                          <span className="text-sm">썸네일</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">썸네일 URL (선택)</label>
                    <input
                      type="text"
                      value={newSheet.thumbnail_url}
                      onChange={(e) => setNewSheet({ ...newSheet, thumbnail_url: e.target.value })}
                      placeholder="썸네일 이미지 URL"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>

                {/* 썸네일 파일 업로드 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">썸네일 파일 업로드 (선택)</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleThumbnailUpload(file);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  {isUploadingThumbnail && (
                    <p className="mt-1 text-sm text-blue-600">썸네일 업로드 중...</p>
                  )}
                  {newSheet.thumbnail_file && (
                    <p className="mt-1 text-sm text-gray-600">업로드된 파일: {newSheet.thumbnail_file.name}</p>
                  )}
                </div>

                {/* 썸네일 미리보기 */}
                {newSheet.thumbnail_url && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">썸네일 미리보기</label>
                    <img
                      src={newSheet.thumbnail_url}
                      alt="썸네일 미리보기"
                      className="w-32 h-32 object-cover rounded-lg border border-gray-300"
                      onError={(e) => {
                        // maxresdefault.jpg 실패 시 0.jpg로 폴백
                        const img = e.target as HTMLImageElement;
                        const currentSrc = img.src;
                        if (currentSrc.includes('maxresdefault.jpg')) {
                          const videoId = extractVideoId(newSheet.youtube_url);
                          if (videoId) {
                            img.src = `https://img.youtube.com/vi/${videoId}/0.jpg`;
                          }
                        }
                      }}
                    />
                  </div>
                )}

                {/* PDF 파일 업로드 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PDF 파일</label>
                  
                  {/* [추가] PDF URL이 이미 세팅되어 있다면(주문제작에서 넘어온 경우) 다운로드 링크 제공 */}
                  {newSheet.pdf_url && !newSheet.pdf_file && (
                    <div className="mb-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                      <p className="font-semibold mb-1">ℹ️ 주문 제작된 원본 파일이 있습니다.</p>
                      <p className="mb-2">판매용 악보로 등록하려면 아래 파일을 다운로드한 후, 다시 업로드해주세요. (미리보기 생성 및 권한 설정을 위해 재업로드가 권장됩니다.)</p>
                      <a 
                        href={newSheet.pdf_url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <i className="ri-download-line"></i> 원본 파일 다운로드
                      </a>
                    </div>
                  )}
                  
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setNewSheet(prev => ({ ...prev, pdf_file: file }));
                        handlePdfUpload(file);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  {isUploadingPdf && (
                    <p className="mt-1 text-sm text-blue-600">PDF 업로드 및 처리 중...</p>
                  )}
                  {newSheet.page_count > 0 && (
                    <p className="mt-1 text-sm text-gray-600">페이지수: {newSheet.page_count}페이지</p>
                  )}
                  {newSheet.preview_image_url && (
                    <div className="mt-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">미리보기 이미지</label>
                      <div className="relative">
                        <img
                          src={newSheet.preview_image_url}
                          alt="미리보기"
                          className="w-full max-w-md object-contain rounded-lg border border-gray-300 bg-gray-50"
                          onError={(e) => {
                            console.error('미리보기 이미지 로드 실패:', newSheet.preview_image_url);
                            const img = e.target as HTMLImageElement;
                            img.style.display = 'none';
                            // 에러 메시지 표시
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800';
                            errorDiv.textContent = '미리보기 이미지를 불러올 수 없습니다.';
                            img.parentElement?.appendChild(errorDiv);
                          }}
                          onLoad={() => {
                            console.log('미리보기 이미지 로드 성공:', newSheet.preview_image_url);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 페이지수, 템포, 난이도, 가격 - 2x2 그리드 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">페이지수</label>
                    <input
                      type="number"
                      value={newSheet.page_count}
                      onChange={(e) => setNewSheet({ ...newSheet, page_count: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">템포 (BPM)</label>
                    <input
                      type="number"
                      value={newSheet.tempo}
                      onChange={(e) => setNewSheet({ ...newSheet, tempo: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="0"
                      placeholder="예: 120"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">난이도</label>
                    <select
                      value={newSheet.difficulty}
                      onChange={(e) => setNewSheet({ ...newSheet, difficulty: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                    >
                      <option value="초급">초급</option>
                      <option value="중급">중급</option>
                      <option value="고급">고급</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">가격</label>
                    <input
                      type="number"
                      value={newSheet.price}
                      onChange={(e) => setNewSheet({ ...newSheet, price: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 카테고리 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">카테고리 (중복 선택 가능) *</label>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2 bg-gray-50">
                    {categories.length === 0 ? (
                      <p className="text-sm text-gray-500">카테고리가 없습니다.</p>
                    ) : (
                      <div className="space-y-2">
                        {categories.map((category) => (
                          <label key={category.id} className="flex items-center space-x-2 cursor-pointer hover:bg-white p-1 rounded">
                            <input
                              type="checkbox"
                              checked={newSheet.category_ids.includes(category.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewSheet({
                                    ...newSheet,
                                    category_ids: [...newSheet.category_ids, category.id],
                                    category_id: category.id // 첫 번째 선택된 카테고리를 category_id에도 저장 (하위 호환성)
                                  });
                                } else {
                                  const newCategoryIds = newSheet.category_ids.filter((id) => id !== category.id);
                                  setNewSheet({
                                    ...newSheet,
                                    category_ids: newCategoryIds,
                                    category_id: newCategoryIds.length > 0 ? newCategoryIds[0] : '' // 첫 번째 카테고리를 category_id에 저장
                                  });
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{category.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {newSheet.category_ids.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      선택됨: {newSheet.category_ids.length}개
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={() => {
                  setIsAddingSheet(false);
                  setNewSheet({
                    title: '',
                    artist: '',
                    difficulty: '초급',
                    price: 0,
                    category_id: '',
                    category_ids: [],
                    thumbnail_url: '',
                    album_name: '',
                    page_count: 0,
                    tempo: 0,
                    pdf_file: null,
                    preview_image_url: '',
                    pdf_url: '',
                    youtube_url: ''
                  });
                  setIsLoadingSpotify(false);
                  setIsUploadingPdf(false);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddSheet}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 악보 수정 모달 */}
      {editingSheet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl my-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">악보 수정</h3>
              <button
                onClick={() => {
                  setEditingSheet(null);
                  setEditingSheetData({
                    title: '',
                    artist: '',
                    difficulty: '초급',
                    price: 0,
                    category_id: '',
                    thumbnail_url: '',
                    album_name: '',
                    page_count: 0,
                    tempo: 0,
                    youtube_url: '',
                    is_active: true
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line w-5 h-5"></i>
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
                  <input
                    type="text"
                    value={editingSheetData.title}
                    onChange={(e) => setEditingSheetData({ ...editingSheetData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">아티스트 *</label>
                  <input
                    type="text"
                    value={editingSheetData.artist}
                    onChange={(e) => setEditingSheetData({ ...editingSheetData, artist: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">난이도</label>
                  <select
                    value={editingSheetData.difficulty}
                    onChange={(e) => setEditingSheetData({ ...editingSheetData, difficulty: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="초급">초급</option>
                    <option value="중급">중급</option>
                    <option value="고급">고급</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">카테고리 (중복 선택 가능) *</label>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2 bg-gray-50">
                    {categories.length === 0 ? (
                      <p className="text-sm text-gray-500">카테고리가 없습니다.</p>
                    ) : (
                      <div className="space-y-2">
                        {categories.map((category) => (
                          <label key={category.id} className="flex items-center space-x-2 cursor-pointer hover:bg-white p-1 rounded">
                            <input
                              type="checkbox"
                              checked={editingSheetData.category_ids.includes(category.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const newCategoryIds = [...editingSheetData.category_ids, category.id];
                                  setEditingSheetData({
                                    ...editingSheetData,
                                    category_ids: newCategoryIds,
                                    category_id: category.id // 첫 번째 선택된 카테고리를 category_id에도 저장 (하위 호환성)
                                  });
                                } else {
                                  const newCategoryIds = editingSheetData.category_ids.filter((id) => id !== category.id);
                                  setEditingSheetData({
                                    ...editingSheetData,
                                    category_ids: newCategoryIds,
                                    category_id: newCategoryIds.length > 0 ? newCategoryIds[0] : '' // 첫 번째 카테고리를 category_id에 저장
                                  });
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-700">{category.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {editingSheetData.category_ids.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      선택됨: {editingSheetData.category_ids.length}개
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">가격</label>
                  <input
                    type="number"
                    value={editingSheetData.price}
                    onChange={(e) => setEditingSheetData({ ...editingSheetData, price: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">페이지수</label>
                  <input
                    type="number"
                    value={editingSheetData.page_count}
                    onChange={(e) => setEditingSheetData({ ...editingSheetData, page_count: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">템포 (BPM)</label>
                  <input
                    type="number"
                    value={editingSheetData.tempo}
                    onChange={(e) => setEditingSheetData({ ...editingSheetData, tempo: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">앨범명</label>
                <input
                  type="text"
                  value={editingSheetData.album_name}
                  onChange={(e) => setEditingSheetData({ ...editingSheetData, album_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">유튜브 URL</label>
                <input
                  type="text"
                  value={editingSheetData.youtube_url}
                  onChange={(e) => {
                    const url = e.target.value;
                    setEditingSheetData({ ...editingSheetData, youtube_url: url });
                    // 유튜브 URL이 입력되면 자동으로 썸네일 가져오기
                    if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
                      fetchYoutubeThumbnail(url, true);
                    }
                  }}
                  placeholder="https://www.youtube.com/watch?v=영상ID 또는 https://youtu.be/영상ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">썸네일 URL</label>
                <input
                  type="text"
                  value={editingSheetData.thumbnail_url}
                  onChange={(e) => setEditingSheetData({ ...editingSheetData, thumbnail_url: e.target.value })}
                  placeholder="썸네일 이미지 URL을 입력하세요"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {editingSheetData.thumbnail_url && (
                  <div className="mt-2">
                    <img
                      src={editingSheetData.thumbnail_url}
                      alt="썸네일 미리보기"
                      className="w-32 h-32 object-cover rounded-lg border border-gray-300"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editingSheetData.is_active}
                    onChange={(e) => setEditingSheetData({ ...editingSheetData, is_active: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">활성 상태</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6 border-t border-gray-200 pt-4">
              <button
                onClick={() => {
                  setEditingSheet(null);
                  setEditingSheetData({
                    title: '',
                    artist: '',
                    difficulty: '초급',
                    price: 0,
                    category_id: '',
                    category_ids: [],
                    thumbnail_url: '',
                    album_name: '',
                    page_count: 0,
                    tempo: 0,
                    youtube_url: '',
                    is_active: true
                  });
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={async () => {
                  if (!editingSheet) return;

                  if (!editingSheetData.title || !editingSheetData.artist || editingSheetData.category_ids.length === 0) {
                    alert('제목, 아티스트, 카테고리는 필수입니다.');
                    return;
                  }

                  try {
                    // category_id는 첫 번째 선택된 카테고리로 설정 (하위 호환성)
                    const categoryId = editingSheetData.category_ids.length > 0 ? editingSheetData.category_ids[0] : '';

                    const updateData: any = {
                      title: editingSheetData.title,
                      artist: editingSheetData.artist,
                      difficulty: editingSheetData.difficulty,
                      price: editingSheetData.price,
                      category_id: categoryId,
                      is_active: editingSheetData.is_active
                    };

                    if (editingSheetData.thumbnail_url) {
                      updateData.thumbnail_url = editingSheetData.thumbnail_url;
                    } else {
                      updateData.thumbnail_url = null;
                    }

                    if (editingSheetData.album_name) {
                      updateData.album_name = editingSheetData.album_name;
                    }

                    if (editingSheetData.page_count > 0) {
                      updateData.page_count = editingSheetData.page_count;
                    }

                    if (editingSheetData.tempo > 0) {
                      updateData.tempo = editingSheetData.tempo;
                    }

                    if (editingSheetData.youtube_url) {
                      updateData.youtube_url = editingSheetData.youtube_url;
                    }

                    const { error } = await supabase
                      .from('drum_sheets')
                      .update(updateData)
                      .eq('id', editingSheet.id);

                    if (error) throw error;

                    // drum_sheet_categories 테이블 업데이트
                    // 기존 관계 삭제
                    console.log('기존 카테고리 관계 삭제 시작:', editingSheet.id);
                    const { error: deleteError } = await supabase
                      .from('drum_sheet_categories')
                      .delete()
                      .eq('sheet_id', editingSheet.id);

                    if (deleteError) {
                      console.error('기존 카테고리 관계 삭제 오류:', deleteError);
                    } else {
                      console.log('기존 카테고리 관계 삭제 완료');
                    }

                    // 새로운 관계 추가
                    if (editingSheetData.category_ids.length > 0) {
                      const categoryRelations = editingSheetData.category_ids.map(categoryId => ({
                        sheet_id: editingSheet.id,
                        category_id: categoryId
                      }));

                      console.log('새 카테고리 관계 추가 시작:', categoryRelations);
                      const { error: insertError, data: insertData } = await supabase
                        .from('drum_sheet_categories')
                        .insert(categoryRelations)
                        .select();

                      if (insertError) {
                        console.error('카테고리 관계 추가 오류:', insertError);
                        // 경고만 표시하고 계속 진행
                        alert('악보는 수정되었지만 카테고리 관계 업데이트 중 오류가 발생했습니다.');
                      } else {
                        console.log('카테고리 관계 추가 완료:', insertData);
                      }
                    } else {
                      console.warn('category_ids가 비어있습니다.');
                    }

                    alert('악보가 수정되었습니다.');
                    setEditingSheet(null);
                    setEditingSheetData({
                      title: '',
                      artist: '',
                      difficulty: '초급',
                      price: 0,
                      category_id: '',
                      category_ids: [],
                      thumbnail_url: '',
                      album_name: '',
                      page_count: 0,
                      tempo: 0,
                      youtube_url: '',
                      is_active: true
                    });
                    loadSheets();
                  } catch (error) {
                    console.error('악보 수정 오류:', error);
                    alert('악보 수정 중 오류가 발생했습니다.');
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 수정 모달 */}
      {showBulkEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">일괄 수정 ({selectedSheetIds.length}개)</h3>
              <button
                onClick={() => {
                  setShowBulkEditModal(false);
                  setBulkEditData({
                    category_id: '',
                    difficulty: '',
                    price: '',
                    is_active: null
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="ri-close-line w-5 h-5"></i>
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                선택한 {selectedSheetIds.length}개의 악보에 대해 수정할 항목만 입력하세요. 빈 항목은 변경되지 않습니다.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                <select
                  value={bulkEditData.category_id}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">변경 안 함</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">난이도</label>
                <select
                  value={bulkEditData.difficulty}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, difficulty: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">변경 안 함</option>
                  <option value="beginner">초급</option>
                  <option value="intermediate">중급</option>
                  <option value="advanced">고급</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">가격</label>
                <input
                  type="number"
                  value={bulkEditData.price}
                  onChange={(e) => setBulkEditData({ ...bulkEditData, price: e.target.value })}
                  placeholder="변경 안 함 (빈칸 유지)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">활성 상태</label>
                <select
                  value={bulkEditData.is_active === null ? '' : bulkEditData.is_active ? 'true' : 'false'}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBulkEditData({
                      ...bulkEditData,
                      is_active: value === '' ? null : value === 'true'
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                >
                  <option value="">변경 안 함</option>
                  <option value="true">활성</option>
                  <option value="false">비활성</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6 border-t border-gray-200 pt-4">
              <button
                onClick={() => {
                  setShowBulkEditModal(false);
                  setBulkEditData({
                    category_id: '',
                    difficulty: '',
                    price: '',
                    is_active: null
                  });
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleBulkEdit}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                수정 적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderCategoryManagement = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">카테고리 관리</h2>
        <button
          onClick={() => setIsAddingCategory(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <i className="ri-add-line w-4 h-4"></i>
          <span>새 카테고리 추가</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">설명</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">생성일</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories.map((category) => (
                <tr key={category.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {category.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {category.description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(category.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setEditingCategory(category)}
                        className="text-blue-600 hover:text-blue-900 transition-colors"
                      >
                        <i className="ri-edit-line w-4 h-4"></i>
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        className="text-red-600 hover:text-red-900 transition-colors"
                      >
                        <i className="ri-delete-bin-line w-4 h-4"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 새 카테고리 추가 모달 */}
      {isAddingCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">새 카테고리 추가</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                <textarea
                  value={newCategory.description}
                  onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setIsAddingCategory(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddCategory}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 카테고리 수정 모달 */}
      {editingCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">카테고리 수정</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                <textarea
                  value={editingCategory.description || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleUpdateCategory}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                수정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  const renderCollectionManagement = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">악보모음집 관리</h2>
        <button
          onClick={() => {
            setNewCollection(createEmptyCollectionFormState());
            setNewCollectionActiveLang('ko');
            setSelectedSheetsForNewCollection([]);
            setCollectionSheetSearchTerm('');
            setCollectionArtistSearchTerm('');
            setIsAddingCollection(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <i className="ri-add-line w-4 h-4"></i>
          <span>새 모음집 추가</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">제목</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">설명</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">가격</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">생성일</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {collections.map((collection) => (
                <tr key={collection.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {collection.title}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {collection.description || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {collection.sale_price > 0 ? (
                      <div>
                        {collection.original_price > collection.sale_price && (
                          <span className="line-through text-gray-400 mr-2">
                            {new Intl.NumberFormat('ko-KR').format(collection.original_price)}원
                          </span>
                        )}
                        <span className="text-blue-600 font-semibold">
                          {new Intl.NumberFormat('ko-KR').format(collection.sale_price)}원
                        </span>
                        {collection.discount_percentage > 0 && (
                          <span className="ml-2 text-red-500 text-xs">
                            ({collection.discount_percentage}% 할인)
                          </span>
                        )}
                      </div>
                    ) : (
                      <span>{new Intl.NumberFormat('ko-KR').format(collection.original_price)}원</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${collection.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {collection.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(collection.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          setEditingCollection(collection);
                          setEditingCollectionData({
                            title: collection.title,
                            description: collection.description || '',
                            thumbnail_url: collection.thumbnail_url || '',
                            original_price: collection.original_price,
                            sale_price: collection.sale_price,
                            discount_percentage: collection.discount_percentage,
                            is_active: collection.is_active,
                            category_id: collection.category_id || '',
                            category_ids: collection.category_ids || (collection.category_id ? [collection.category_id] : []),
                            title_translations: buildInitialTranslations(collection.title_translations, collection.title),
                            description_translations: buildInitialTranslations(
                              collection.description_translations,
                              collection.description || ''
                            ),
                          });
                          setEditingCollectionActiveLang('ko');
                        }}
                        className="text-blue-600 hover:text-blue-900 transition-colors"
                        title="수정"
                      >
                        <i className="ri-edit-line w-4 h-4"></i>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedCollectionId(collection.id);
                          loadCollectionSheets(collection.id);
                          setShowCollectionSheetsModal(true);
                        }}
                        className="text-purple-600 hover:text-purple-900 transition-colors"
                        title="악보 관리"
                      >
                        <i className="ri-file-music-line w-4 h-4"></i>
                      </button>
                      <button
                        onClick={() => handleDeleteCollection(collection.id)}
                        className="text-red-600 hover:text-red-900 transition-colors"
                        title="삭제"
                      >
                        <i className="ri-delete-bin-line w-4 h-4"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 새 모음집 추가 모달 */}
      {isAddingCollection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">새 모음집 추가</h3>
            <div className="space-y-4">
              {renderTranslationEditor(
                newCollection,
                newCollectionActiveLang,
                setNewCollectionActiveLang,
                (lang, field, value) => updateCollectionTranslation(setNewCollection, lang, field, value),
                () => copyKoreanTranslationsToAll(setNewCollection)
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리 (중복 선택 가능)</label>
                <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2 bg-gray-50">
                  {categories.length === 0 ? (
                    <p className="text-sm text-gray-500">카테고리가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {categories.map((category) => (
                        <label key={category.id} className="flex items-center space-x-2 cursor-pointer hover:bg-white p-1 rounded">
                          <input
                            type="checkbox"
                            checked={newCollection.category_ids.includes(category.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewCollection({
                                  ...newCollection,
                                  category_ids: [...newCollection.category_ids, category.id],
                                });
                              } else {
                                setNewCollection({
                                  ...newCollection,
                                  category_ids: newCollection.category_ids.filter((id) => id !== category.id),
                                });
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{category.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {newCollection.category_ids.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    선택됨: {newCollection.category_ids.length}개
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">썸네일 URL</label>
                <input
                  type="text"
                  value={newCollection.thumbnail_url}
                  onChange={(e) => setNewCollection({ ...newCollection, thumbnail_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://..."
                />
              </div>

              {/* 가격 정보 */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      정가 (원)
                      <span className="text-xs text-gray-500 ml-2">
                        (선택된 악보: {selectedSheetsForNewCollection.length}개)
                      </span>
                    </label>
                    <input
                      type="number"
                      value={newCollection.original_price}
                      onChange={(e) => {
                        const price = parseInt(e.target.value) || 0;
                        setNewCollection({
                          ...newCollection,
                          original_price: price,
                          discount_percentage: calculateDiscountPercentage(price, newCollection.sale_price)
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                      readOnly={selectedSheetsForNewCollection.length > 0}
                    />
                    {selectedSheetsForNewCollection.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        자동 계산: {new Intl.NumberFormat('ko-KR').format(calculateTotalPrice(selectedSheetsForNewCollection))}원
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">할인가 (원)</label>
                    <input
                      type="number"
                      value={newCollection.sale_price}
                      onChange={(e) => {
                        const salePrice = parseInt(e.target.value) || 0;
                        const discount = calculateDiscountPercentage(newCollection.original_price, salePrice);
                        setNewCollection({
                          ...newCollection,
                          sale_price: salePrice,
                          discount_percentage: discount
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">할인율 (%)</label>
                    <input
                      type="number"
                      value={newCollection.discount_percentage}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                    />
                    {newCollection.discount_percentage > 0 && (
                      <p className="text-xs text-red-600 mt-1 font-semibold">
                        {newCollection.discount_percentage}% 할인
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 선택된 악보 목록 */}
              {selectedSheetsForNewCollection.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    선택된 악보 ({selectedSheetsForNewCollection.length}개)
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
                    <div className="flex flex-wrap gap-2">
                      {selectedSheetsForNewCollection.map((sheet) => (
                        <div
                          key={sheet.id}
                          className="flex items-center space-x-2 bg-white px-3 py-1 rounded-full border border-gray-300"
                        >
                          <span className="text-sm text-gray-900">{sheet.title} - {sheet.artist}</span>
                          <span className="text-xs text-gray-500">({new Intl.NumberFormat('ko-KR').format(sheet.price || 0)}원)</span>
                          <button
                            onClick={() => handleRemoveSheetFromNewCollection(sheet.id)}
                            className="text-red-600 hover:text-red-800"
                            title="제거"
                          >
                            <i className="ri-close-line w-4 h-4"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 악보 검색 및 선택 */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">악보 추가</h4>

                {/* 검색 필터 */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">곡명/아티스트 검색</label>
                    <input
                      type="text"
                      value={collectionSheetSearchTerm}
                      onChange={(e) => setCollectionSheetSearchTerm(e.target.value)}
                      placeholder="곡명 또는 아티스트로 검색..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">아티스트로 일괄 선택</label>
                    <input
                      type="text"
                      value={collectionArtistSearchTerm}
                      onChange={(e) => setCollectionArtistSearchTerm(e.target.value)}
                      placeholder="아티스트명 입력 후 일괄 선택..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 아티스트별 일괄 선택 버튼 */}
                {collectionArtistSearchTerm && Object.keys(sheetsByArtist).length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-600 mb-2">일괄 선택 가능한 아티스트:</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(sheetsByArtist).map((artist) => (
                        <button
                          key={artist}
                          onClick={() => handleSelectArtistSheets(artist)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm transition-colors"
                        >
                          {artist} ({sheetsByArtist[artist].length}개) 모두 선택
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 검색 결과 목록 */}
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                  {filteredSheetsForCollection.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      검색 결과가 없습니다.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {filteredSheetsForCollection.map((sheet) => (
                        <div
                          key={sheet.id}
                          className="flex items-center justify-between p-3 hover:bg-gray-50"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{sheet.title}</p>
                            <p className="text-xs text-gray-500 truncate">{sheet.artist}</p>
                          </div>
                          <div className="flex items-center space-x-3 ml-4">
                            <span className="text-sm text-gray-600 whitespace-nowrap">
                              {new Intl.NumberFormat('ko-KR').format(sheet.price || 0)}원
                            </span>
                            <button
                              onClick={() => handleAddSheetToNewCollection(sheet)}
                              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm transition-colors"
                            >
                              추가
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 활성화 체크박스 */}
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newCollection.is_active}
                    onChange={(e) => setNewCollection({ ...newCollection, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">활성화</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setIsAddingCollection(false);
                  setNewCollection(createEmptyCollectionFormState());
                  setNewCollectionActiveLang('ko');
                  setSelectedSheetsForNewCollection([]);
                  setCollectionSheetSearchTerm('');
                  setCollectionArtistSearchTerm('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddCollection}
                disabled={isAddingCollectionLoading}
                className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 ${isAddingCollectionLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
              >
                {isAddingCollectionLoading ? (
                  <>
                    <i className="ri-loader-4-line w-4 h-4 animate-spin"></i>
                    <span>처리 중...</span>
                  </>
                ) : (
                  <span>추가 ({selectedSheetsForNewCollection.length}개 악보)</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모음집 수정 모달 */}
      {editingCollection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">모음집 수정</h3>
            <div className="space-y-4">
              {renderTranslationEditor(
                editingCollectionData,
                editingCollectionActiveLang,
                setEditingCollectionActiveLang,
                (lang, field, value) => updateCollectionTranslation(setEditingCollectionData, lang, field, value),
                () => copyKoreanTranslationsToAll(setEditingCollectionData)
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리 (중복 선택 가능)</label>
                <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2 bg-gray-50">
                  {categories.length === 0 ? (
                    <p className="text-sm text-gray-500">카테고리가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {categories.map((category) => (
                        <label key={category.id} className="flex items-center space-x-2 cursor-pointer hover:bg-white p-1 rounded">
                          <input
                            type="checkbox"
                            checked={editingCollectionData.category_ids.includes(category.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditingCollectionData({
                                  ...editingCollectionData,
                                  category_ids: [...editingCollectionData.category_ids, category.id]
                                });
                              } else {
                                setEditingCollectionData({
                                  ...editingCollectionData,
                                  category_ids: editingCollectionData.category_ids.filter(id => id !== category.id)
                                });
                              }
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{category.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {editingCollectionData.category_ids.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    선택됨: {editingCollectionData.category_ids.length}개
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">썸네일 URL</label>
                <input
                  type="text"
                  value={editingCollectionData.thumbnail_url}
                  onChange={(e) => setEditingCollectionData({ ...editingCollectionData, thumbnail_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="https://..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">정가 (원)</label>
                  <input
                    type="number"
                    value={editingCollectionData.original_price}
                    onChange={(e) => setEditingCollectionData({ ...editingCollectionData, original_price: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">할인가 (원)</label>
                  <input
                    type="number"
                    value={editingCollectionData.sale_price}
                    onChange={(e) => setEditingCollectionData({ ...editingCollectionData, sale_price: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editingCollectionData.is_active}
                    onChange={(e) => setEditingCollectionData({ ...editingCollectionData, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">활성화</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setEditingCollection(null);
                  setEditingCollectionActiveLang('ko');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleUpdateCollection}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                수정
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 모음집 악보 관리 모달 */}
      {showCollectionSheetsModal && selectedCollectionId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">모음집 악보 관리</h3>
              <button
                onClick={() => {
                  setShowCollectionSheetsModal(false);
                  setSelectedCollectionId(null);
                  setCollectionSheets([]);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <i className="ri-close-line w-5 h-5"></i>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* 현재 모음집에 포함된 악보 */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">포함된 악보 ({collectionSheets.length}개)</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {collectionSheets.length === 0 ? (
                    <p className="text-gray-500 text-sm">포함된 악보가 없습니다.</p>
                  ) : (
                    collectionSheets.map((cs) => (
                      <div key={cs.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {cs.drum_sheets?.title || '알 수 없음'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {cs.drum_sheets?.artist || ''}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveSheetFromCollection(cs.id)}
                          className="text-red-600 hover:text-red-900 ml-2"
                          title="제거"
                        >
                          <i className="ri-delete-bin-line w-4 h-4"></i>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 악보 추가 */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">악보 추가</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {sheets.filter(sheet => !collectionSheets.some(cs => cs.drum_sheet_id === sheet.id)).map((sheet) => (
                    <div key={sheet.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{sheet.title}</p>
                        <p className="text-xs text-gray-500 truncate">{sheet.artist}</p>
                      </div>
                      <button
                        onClick={() => handleAddSheetToCollection(sheet.id)}
                        className="text-blue-600 hover:text-blue-900 ml-2"
                        title="추가"
                      >
                        <i className="ri-add-line w-4 h-4"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  const handleForceCompleteOrder = async () => {
    if (!selectedOrder) return;
    if (!confirm('정말로 이 주문을 강제 완료 처리하시겠습니까?\n\n주의: 이 작업은 되돌릴 수 없으며, 즉시 주문 상태가 "완료"로 변경되고 관련 포인트/구매 내역이 처리됩니다.')) {
      return;
    }

    setOrderActionLoading('confirm');
    try {
      const { data, error } = await supabase.functions.invoke('admin-complete-order', {
        body: { orderId: selectedOrder.id },
      });

      if (error) throw error;
      if (!data || (data.error)) throw new Error(data?.error || 'Unknown error');

      alert('주문이 강제로 완료 처리되었습니다.');
      handleCloseOrderDetail();
      loadOrders();
    } catch (error: any) {
      console.error('강제 완료 처리 오류:', error);
      alert(`처리 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setOrderActionLoading(null);
    }
  };

  const renderOrderDetailModal = () => {
    if (!isOrderDetailModalOpen || !selectedOrder) {
      return null;
    }

    const statusMeta = getOrderStatusMetaSafe(selectedOrder.status);
    const paymentLabel = getPaymentMethodLabel(selectedOrder.payment_method, selectedOrder);
    const paymentKey = selectedOrder.payment_method
      ? normalizePaymentMethodKey(selectedOrder.payment_method)
      : '';
    const isBankTransfer = ['bank_transfer', 'virtual_account'].includes(paymentKey);
    const itemCount = selectedOrder.order_items?.length ?? 0;
    const totalDownloadAttempts =
      selectedOrder.order_items?.reduce((sum, item) => sum + (item.download_attempt_count ?? 0), 0) ?? 0;
    const normalizedSelectedStatus = (selectedOrder.status ?? '').toLowerCase() as OrderStatus | '';
    const isRefundable = normalizedSelectedStatus
      ? REFUNDABLE_STATUSES.includes(normalizedSelectedStatus as OrderStatus)
      : false;
    const disableDelete =
      orderActionLoading !== null ||
      normalizedSelectedStatus === 'refunded' ||
      normalizedSelectedStatus === 'cancelled';
    const disableRefund = orderActionLoading !== null || !isRefundable;
    const shortOrderId = selectedOrder.id ? selectedOrder.id.slice(0, 8).toUpperCase() : '-';
    const displayOrderNumber = selectedOrder.order_number ?? `#${shortOrderId}`;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
        onClick={handleCloseOrderDetail}
      >
        <div
          className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
            <div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}>
                  {statusMeta.label}
                </span>
                <span className="text-xs text-gray-500">주문 상태</span>
              </div>
              <h3 className="mt-2 text-2xl font-bold text-gray-900">주문 상세</h3>
              <p className="mt-1 text-sm text-gray-500">
                주문 ID {selectedOrder.id} · 생성 {formatDateTime(selectedOrder.created_at)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCloseOrderDetail}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          <div className="space-y-6 px-6 py-6">
            {/* 주문 요약 카드 */}
            <div className="rounded-xl border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <span className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">결제방법</span>
                    <span className="text-sm font-medium text-gray-900">{paymentLabel}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-500">입금자명</span>
                    <span className="text-sm font-medium text-gray-900">{selectedOrder.depositor_name || '-'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-xs text-gray-500">총 결제금액</span>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedOrder.total_amount)}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">주문일</span>
                    <p className="text-sm font-medium text-gray-900">{formatDate(selectedOrder.created_at)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <section className="rounded-xl border border-gray-100 p-6">
                  <h4 className="text-lg font-semibold text-gray-900">결제 및 주문 정보</h4>
                  <dl className="mt-4 grid gap-x-6 gap-y-4 text-sm text-gray-700 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">주문 번호</dt>
                      <dd className="font-medium text-gray-900 break-all">{displayOrderNumber}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">주문 ID (UUID)</dt>
                      <dd className="font-medium text-gray-900 break-all">{selectedOrder.id}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">결제 방법</dt>
                      <dd className="font-medium text-gray-900">{paymentLabel}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">주문 일시</dt>
                      <dd className="font-medium text-gray-900">{formatDateTime(selectedOrder.created_at)}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">최근 업데이트</dt>
                      <dd className="font-medium text-gray-900">{formatDateTime(selectedOrder.updated_at)}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">총 결제금액</dt>
                      <dd className="font-medium text-gray-900">{formatCurrency(selectedOrder.total_amount)}</dd>
                    </div>
                    {/* depositor_name 추가 */}
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">입금자명</dt>
                      <dd className="font-medium text-gray-900">{selectedOrder.depositor_name || '-'}</dd>
                    </div>
                  </dl>
                </section>

                {/* 결제 실패/취소 이력 섹션 */}
                {(() => {
                  const notes = selectedOrder.metadata?.payment_notes;
                  if (!Array.isArray(notes) || notes.length === 0) return null;
                  return (
                    <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
                      <h4 className="text-lg font-semibold text-amber-800 flex items-center gap-2">
                        <i className="ri-error-warning-line"></i>
                        결제 시도 이력 ({notes.length}건)
                      </h4>
                      <p className="text-xs text-amber-600 mt-1 mb-3">
                        결제 실패 또는 취소된 기록입니다. 시스템 에러인 경우 빠르게 대응이 필요합니다.
                      </p>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {notes.map((n: any, idx: number) => {
                          let typeLabel = '알 수 없음';
                          let typeBg = 'bg-gray-100 text-gray-700';
                          if (n.type === 'cancel') { typeLabel = '사용자 취소'; typeBg = 'bg-yellow-100 text-yellow-800'; }
                          else if (n.type === 'error') { typeLabel = '결제 에러'; typeBg = 'bg-orange-100 text-orange-800'; }
                          else if (n.type === 'system_error') { typeLabel = '시스템 에러'; typeBg = 'bg-red-100 text-red-800'; }
                          return (
                            <div key={idx} className="flex items-start gap-3 rounded-lg bg-white p-3 border border-amber-100">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${typeBg} whitespace-nowrap`}>
                                {typeLabel}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800">{n.message}</p>
                                <p className="text-[10px] text-gray-400 mt-1">
                                  {n.timestamp ? new Date(n.timestamp).toLocaleString('ko-KR') : '시간 정보 없음'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })()}

                <section className="rounded-xl border border-gray-100 p-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-semibold text-gray-900">구매 악보</h4>
                    <span className="text-sm text-gray-500">{itemCount}개</span>
                  </div>
                  {itemCount === 0 ? (
                    <p className="mt-4 text-sm text-gray-500">구매한 악보 정보가 없습니다.</p>
                  ) : (
                    <ul className="mt-4 space-y-4">
                      {selectedOrder.order_items?.map((item) => {
                        const sheet = item.drum_sheets;
                        return (
                          <li
                            key={item.id}
                            className="flex items-start gap-4 rounded-lg border border-gray-100 p-4 transition-colors hover:border-blue-200"
                          >
                            <div className="h-16 w-16 overflow-hidden rounded-lg bg-gray-100">
                              {sheet?.thumbnail_url ? (
                                <img
                                  src={sheet.thumbnail_url}
                                  alt={sheet.title ?? '악보 썸네일'}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                                  이미지 없음
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {sheet?.title ?? '삭제된 악보'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {sheet?.artist ?? '아티스트 미확인'}
                              </p>
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                <span>구매가 {formatCurrency(item.price ?? sheet?.price ?? 0)}</span>
                                {item.created_at ? <span>구매일 {formatDateTime(item.created_at)}</span> : null}
                                <span className="inline-flex items-center gap-1 text-gray-600">
                                  <i className="ri-download-2-line text-gray-400"></i>
                                  다운로드 {item.download_attempt_count ?? 0}회
                                </span>
                                <span className="inline-flex items-center gap-1 text-gray-600">
                                  <i className="ri-history-line text-gray-400"></i>
                                  {item.last_downloaded_at
                                    ? `최근 ${formatDateTime(item.last_downloaded_at)}`
                                    : '다운로드 이력 없음'}
                                </span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>

              <div className="space-y-6">
                <section className="rounded-xl border border-gray-100 p-6">
                  <h4 className="text-lg font-semibold text-gray-900">고객 정보</h4>
                  <dl className="mt-4 space-y-4 text-sm text-gray-700">
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">고객명</dt>
                      <dd className="font-medium text-gray-900">{selectedOrder.profiles?.name ?? '이름 미확인'}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">이메일</dt>
                      <dd className="font-medium text-gray-900">{selectedOrder.profiles?.email ?? '-'}</dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-gray-500">회원 ID</dt>
                      <dd className="font-medium text-gray-900 break-all">{selectedOrder.user_id}</dd>
                    </div>
                  </dl>
                </section>

                <section
                  className={`rounded-xl border p-6 ${isBankTransfer ? 'border-amber-200 bg-amber-50' : 'border-gray-100'
                    }`}
                >
                  <h4 className="text-lg font-semibold text-gray-900">무통장입금 안내</h4>
                  {isBankTransfer ? (
                    <>
                      <p className="mt-2 text-sm text-amber-800">
                        페이액션 자동입금 확인 연동 시 고객이 입금하는 즉시 주문 상태가 &lsquo;입금 확인&rsquo;으로
                        업데이트되고 다운로드가 자동으로 활성화됩니다.
                      </p>
                      <ul className="mt-4 space-y-2 text-sm text-amber-900">
                        <li>· 현재 상태: {statusMeta.label}</li>
                        <li>· 자동 전환 흐름: 입금 확인 → 다운로드 가능</li>
                        <li>· 계좌/입금자 정보는 연동 완료 후 자동으로 노출됩니다.</li>
                      </ul>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-gray-600">
                      이 주문은 {paymentLabel}로 결제되었습니다. 무통장입금 자동 확인 설정은 '설정 &gt; 결제 정보'에서
                      관리할 수 있습니다.
                    </p>
                  )}
                </section>

                <section className="rounded-xl border border-blue-100 bg-blue-50 p-6">
                  <h4 className="text-lg font-semibold text-blue-900">다운로드 안내</h4>
                  <ul className="mt-4 space-y-2 text-sm text-blue-900">
                    <li>· 상태가 &lsquo;다운로드 가능&rsquo;이면 고객이 즉시 PDF를 내려받을 수 있습니다.</li>
                    <li>· 마이페이지 &gt; 주문내역에서 각 악보별 다운로드 현황을 확인하도록 연동 예정입니다.</li>
                    <li>· 다운로드 제한/로그 기능은 향후 업데이트 계획에 포함되어 있습니다.</li>
                  </ul>
                </section>

                {isBankTransfer && ['awaiting_deposit', 'pending'].includes(normalizedSelectedStatus) ? (
                  <section className="sticky top-4 rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-4 shadow-lg">
                    <h4 className="text-lg font-semibold text-amber-900">무통장입금 수동 확인</h4>

                    {/* 주문 요약 */}
                    <div className="rounded-lg border border-amber-300 bg-white/80 p-4 text-sm text-amber-900">
                      <div className="font-semibold text-amber-800 mb-2">주문 요약</div>
                      <div className="space-y-1">
                        <div>
                          <span className="font-medium">입금자명:</span>{' '}
                          <span className="text-amber-900 font-semibold">
                            {selectedOrder.depositor_name || selectedOrder.virtual_account_info?.expectedDepositor || '미지정'}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">금액:</span>{' '}
                          <span className="text-amber-900 font-semibold">
                            {formatCurrency(selectedOrder.total_amount)}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">주문번호:</span>{' '}
                          <span className="text-amber-900 font-semibold">
                            {displayOrderNumber}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedOrder.virtual_account_info ? (
                      <dl className="grid gap-2 rounded-lg border border-amber-200 bg-white/70 p-4 text-sm text-amber-900 sm:grid-cols-2">
                        <div>
                          <dt className="font-medium text-amber-800">은행</dt>
                          <dd>{selectedOrder.virtual_account_info.bankName ?? '-'}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-amber-800">계좌번호</dt>
                          <dd>{selectedOrder.virtual_account_info.accountNumber ?? '-'}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-amber-800">예금주</dt>
                          <dd>{selectedOrder.virtual_account_info.depositor ?? '-'}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-amber-800">입금금액</dt>
                          <dd>{formatCurrency(selectedOrder.virtual_account_info.amount ?? selectedOrder.total_amount)}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-amber-800">입금자명</dt>
                          <dd>
                            {selectedOrder.virtual_account_info.expectedDepositor ??
                              selectedOrder.depositor_name ??
                              '미지정'}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-amber-800">생성일</dt>
                          <dd>{formatDateTime(selectedOrder.created_at)}</dd>
                        </div>
                      </dl>
                    ) : null}

                    {/* 체크박스 및 확인 버튼 */}
                    <div className="space-y-3 pt-2 border-t border-amber-300">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={depositConfirmed}
                          onChange={(e) => setDepositConfirmed(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                        <span className="text-sm text-amber-900">
                          입금자명과 금액을 계좌 입금 내역과 대조했습니다.
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={handleConfirmBankDeposit}
                        disabled={orderActionLoading !== null || !depositConfirmed}
                        className="inline-flex w-full items-center justify-center rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {orderActionLoading === 'confirm' ? '입금 확인 중...' : '입금 확인 처리'}
                      </button>
                    </div>
                  </section>
                ) : null}

                <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 space-y-4">
                  <h4 className="text-lg font-semibold text-rose-900">관리자 작업</h4>
                  <p className="text-sm text-rose-700">
                    환불 여부를 선택해 주문을 정리할 수 있습니다. 환불 없이 취소하면 주문 상태가 &lsquo;취소됨&rsquo;으로
                    변경되고 악보 다운로드가 차단되며, 환불 처리 시 주문 상태가 &lsquo;환불 완료&rsquo;로 변경되고 고객
                    캐시가 복원됩니다.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleForceCompleteOrder}
                      disabled={orderActionLoading !== null || normalizedSelectedStatus === 'completed' || normalizedSelectedStatus === 'refunded'}
                      className="inline-flex flex-1 items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      강제 완료 처리
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteOrderWithoutRefund}
                      disabled={disableDelete}
                      className="inline-flex flex-1 items-center justify-center rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {orderActionLoading === 'delete'
                        ? '취소 처리 중...'
                        : normalizedSelectedStatus === 'refunded'
                          ? '환불 완료됨'
                          : normalizedSelectedStatus === 'cancelled'
                            ? '이미 취소됨'
                            : '환불 없이 취소'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRefundOrder}
                      disabled={disableRefund}
                      className="inline-flex flex-1 items-center justify-center rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {orderActionLoading === 'refund'
                        ? '환불 처리 중...'
                        : disableRefund
                          ? '환불 불가'
                          : '환불 후 취소'}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderOrderManagement = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">주문 관리</h2>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="space-y-4 border-b border-gray-100 px-6 py-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <i className="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="주문번호, 고객명, 이메일, 입금자명 검색..."
                value={orderSearchTerm}
                onChange={(event) => setOrderSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    // 검색 실행 (필터링은 자동으로 됨)
                  }
                }}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  // 검색 실행 (필터링은 자동으로 됨)
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <i className="ri-search-line text-base"></i>
              </button>
            </div>
            <div className="flex items-center gap-2">
              {selectedOrderIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => void handleBulkDeleteOrders()}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  <i className="ri-delete-bin-line text-base"></i>
                  선택 삭제 ({selectedOrderIds.size})
                </button>
              )}
              <button
                type="button"
                onClick={() => loadOrders()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <i className="ri-refresh-line text-base"></i>
                새로고침
              </button>
              <button
                type="button"
                onClick={handleExportOrders}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <i className="ri-download-2-line text-base"></i>
                엑셀 다운로드
              </button>
            </div>
          </div>

          {/* 상태별 필터 탭 */}
          <div className="flex flex-wrap gap-2 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setOrderStatusFilter('all')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${orderStatusFilter === 'all'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('pending')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${orderStatusFilter === 'pending'
                ? 'border-yellow-500 text-yellow-600 bg-yellow-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
            >
              결제 대기
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('awaiting_deposit')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${orderStatusFilter === 'awaiting_deposit'
                ? 'border-amber-500 text-amber-600 bg-amber-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
            >
              입금 확인 필요
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('completed')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${orderStatusFilter === 'completed'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
            >
              완료
            </button>
            <button
              type="button"
              onClick={() => setOrderStatusFilter('refunded')}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${orderStatusFilter === 'refunded'
                ? 'border-purple-500 text-purple-600 bg-purple-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
            >
              환불
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

            <select
              value={orderPaymentFilter}
              onChange={(event) => setOrderPaymentFilter(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">전체 결제수단</option>
              {orderPaymentOptions.map((option) => (
                <option key={option} value={option}>
                  {getPaymentMethodLabel(option)}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={orderStartDate}
              onChange={(event) => setOrderStartDate(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <input
              type="date"
              value={orderEndDate}
              onChange={(event) => setOrderEndDate(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <select
              value={orderSortKey}
              onChange={(event) => setOrderSortKey(event.target.value as OrderSortKey)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ORDER_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              총 {totalOrderCount.toLocaleString('ko-KR')}건 중{' '}
              <span className="font-semibold text-gray-700">
                {filteredOrderCount.toLocaleString('ko-KR')}건
              </span>{' '}
              표시 중
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearOrderFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <i className="ri-filter-off-line text-base"></i>
                필터 초기화
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrderSearchTerm('');
                  clearOrderFilters();
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
              >
                <i className="ri-eraser-line text-base"></i>
                검색 초기화
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={
                      sortedOrders.length > 0 &&
                      selectedOrderIds.size === sortedOrders.length
                    }
                    onChange={(e) => handleSelectAllOrders(e.target.checked)}
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">고객명</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">주문 타입</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">요약</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">금액</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">결제방법</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">주문일</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-500">
                    조건에 맞는 주문이 없습니다.
                  </td>
                </tr>
              ) : (
                sortedOrders.map((order) => {
                  const statusMeta = getOrderStatusMetaSafe(order.status);
                  const itemCount = order.order_items?.length ?? 0;
                  const paymentLabel = getPaymentMethodLabel(order.payment_method, order);
                  const expanded = isOrderExpanded(order.id);
                  const orderItems = order.order_items ?? [];
                  const isCash = order.order_type === 'cash';
                  const isProduct = order.order_type === 'product';
                  const orderSummary = getOrderSummary(order);

                  // 주문 타입 배지 스타일
                  const getOrderTypeBadge = () => {
                    if (isProduct) {
                      return (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                          악보 구매
                        </span>
                      );
                    }
                    if (isCash) {
                      return (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          캐쉬 충전
                        </span>
                      );
                    }
                    // 주문 타입 추가 - null인 경우 표시
                    return (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        알 수 없음
                      </span>
                    );
                  };

                  // 결제 대기 주문 여부 확인 (회색 처리용)
                  const isPendingPayment = order.payment_status === 'pending' && order.status !== 'completed';
                  const pendingRowClass = isPendingPayment ? 'opacity-50 bg-gray-50/60' : '';

                  // payment_note 추출 (payment_note 컬럼 또는 metadata.payment_notes)
                  const paymentNote = order.payment_note || (() => {
                    const notes = order.metadata?.payment_notes;
                    if (Array.isArray(notes) && notes.length > 0) {
                      const latest = notes[notes.length - 1];
                      return `[${latest.type}] ${latest.message}`;
                    }
                    return null;
                  })();

                  // payment_note 배지 스타일
                  const getPaymentNoteBadge = () => {
                    if (!paymentNote) return null;
                    let noteColor = 'bg-gray-100 text-gray-600';
                    if (paymentNote.includes('cancel') || paymentNote.includes('취소')) {
                      noteColor = 'bg-yellow-100 text-yellow-700';
                    } else if (paymentNote.includes('system_error') || paymentNote.includes('시스템')) {
                      noteColor = 'bg-red-100 text-red-700';
                    } else if (paymentNote.includes('error') || paymentNote.includes('에러') || paymentNote.includes('거절')) {
                      noteColor = 'bg-orange-100 text-orange-700';
                    }
                    // 짧게 요약
                    const shortNote = paymentNote.length > 30 ? paymentNote.slice(0, 30) + '...' : paymentNote;
                    return (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${noteColor} mt-1 max-w-[200px] truncate`}
                        title={paymentNote}
                      >
                        <i className="ri-error-warning-line mr-1 text-[10px]"></i>
                        {shortNote}
                      </span>
                    );
                  };

                  return (
                    <React.Fragment key={order.id}>
                      <tr
                        className={`cursor-pointer hover:bg-gray-50 transition-colors ${expanded ? 'bg-gray-50/80' : ''} ${pendingRowClass}`}
                        onClick={() => handleOpenOrderDetail(order)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={selectedOrderIds.has(order.id)}
                            onChange={() => handleSelectOrder(order.id)}
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusMeta.className}`}
                              title={statusMeta.description}
                            >
                              {statusMeta.label}
                            </span>
                            {getPaymentNoteBadge()}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{order.profiles?.name ?? '이름 미확인'}</div>
                            <div className="text-xs text-gray-500">{order.profiles?.email ?? '-'}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {getOrderTypeBadge()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="max-w-xs truncate" title={orderSummary}>
                            {orderSummary}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          ₩{order.total_amount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {paymentLabel}
                        </td>
                        <td
                          className="px-4 py-3 whitespace-nowrap text-sm text-gray-500"
                          title={formatDateTime(order.created_at)}
                        >
                          {formatDate(order.created_at)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenOrderDetail(order);
                            }}
                            className="text-blue-600 hover:text-blue-900 transition-colors"
                            title="상세 보기"
                          >
                            <i className="ri-eye-line w-4 h-4"></i>
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={9} className="px-6 pb-6 pt-4">
                            {isCash ? (
                              // 캐쉬 충전 주문 상세 정보
                              <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                                  <span>주문번호: {order.order_number ?? order.id.slice(0, 8).toUpperCase()}</span>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
                                  <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
                                      <i className="ri-wallet-3-line text-xl text-emerald-600"></i>
                                    </div>
                                    <div className="flex-1">
                                      <h3 className="text-lg font-semibold text-gray-900">캐쉬 충전 내역</h3>
                                      <div className="mt-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="text-sm text-gray-600">충전 금액</span>
                                          <span className="text-lg font-bold text-emerald-600">
                                            {formatCurrency(order.total_amount)}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                          <span className="text-sm text-gray-600">결제 방법</span>
                                          <span className="text-sm font-medium text-gray-900">{paymentLabel}</span>
                                        </div>
                                        {order.payment_confirmed_at && (
                                          <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-600">충전 완료일</span>
                                            <span className="text-sm text-gray-900">
                                              {formatDateTime(order.payment_confirmed_at)}
                                            </span>
                                          </div>
                                        )}
                                        {order.depositor_name && (
                                          <div className="flex items-center justify-between">
                                            <span className="text-sm text-gray-600">입금자명</span>
                                            <span className="text-sm text-gray-900">{order.depositor_name}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : isProduct ? (
                              // 악보 구매 주문 상세 정보
                              orderItems.length === 0 ? (
                                <p className="text-sm text-gray-500">구매한 악보가 없습니다.</p>
                              ) : (
                                <div className="space-y-4">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                                    <span>총 {orderItems.length.toLocaleString('ko-KR')}개 악보</span>
                                    <span>주문번호: {order.order_number ?? order.id.slice(0, 8).toUpperCase()}</span>
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    {orderItems.map((item) => {
                                      const sheetTitle = item.sheet_title ?? item.drum_sheets?.title ?? '제목 미확인';
                                      const sheetArtist = item.drum_sheets?.artist ?? '아티스트 정보 없음';
                                      const thumbnail = item.drum_sheets?.thumbnail_url ?? null;

                                      return (
                                        <div
                                          key={item.id}
                                          className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                                        >
                                          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                                            {thumbnail ? (
                                              <img src={thumbnail} alt={sheetTitle} className="h-full w-full object-cover" />
                                            ) : (
                                              <div className="flex h-full w-full items-center justify-center text-gray-400">
                                                <i className="ri-music-2-line text-lg"></i>
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{sheetTitle}</p>
                                            <p className="text-xs text-gray-500 truncate">{sheetArtist}</p>
                                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                              <span>가격 {formatCurrency(item.price)}</span>
                                              {item.created_at ? <span>구매일 {formatDate(item.created_at)}</span> : null}
                                              {item.sheet_id ? <span>ID {item.sheet_id}</span> : null}
                                              <span className="inline-flex items-center gap-1 text-gray-600">
                                                <i className="ri-download-2-line text-gray-400"></i>
                                                다운로드 {item.download_attempt_count ?? 0}회
                                              </span>
                                              <span className="inline-flex items-center gap-1 text-gray-600">
                                                <i className="ri-history-line text-gray-400"></i>
                                                {item.last_downloaded_at
                                                  ? `최근 ${formatDateTime(item.last_downloaded_at)}`
                                                  : '다운로드 이력 없음'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )
                            ) : (
                              // order_type이 null/undefined인 경우 기존 로직 유지
                              orderItems.length === 0 ? (
                                <p className="text-sm text-gray-500">구매한 악보가 없습니다.</p>
                              ) : (
                                <div className="space-y-4">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                                    <span>총 {orderItems.length.toLocaleString('ko-KR')}개 악보</span>
                                    <span>주문번호: {order.order_number ?? order.id.slice(0, 8).toUpperCase()}</span>
                                  </div>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    {orderItems.map((item) => {
                                      const sheetTitle = item.sheet_title ?? item.drum_sheets?.title ?? '제목 미확인';
                                      const sheetArtist = item.drum_sheets?.artist ?? '아티스트 정보 없음';
                                      const thumbnail = item.drum_sheets?.thumbnail_url ?? null;

                                      return (
                                        <div
                                          key={item.id}
                                          className="flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                                        >
                                          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                                            {thumbnail ? (
                                              <img src={thumbnail} alt={sheetTitle} className="h-full w-full object-cover" />
                                            ) : (
                                              <div className="flex h-full w-full items-center justify-center text-gray-400">
                                                <i className="ri-music-2-line text-lg"></i>
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 truncate">{sheetTitle}</p>
                                            <p className="text-xs text-gray-500 truncate">{sheetArtist}</p>
                                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                                              <span>가격 {formatCurrency(item.price)}</span>
                                              {item.created_at ? <span>구매일 {formatDate(item.created_at)}</span> : null}
                                              {item.sheet_id ? <span>ID {item.sheet_id}</span> : null}
                                              <span className="inline-flex items-center gap-1 text-gray-600">
                                                <i className="ri-download-2-line text-gray-400"></i>
                                                다운로드 {item.download_attempt_count ?? 0}회
                                              </span>
                                              <span className="inline-flex items-center gap-1 text-gray-600">
                                                <i className="ri-history-line text-gray-400"></i>
                                                {item.last_downloaded_at
                                                  ? `최근 ${formatDateTime(item.last_downloaded_at)}`
                                                  : '다운로드 이력 없음'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )
                            )}

                            {/* 결제 실패/취소 이력 표시 */}
                            {(() => {
                              const notes = order.metadata?.payment_notes;
                              if (!Array.isArray(notes) || notes.length === 0) return null;
                              return (
                                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                                  <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1">
                                    <i className="ri-error-warning-line"></i>
                                    결제 시도 이력 ({notes.length}건)
                                  </h4>
                                  <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {notes.map((n: any, idx: number) => {
                                      let typeLabel = '알 수 없음';
                                      let typeColor = 'text-gray-600';
                                      if (n.type === 'cancel') { typeLabel = '사용자 취소'; typeColor = 'text-yellow-700'; }
                                      else if (n.type === 'error') { typeLabel = '결제 에러'; typeColor = 'text-orange-700'; }
                                      else if (n.type === 'system_error') { typeLabel = '시스템 에러'; typeColor = 'text-red-700'; }
                                      return (
                                        <div key={idx} className="flex items-start gap-2 text-xs border-b border-amber-200 pb-1 last:border-0 last:pb-0">
                                          <span className={`font-medium ${typeColor} whitespace-nowrap`}>[{typeLabel}]</span>
                                          <span className="text-gray-700 flex-1">{n.message}</span>
                                          <span className="text-gray-400 whitespace-nowrap">{n.timestamp ? new Date(n.timestamp).toLocaleString('ko-KR') : ''}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {renderOrderDetailModal()}
    </div>
  );
  const renderCustomOrderManagement = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">맞춤 제작 주문 관리</h2>
          <p className="text-sm text-gray-500">
            고객 주문제작 신청을 확인하고 견적, 진행 상태, 완료 파일을 관리하세요.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input
              type="text"
              placeholder="곡명, 고객 이메일로 검색"
              value={customOrderSearchTerm}
              onChange={(event) => setCustomOrderSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-64"
            />
          </div>
          <select
            value={customOrderStatusFilter}
            onChange={(event) =>
              setCustomOrderStatusFilter(event.target.value as 'all' | CustomOrderStatus)
            }
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">전체 상태</option>
            {Object.entries(CUSTOM_ORDER_STATUS_META).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadCustomOrders()}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <i className="ri-refresh-line mr-1"></i>
            새로고침
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  곡 정보
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  신청자
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  견적 금액
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  상태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  최근 업데이트
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">
                    조건에 맞는 주문이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredCustomOrders.map((order) => {
                  const meta = CUSTOM_ORDER_STATUS_META[order.status] ?? CUSTOM_ORDER_STATUS_META.pending;
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-gray-900">{order.song_title}</p>
                          <p className="text-xs text-gray-500">{order.artist}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-900">
                            {order.profiles?.name ?? '이름 미확인'}
                          </p>
                          <p className="text-xs text-gray-500">{order.profiles?.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {typeof order.estimated_price === 'number'
                          ? `₩${order.estimated_price.toLocaleString('ko-KR')}`
                          : '견적 미정'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(order.updated_at ?? order.created_at).toLocaleString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          {/* [추가] 악보 등록 버튼 */}
                          {order.status === 'completed' && order.completed_pdf_url && (
                            <button
                              type="button"
                              onClick={() => handleRegisterCustomOrderAsSheet(order)}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700"
                              title="일반 악보로 등록"
                            >
                              <i className="ri-music-2-line text-sm"></i>
                              악보등록
                            </button>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomOrderId(order.id);
                              setIsCustomOrderModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            <i className="ri-chat-1-line text-sm"></i>
                            상세 보기
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCustomOrderModalOpen && selectedCustomOrderId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="relative h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <CustomOrderDetail
              orderId={selectedCustomOrderId}
              onClose={() => {
                setIsCustomOrderModalOpen(false);
                setSelectedCustomOrderId(null);
              }}
              onUpdated={() => loadCustomOrders()}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
  const renderEventDiscountManagement = () => {
    const activeCount = eventDiscounts.filter((item) => item.status === 'active').length;
    const scheduledCount = eventDiscounts.filter((item) => item.status === 'scheduled').length;
    const endedCount = eventDiscounts.filter((item) => item.status === 'ended').length;
    const totalCount = eventDiscounts.length;
    const discountPercent = calculateDiscountPercent(eventForm.original_price, DEFAULT_EVENT_PRICE);

    const formatDateTime = (value: string) =>
      new Date(value).toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

    const renderStatusBadge = (status: EventDiscountStatus) => {
      const meta = EVENT_STATUS_META[status];
      return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${meta.className}`}>
          {meta.label}
        </span>
      );
    };

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">이벤트 할인악보 관리</h2>
          <p className="text-gray-500">
            100원 특가 이벤트 악보를 등록하고 이벤트 기간과 활성 상태를 관리하세요. 등록된 악보는 이용자 화면의
            &lsquo;이벤트 할인악보&rsquo; 코너에 노출됩니다.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-green-100 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">진행 중</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{activeCount}</p>
          </div>
          <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">예정</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{scheduledCount}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">종료</p>
            <p className="text-2xl font-bold text-gray-700 mt-1">{endedCount}</p>
          </div>
          <div className="bg-white border border-orange-100 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">총 등록</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">{totalCount}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">등록된 이벤트 악보</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    이벤트 기간, 할인율, 활성 여부를 빠르게 확인하고 수정할 수 있습니다.
                  </p>
                </div>
                <button
                  onClick={() => loadEventDiscounts()}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                >
                  <i className="ri-refresh-line text-base"></i>
                  새로고침
                </button>
              </div>

              {isLoadingEventDiscounts ? (
                <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-500">
                  <i className="ri-loader-4-line w-8 h-8 animate-spin text-blue-600"></i>
                  <p>이벤트 악보를 불러오는 중입니다...</p>
                </div>
              ) : eventDiscounts.length === 0 ? (
                <div className="py-16 text-center text-gray-500">
                  아직 등록된 이벤트 할인 악보가 없습니다. 오른쪽 폼을 사용해 첫 이벤트를 등록해보세요.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {eventDiscounts.map((event) => {
                    const percent = calculateDiscountPercent(
                      event.original_price ?? DEFAULT_EVENT_PRICE,
                      event.discount_price ?? DEFAULT_EVENT_PRICE
                    );
                    return (
                      <li key={event.id} className="px-6 py-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                              {event.thumbnail_url ? (
                                <img
                                  src={event.thumbnail_url}
                                  alt={event.title || '이벤트 악보'}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <i className="ri-music-2-line text-2xl text-gray-400"></i>
                              )}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-lg font-semibold text-gray-900">{event.title}</h4>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                                  100원 특가
                                </span>
                                {renderStatusBadge(event.status)}
                                {editingEventId === event.id && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-600">
                                    편집 중
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500 mt-1">{event.artist}</p>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                                <span className="line-through text-gray-400">{formatCurrency(event.original_price)}</span>
                                <span className="text-lg font-bold text-red-600">
                                  {formatCurrency(event.discount_price)}
                                </span>
                                {percent > 0 && (
                                  <span className="px-2 py-0.5 text-xs font-semibold text-red-600 bg-red-50 rounded-full">
                                    {percent}% 할인
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-3">
                                {formatDateTime(event.event_start)} ~ {formatDateTime(event.event_end)}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end lg:gap-3">
                            <button
                              onClick={() => handleEditEventDiscount(event)}
                              className="px-3 py-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                            >
                              편집
                            </button>
                            <button
                              onClick={() => handleToggleEventDiscount(event)}
                              disabled={updatingEventId === event.id}
                              className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${event.is_active
                                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                                } ${updatingEventId === event.id ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                              {event.is_active ? '비활성화' : '활성화'}
                            </button>
                            <button
                              onClick={() => handleDeleteEventDiscount(event.id)}
                              disabled={deletingEventId === event.id}
                              className={`px-3 py-2 text-sm font-semibold text-red-600 hover:text-red-700 transition-colors ${deletingEventId === event.id ? 'opacity-60 cursor-not-allowed' : ''
                                }`}
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">이벤트 등록 / 수정</h3>
                    <p className="text-sm text-gray-500 mt-1">악보를 검색해 선택하고 이벤트 기간을 설정하세요.</p>
                  </div>
                  {editingEventId && (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">수정 중</span>
                  )}
                </div>
              </div>

              <div className="px-6 py-6 space-y-6">
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">이벤트 악보 검색</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={eventSearchTerm}
                      onChange={(e) => setEventSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          searchEventCandidateSheets();
                        }
                      }}
                      placeholder="악보 제목 또는 아티스트를 입력하세요."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={searchEventCandidateSheets}
                        disabled={isEventSearchLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isEventSearchLoading ? '검색 중...' : '검색'}
                      </button>
                      <button
                        onClick={resetEventFormState}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-semibold"
                      >
                        초기화
                      </button>
                    </div>
                  </div>

                  {eventSearchResults.length > 0 && (
                    <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
                      {eventSearchResults.map((sheet) => {
                        const alreadyRegistered = eventDiscounts.some((event) => event.sheet_id === sheet.id);
                        return (
                          <button
                            key={sheet.id}
                            onClick={() => handleSelectEventCandidate(sheet)}
                            className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors ${selectedEventSheet?.id === sheet.id ? 'bg-blue-50' : ''
                              }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-gray-900">{sheet.title}</p>
                                <p className="text-sm text-gray-500">{sheet.artist}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-gray-800">{formatCurrency(sheet.price)}</p>
                                {alreadyRegistered && (
                                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-600 mt-1">
                                    이미 등록됨
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedEventSheet ? (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-orange-700">선택된 악보</p>
                        <p className="text-lg font-bold text-gray-900">{selectedEventSheet.title}</p>
                        <p className="text-sm text-gray-600">{selectedEventSheet.artist}</p>
                      </div>
                      <button
                        onClick={clearSelectedEventSheet}
                        className="text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        선택 해제
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-gray-600">정가</span>
                      <span className="font-semibold text-gray-900">{formatCurrency(eventForm.original_price)}</span>
                      <span className="text-gray-400">{'→'}</span>
                      <span className="text-red-600 font-bold">{formatCurrency(DEFAULT_EVENT_PRICE)}</span>
                      {discountPercent > 0 && (
                        <span className="px-2 py-0.5 text-xs font-semibold text-red-600 bg-red-100 rounded-full">
                          {discountPercent}% 할인
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                    이벤트로 등록할 악보를 먼저 검색해 선택해주세요.
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">이벤트 기간</label>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-16">시작</span>
                        <input
                          type="datetime-local"
                          value={eventForm.event_start}
                          onChange={(e) => updateEventForm('event_start', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-16">종료</span>
                        <input
                          type="datetime-local"
                          value={eventForm.event_end}
                          onChange={(e) => updateEventForm('event_end', e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">이벤트 가격</label>
                    <div className="grid grid-cols-1 gap-2 text-sm text-gray-600">
                      <p>
                        정가{' '}
                        <span className="font-semibold text-gray-900">
                          {formatCurrency(eventForm.original_price)}
                        </span>{' '}
                        → 이벤트가{' '}
                        <span className="font-semibold text-red-600">
                          {formatCurrency(DEFAULT_EVENT_PRICE)}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        할인가는 100원으로 고정되며, 할인율은 정가 기준으로 자동 계산됩니다.
                      </p>
                    </div>
                  </div>

                  <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={eventForm.is_active}
                      onChange={(e) => updateEventForm('is_active', e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    이벤트를 즉시 활성화
                  </label>
                </div>

                <button
                  onClick={handleSaveEventDiscount}
                  disabled={isSavingEventDiscount}
                  className="w-full py-3 bg-red-500 text-white rounded-lg font-semibold text-sm hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingEventDiscount ? '저장 중...' : editingEventId ? '이벤트 수정하기' : '이벤트 등록하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  const renderSettings = () => {
    if (isLoadingSettings) {
      return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 px-6 py-8 text-gray-600">
            <i className="ri-loader-4-line h-6 w-6 animate-spin text-blue-600"></i>
            <span>설정을 불러오는 중입니다...</span>
          </div>
        </div>
      );
    }

    if (settingsError) {
      return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="px-6 py-8">
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
              <div className="flex items-start gap-3">
                <i className="ri-error-warning-line text-xl"></i>
                <div>
                  <p className="font-semibold">설정을 불러오는 중 오류가 발생했습니다.</p>
                  <p className="mt-1 text-sm">{settingsError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadSiteSettings}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <i className="ri-refresh-line"></i>
                다시 시도
              </button>
            </div>
          </div>
        </div>
      );
    }

    const activeConfig = SETTINGS_TAB_CONFIG[activeSettingsTab];

    const renderFooter = (key: SiteSettingKey) => {
      const meta = settingsMeta[key];
      return (
        <div className="flex flex-col gap-3 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            마지막 저장: {formatSettingsTimestamp(meta?.updatedAt ?? '')}
          </p>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            disabled={isSavingSettings}
          >
            {isSavingSettings ? '저장 중...' : '변경 사항 저장'}
          </button>
        </div>
      );
    };

    const renderTabContent = () => {
      switch (activeSettingsTab) {
        case 'general':
          return (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveSettings('general');
              }}
            >
              <div className="grid gap-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-site-name">
                      사이트 이름
                    </label>
                    <input
                      id="setting-site-name"
                      type="text"
                      value={siteSettings.general.siteName}
                      onChange={(event) => updateGeneralSetting('siteName', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="CopyDrum"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-contact-number">
                      연락처
                    </label>
                    <input
                      id="setting-contact-number"
                      type="text"
                      value={siteSettings.general.contactNumber}
                      onChange={(event) => updateGeneralSetting('contactNumber', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="010-0000-0000"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-contact-email">
                      고객 지원 이메일
                    </label>
                    <input
                      id="setting-contact-email"
                      type="email"
                      value={siteSettings.general.contactEmail}
                      onChange={(event) => updateGeneralSetting('contactEmail', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="copydrum@hanmail.net"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-address">
                      주소
                    </label>
                    <input
                      id="setting-address"
                      type="text"
                      value={siteSettings.general.address}
                      onChange={(event) => updateGeneralSetting('address', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="서울특별시"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="setting-about">
                    소개 문구
                  </label>
                  <textarea
                    id="setting-about"
                    rows={4}
                    value={siteSettings.general.about}
                    onChange={(event) => updateGeneralSetting('about', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="서비스 소개 문구를 입력하세요."
                  ></textarea>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="setting-business-hours">
                    운영 시간
                  </label>
                  <input
                    id="setting-business-hours"
                    type="text"
                    value={siteSettings.general.businessHours}
                    onChange={(event) => updateGeneralSetting('businessHours', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="평일 10:00-18:00 (점심 12:00-13:00)"
                  />
                  <p className="mt-1 text-xs text-gray-500">방문자에게 표시되는 기본 운영 시간을 입력하세요.</p>
                </div>
              </div>
              {renderFooter('general')}
            </form>
          );
        case 'payment':
          return (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveSettings('payment');
              }}
            >
              <div className="grid gap-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-bank-name">
                      은행명
                    </label>
                    <input
                      id="setting-bank-name"
                      type="text"
                      value={siteSettings.payment.bankName}
                      onChange={(event) => updatePaymentSetting('bankName', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="국민은행"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-account-number">
                      계좌번호
                    </label>
                    <input
                      id="setting-account-number"
                      type="text"
                      value={siteSettings.payment.accountNumber}
                      onChange={(event) => updatePaymentSetting('accountNumber', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="000000-00-000000"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-account-holder">
                      예금주
                    </label>
                    <input
                      id="setting-account-holder"
                      type="text"
                      value={siteSettings.payment.accountHolder}
                      onChange={(event) => updatePaymentSetting('accountHolder', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="홍길동"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="setting-payment-guide">
                    결제 안내 문구
                  </label>
                  <textarea
                    id="setting-payment-guide"
                    rows={5}
                    value={siteSettings.payment.paymentGuide}
                    onChange={(event) => updatePaymentSetting('paymentGuide', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    placeholder="입금 안내 문구를 입력하세요."
                  ></textarea>
                  <p className="mt-1 text-xs text-gray-500">고객에게 안내되는 결제 방법 및 주의사항을 작성합니다.</p>
                </div>
              </div>
              {renderFooter('payment')}
            </form>
          );
        case 'event':
          return (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveSettings('event');
              }}
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="setting-event-discount-rate">
                    기본 할인율 (%)
                  </label>
                  <input
                    id="setting-event-discount-rate"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={siteSettings.event.defaultDiscountRate}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      const safe = Number.isNaN(value) ? 0 : Math.min(100, Math.max(0, value));
                      updateEventSetting('defaultDiscountRate', safe);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <p className="mt-1 text-xs text-gray-500">새 이벤트 생성 시 기본으로 적용되는 할인율입니다.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="setting-event-duration">
                    기본 이벤트 기간 (일)
                  </label>
                  <input
                    id="setting-event-duration"
                    type="number"
                    min={1}
                    value={siteSettings.event.defaultDurationDays}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      const safe = Number.isNaN(value) ? 1 : Math.max(1, value);
                      updateEventSetting('defaultDurationDays', safe);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <p className="mt-1 text-xs text-gray-500">이벤트 시작일 기준 기본 종료일까지의 기간입니다.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="setting-event-min-price">
                    최소 할인 가격 (₩)
                  </label>
                  <input
                    id="setting-event-min-price"
                    type="number"
                    min={0}
                    value={siteSettings.event.minPrice}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      const safe = Number.isNaN(value) ? 0 : Math.max(0, value);
                      updateEventSetting('minPrice', safe);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <p className="mt-1 text-xs text-gray-500">할인 적용 시 허용되는 최솟값입니다.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="setting-event-max-price">
                    최대 할인 가격 (₩)
                  </label>
                  <input
                    id="setting-event-max-price"
                    type="number"
                    min={0}
                    value={siteSettings.event.maxPrice}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      const safe = Number.isNaN(value) ? 0 : Math.max(0, value);
                      updateEventSetting('maxPrice', safe);
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <p className="mt-1 text-xs text-gray-500">할인 적용 시 허용되는 최대값입니다.</p>
                </div>
              </div>
              {renderFooter('event')}
            </form>
          );
        case 'system':
          return (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveSettings('system');
              }}
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">유지보수 모드</p>
                    <p className="text-xs text-gray-500">활성화 시 방문자에게 점검 안내 메시지를 표시합니다.</p>
                  </div>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={siteSettings.system.maintenanceMode}
                      onChange={(event) => updateSystemSetting('maintenanceMode', event.target.checked)}
                    />
                  </label>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-max-upload">
                      첨부 파일 최대 용량 (MB)
                    </label>
                    <input
                      id="setting-max-upload"
                      type="number"
                      min={1}
                      value={siteSettings.system.maxUploadSizeMB}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        const safe = Number.isNaN(value) ? 1 : Math.max(1, value);
                        updateSystemSetting('maxUploadSizeMB', safe);
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <p className="mt-1 text-xs text-gray-500">맞춤 제작 요청 등 파일 업로드 허용 용량입니다.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-items-per-page">
                      페이지당 항목 수
                    </label>
                    <input
                      id="setting-items-per-page"
                      type="number"
                      min={1}
                      value={siteSettings.system.itemsPerPage}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        const safe = Number.isNaN(value) ? 1 : Math.max(1, value);
                        updateSystemSetting('itemsPerPage', safe);
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <p className="mt-1 text-xs text-gray-500">목록 화면에서 기본으로 보여줄 항목 개수입니다.</p>
                  </div>
                </div>
              </div>
              {renderFooter('system')}
            </form>
          );
        case 'notification':
          return (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveSettings('notification');
              }}
            >
              <div className="space-y-4">
                <label className="inline-flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={siteSettings.notification.orderNotification}
                    onChange={(event) => updateNotificationSetting('orderNotification', event.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">일반 주문 알림</p>
                    <p className="text-xs text-gray-500">새로운 일반 주문이 접수되면 알림을 받습니다.</p>
                  </div>
                </label>
                <label className="inline-flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={siteSettings.notification.customOrderNotification}
                    onChange={(event) => updateNotificationSetting('customOrderNotification', event.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">맞춤 제작 알림</p>
                    <p className="text-xs text-gray-500">맞춤 제작 요청이 생성되거나 상태가 변경되면 알림을 받습니다.</p>
                  </div>
                </label>
                <label className="inline-flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={siteSettings.notification.inquiryNotification}
                    onChange={(event) => updateNotificationSetting('inquiryNotification', event.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">상담/문의 알림</p>
                    <p className="text-xs text-gray-500">새로운 1:1 문의가 접수되면 알림을 받습니다.</p>
                  </div>
                </label>
                <label className="inline-flex items-start gap-3 rounded-lg border border-gray-200 px-4 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={siteSettings.notification.newsletterSubscription}
                    onChange={(event) => updateNotificationSetting('newsletterSubscription', event.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">뉴스레터 발송 동의</p>
                    <p className="text-xs text-gray-500">이메일 뉴스레터 및 주요 공지 발송에 동의합니다.</p>
                  </div>
                </label>
              </div>
              {renderFooter('notification')}
            </form>
          );
        case 'translation':
          return (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSaveSettings('translation');
              }}
            >
              <div className="grid gap-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-default-language">
                      기본 언어
                    </label>
                    <select
                      id="setting-default-language"
                      value={siteSettings.translation.defaultLanguage}
                      onChange={(event) => updateTranslationSetting('defaultLanguage', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      {Object.entries(languages).map(([code, name]) => (
                        <option key={code} value={code}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700" htmlFor="setting-available-languages">
                      지원 언어
                    </label>
                    <select
                      id="setting-available-languages"
                      multiple
                      value={siteSettings.translation.availableLanguages}
                      onChange={(event) => {
                        const selectedOptions = Array.from(event.target.selectedOptions, (option) => option.value);
                        updateTranslationSetting('availableLanguages', selectedOptions);
                      }}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      {Object.entries(languages).map(([code, name]) => (
                        <option key={code} value={code}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {renderFooter('translation')}
            </form>
          );
        default:
          return null;
      }
    };

    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="border-b border-gray-100 px-6 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">사이트 설정</h2>
                <p className="text-sm text-gray-500">서비스 운영 전반에 필요한 설정을 관리하세요.</p>
              </div>
              <button
                type="button"
                onClick={loadSiteSettings}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <i className="ri-refresh-line"></i>
                전체 새로고침
              </button>
            </div>
          </div>
          <div className="flex flex-col lg:flex-row">
            <div className="lg:min-w-[240px] lg:border-r lg:border-gray-100">
              <nav className="flex overflow-x-auto border-b border-gray-100 lg:flex-col lg:border-b-0">
                {SETTINGS_TABS.map((tab) => {
                  const config = SETTINGS_TAB_CONFIG[tab];
                  const isActive = activeSettingsTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveSettingsTab(tab)}
                      className={`flex-1 min-w-[160px] border-b border-gray-100 px-4 py-3 text-sm font-medium transition-colors last:border-b-0 lg:min-w-full lg:border-b-0 ${isActive
                        ? 'bg-blue-50 text-blue-700 lg:border-l-4 lg:border-blue-500'
                        : 'text-gray-600 hover:bg-gray-50 lg:border-l-4 lg:border-transparent'
                        }`}
                    >
                      <div className="flex items-center justify-center gap-2 lg:justify-start">
                        <i className={`${config.icon} text-base`}></i>
                        <span>{config.label}</span>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="flex-1">
              <div className="border-b border-gray-100 px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
                    <i className={`${activeConfig.icon} text-xl`}></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{activeConfig.label}</h3>
                    <p className="mt-1 text-sm text-gray-500">{activeConfig.description}</p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-6">{renderTabContent()}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  const renderAnalytics = () => {
    const periodOptions: { value: AnalyticsPeriod; label: string }[] = [
      { value: 'today', label: '오늘' },
      { value: '7d', label: '최근 7일' },
      { value: '30d', label: '최근 30일' },
      { value: '365d', label: '최근 1년' },
      { value: 'all', label: '전체 기간' },
    ];

    const formatGrowthText = (value: number | null | undefined) =>
      value != null && Number.isFinite(value) ? formatPercentChange(value) : '-';

    const growthBadgeClass = (value: number | null | undefined) => {
      if (value == null || !Number.isFinite(value)) {
        return 'bg-gray-100 text-gray-500';
      }
      return getChangeBadgeClassName(value);
    };

    const getCustomOrderStatusLabel = (status: string) =>
      CUSTOM_ORDER_STATUS_META[status as CustomOrderStatus]?.label ?? status;

    const pieColors = [
      '#2563eb',
      '#22c55e',
      '#f97316',
      '#a855f7',
      '#f43f5e',
      '#0ea5e9',
      '#6366f1',
      '#14b8a6',
      '#ef4444',
      '#78350f',
    ];

    const statusColorMap: Record<string, string> = {
      pending: '#f59e0b',
      quoted: '#38bdf8',
      payment_confirmed: '#22c55e',
      in_progress: '#6366f1',
      completed: '#9333ea',
      cancelled: '#ef4444',
    };

    const isInitialLoading = analyticsLoading && !analyticsData;
    const hasData = Boolean(analyticsData);

    const revenueData = analyticsData?.revenueTrend ?? [];
    const popularData = analyticsData?.popularSheets ?? [];
    const categoryData = analyticsData?.categoryBreakdown ?? [];
    const customStatusData = analyticsData?.customOrder.statusDistribution ?? [];
    const newUsersData = analyticsData?.newUsersTrend ?? [];

    const kpiItems = analyticsData
      ? [
        {
          title: '총 매출',
          value: formatCurrency(analyticsData.summary.totalRevenue),
          change: analyticsData.summary.revenueGrowth,
          caption: '완료된 주문 기준',
          icon: 'ri-coins-line',
          iconWrapperClass: 'bg-amber-100 text-amber-600',
        },
        {
          title: '총 주문 수',
          value: analyticsData.summary.totalOrders.toLocaleString('ko-KR'),
          change: analyticsData.summary.orderGrowth,
          caption: '기간 내 완료된 주문',
          icon: 'ri-shopping-bag-3-line',
          iconWrapperClass: 'bg-blue-100 text-blue-600',
        },
        {
          title: '총 회원 수',
          value: analyticsData.summary.totalCustomers.toLocaleString('ko-KR'),
          change: analyticsData.summary.customerGrowth,
          caption: '신규 회원 증감률',
          icon: 'ri-user-3-line',
          iconWrapperClass: 'bg-sky-100 text-sky-600',
        },
        {
          title: '평균 주문 금액',
          value: formatCurrency(analyticsData.summary.averageOrderValue),
          change: analyticsData.summary.averageOrderGrowth,
          caption: '주문당 평균 매출',
          icon: 'ri-line-chart-line',
          iconWrapperClass: 'bg-emerald-100 text-emerald-600',
        },
      ]
      : [];

    const isExportDisabled = !analyticsData || analyticsLoading || analyticsExporting;

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleAnalyticsPeriodChange(option.value)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${analyticsPeriod === option.value
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                disabled={analyticsLoading && analyticsPeriod === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleAnalyticsRefresh}
              className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              disabled={analyticsLoading}
            >
              <i className="ri-refresh-line mr-2"></i>
              새로고침
            </button>
            <button
              type="button"
              onClick={() => void handleAnalyticsExport()}
              className="inline-flex items-center rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
              disabled={isExportDisabled}
            >
              <i className="ri-download-2-line mr-2"></i>
              {analyticsExporting ? '내보내는 중...' : 'Excel 내보내기'}
            </button>
          </div>
        </div>

        {analyticsError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">데이터를 불러오는 중 오류가 발생했습니다.</p>
                <p className="mt-1 text-rose-600">{analyticsError}</p>
              </div>
              <button
                type="button"
                onClick={handleAnalyticsRefresh}
                className="inline-flex items-center rounded-lg border border-rose-400 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
              >
                <i className="ri-refresh-line mr-2"></i>
                다시 시도
              </button>
            </div>
          </div>
        )}

        {isInitialLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-gray-200 bg-white">
            <div className="text-center text-gray-500">
              <i className="ri-loader-4-line animate-spin text-2xl"></i>
              <p className="mt-2 text-sm">데이터를 불러오는 중입니다...</p>
            </div>
          </div>
        ) : hasData ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              {kpiItems.map((item) => (
                <div key={item.title} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-gray-500">{item.title}</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{item.value}</p>
                    </div>
                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${item.iconWrapperClass}`}>
                      <i className={`${item.icon} text-xl`}></i>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${growthBadgeClass(
                        item.change,
                      )}`}
                    >
                      {formatGrowthText(item.change)}
                    </span>
                    <span className="text-xs text-gray-500">{item.caption}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">매출 추이</h3>
                    <p className="text-sm text-gray-500">기간 내 매출 흐름</p>
                  </div>
                </div>
                <div className="mt-6 h-[300px]">
                  {revenueData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(value: number) => `₩${value.toLocaleString('ko-KR')}`} />
                        <Tooltip
                          formatter={(value: number, name: string) => {
                            if (name === 'revenue') {
                              return [`₩${value.toLocaleString('ko-KR')}`, '매출'];
                            }
                            if (name === 'orders') {
                              return [`${value.toLocaleString('ko-KR')}건`, '주문 수'];
                            }
                            return value;
                          }}
                        />
                        <Line type="monotone" dataKey="revenue" name="매출" stroke="#2563eb" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      표시할 데이터가 없습니다.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">주문 추이</h3>
                    <p className="text-sm text-gray-500">기간 내 주문 수 변화</p>
                  </div>
                </div>
                <div className="mt-6 h-[300px]">
                  {revenueData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(value: number) => `${value.toLocaleString('ko-KR')}건`} />
                        <Tooltip formatter={(value: number) => [`${value.toLocaleString('ko-KR')}건`, '주문 수']} />
                        <Area type="monotone" dataKey="orders" name="주문 수" stroke="#22c55e" fill="#bbf7d0" fillOpacity={0.6} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      표시할 데이터가 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">인기 악보 Top 10</h3>
                    <p className="text-sm text-gray-500">주문 수 기준 상위 악보</p>
                  </div>
                </div>
                <div className="h-[320px]">
                  {popularData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={popularData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="title"
                          tickFormatter={(value: string) => (value.length > 8 ? `${value.slice(0, 8)}…` : value)}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis tickFormatter={(value: number) => `${value.toLocaleString('ko-KR')}건`} />
                        <Tooltip
                          formatter={(value: number, name: string) =>
                            name === 'orders'
                              ? [`${value.toLocaleString('ko-KR')}건`, '주문 수']
                              : [`₩${value.toLocaleString('ko-KR')}`, '매출']
                          }
                        />
                        <Legend />
                        <Bar dataKey="orders" name="주문 수" fill="#2563eb" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="revenue" name="매출" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      표시할 데이터가 없습니다.
                    </div>
                  )}
                </div>
                <div className="mt-6 divide-y divide-gray-100 rounded-lg border border-gray-100">
                  {popularData.slice(0, 5).map((sheet, index) => (
                    <div key={sheet.sheetId} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {index + 1}. {sheet.title}
                        </p>
                        <p className="text-xs text-gray-500">{sheet.artist}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <p>주문 {sheet.orders.toLocaleString('ko-KR')}건</p>
                        <p className="text-gray-600">매출 {formatCurrency(sheet.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">카테고리별 판매 비중</h3>
                    <p className="text-sm text-gray-500">매출 기준 분포</p>
                  </div>
                </div>
                <div className="h-[320px]">
                  {categoryData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          dataKey="revenue"
                          nameKey="categoryName"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={4}
                        >
                          {categoryData.map((entry, index) => (
                            <Cell
                              key={entry.categoryId ?? `category-${index}`}
                              fill={pieColors[index % pieColors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `₩${value.toLocaleString('ko-KR')}`} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      표시할 데이터가 없습니다.
                    </div>
                  )}
                </div>
                <div className="mt-6 space-y-3">
                  {categoryData.map((category, index) => (
                    <div
                      key={category.categoryId ?? `category-${index}`}
                      className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: pieColors[index % pieColors.length] }}
                        ></span>
                        <span className="font-medium text-gray-900">{category.categoryName}</span>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        <p>매출 {formatCurrency(category.revenue)}</p>
                        <p>주문 {category.orders.toLocaleString('ko-KR')}건</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 월별 매출 섹션 */}
            {(() => {
              const selectedYearData = monthlyRevenueData.find((d) => d.year === monthlyRevenueYear);
              const minYear = monthlyRevenueData.length > 0 ? monthlyRevenueData[0].year : monthlyRevenueYear;
              const maxYear = monthlyRevenueData.length > 0 ? monthlyRevenueData[monthlyRevenueData.length - 1].year : monthlyRevenueYear;
              return (
                <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">월별 매출</h3>
                      <p className="text-sm text-gray-500">연도별 월 매출 현황</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
                        <button
                          type="button"
                          onClick={() => setMonthlyRevenueYear((prev) => prev - 1)}
                          disabled={monthlyRevenueYear <= minYear}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-white hover:shadow-sm disabled:text-gray-300 disabled:hover:bg-transparent disabled:hover:shadow-none transition"
                        >
                          <i className="ri-arrow-left-s-line text-lg"></i>
                        </button>
                        <span className="min-w-[72px] text-center text-sm font-bold text-gray-900">{monthlyRevenueYear}년</span>
                        <button
                          type="button"
                          onClick={() => setMonthlyRevenueYear((prev) => prev + 1)}
                          disabled={monthlyRevenueYear >= maxYear}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-white hover:shadow-sm disabled:text-gray-300 disabled:hover:bg-transparent disabled:hover:shadow-none transition"
                        >
                          <i className="ri-arrow-right-s-line text-lg"></i>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadMonthlyRevenue()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                        disabled={monthlyRevenueLoading}
                      >
                        <i className={`ri-refresh-line ${monthlyRevenueLoading ? 'animate-spin' : ''}`}></i>
                        새로고침
                      </button>
                    </div>
                  </div>
                  {monthlyRevenueLoading ? (
                    <div className="flex h-40 items-center justify-center">
                      <div className="text-center text-gray-500">
                        <i className="ri-loader-4-line animate-spin text-2xl"></i>
                        <p className="mt-2 text-sm">월별 매출 데이터를 불러오는 중...</p>
                      </div>
                    </div>
                  ) : !selectedYearData ? (
                    <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                      {monthlyRevenueYear}년 데이터가 없습니다.
                    </div>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">월</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">주문 수</th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">매출액</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedYearData.months.map((m) => {
                            const now = new Date();
                            const isFuture = m.year > now.getFullYear() || (m.year === now.getFullYear() && m.month > now.getMonth() + 1);
                            const isCurrent = m.year === now.getFullYear() && m.month === now.getMonth() + 1;
                            return (
                              <tr
                                key={m.month}
                                className={`${isCurrent ? 'bg-blue-50' : isFuture ? 'bg-gray-50/50 text-gray-400' : 'hover:bg-gray-50'}`}
                              >
                                <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                                  {m.month}월
                                  {isCurrent && <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">진행중</span>}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right text-gray-700">
                                  {isFuture ? '-' : `${m.orderCount.toLocaleString('ko-KR')}건`}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-right font-medium text-gray-900">
                                  {isFuture ? '-' : formatCurrency(m.revenue)}
                                </td>
                              </tr>
                            );
                          })}
                          <tr className="bg-blue-50 font-semibold border-t-2 border-blue-200">
                            <td className="px-4 py-3 whitespace-nowrap text-gray-900">{selectedYearData.year}년 합계</td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900">
                              {selectedYearData.yearOrderCount.toLocaleString('ko-KR')}건
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right text-gray-900">
                              {formatCurrency(selectedYearData.yearTotal)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ═══════════════ 드럼레슨 무료악보 분석 ═══════════════ */}
            <div className="rounded-xl border border-purple-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <i className="ri-music-2-line text-purple-600"></i>
                    드럼레슨 무료악보 분석
                  </h3>
                  <p className="text-sm text-gray-500">무료 악보 다운로드 현황 및 유입 기여도</p>
                </div>
                <div className="flex items-center gap-2">
                  {(['7d', '30d', '90d'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDrumLessonAnalyticsPeriod(p)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        drumLessonAnalyticsPeriod === p
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {p === '7d' ? '7일' : p === '30d' ? '30일' : '90일'}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => loadDrumLessonAnalytics(drumLessonAnalyticsPeriod)}
                    disabled={drumLessonAnalyticsLoading}
                    className="ml-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    <i className={`ri-refresh-line ${drumLessonAnalyticsLoading ? 'animate-spin' : ''}`}></i>
                  </button>
                </div>
              </div>

              {drumLessonAnalyticsLoading && !drumLessonAnalytics ? (
                <div className="flex h-40 items-center justify-center">
                  <div className="text-center text-gray-500">
                    <i className="ri-loader-4-line animate-spin text-2xl"></i>
                    <p className="mt-2 text-sm">분석 데이터를 불러오는 중...</p>
                  </div>
                </div>
              ) : !drumLessonAnalytics ? (
                <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                  <div className="text-center">
                    <i className="ri-database-2-line text-4xl text-gray-300 mb-2"></i>
                    <p>아직 다운로드 데이터가 없습니다.</p>
                    <p className="text-xs text-gray-400 mt-1">무료 악보가 다운로드되면 여기에 분석 데이터가 표시됩니다.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* KPI 카드 */}
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-gray-100 bg-gradient-to-br from-purple-50 to-white p-4">
                      <p className="text-xs text-gray-500">총 다운로드</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{drumLessonAnalytics.kpi.totalDownloads.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gradient-to-br from-blue-50 to-white p-4">
                      <p className="text-xs text-gray-500">오늘</p>
                      <p className="mt-1 text-2xl font-bold text-blue-600">{drumLessonAnalytics.kpi.todayDownloads.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gradient-to-br from-green-50 to-white p-4">
                      <p className="text-xs text-gray-500">최근 7일</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{drumLessonAnalytics.kpi.weekDownloads.toLocaleString()}</p>
                      {drumLessonAnalytics.kpi.weekGrowth !== null && (
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          drumLessonAnalytics.kpi.weekGrowth >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {drumLessonAnalytics.kpi.weekGrowth >= 0 ? '▲' : '▼'} {Math.abs(Math.round(drumLessonAnalytics.kpi.weekGrowth))}%
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gradient-to-br from-orange-50 to-white p-4">
                      <p className="text-xs text-gray-500">최근 30일</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">{drumLessonAnalytics.kpi.monthDownloads.toLocaleString()}</p>
                      {drumLessonAnalytics.kpi.monthGrowth !== null && (
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          drumLessonAnalytics.kpi.monthGrowth >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {drumLessonAnalytics.kpi.monthGrowth >= 0 ? '▲' : '▼'} {Math.abs(Math.round(drumLessonAnalytics.kpi.monthGrowth))}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 다운로드 추이 차트 */}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <h4 className="mb-3 text-sm font-semibold text-gray-700">📈 다운로드 추이</h4>
                    <div className="h-[240px]">
                      {drumLessonAnalytics.downloadTrend.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={drumLessonAnalytics.downloadTrend}>
                            <defs>
                              <linearGradient id="dlGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={drumLessonAnalyticsPeriod === '7d' ? 0 : drumLessonAnalyticsPeriod === '30d' ? 4 : 13} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip formatter={(value: number) => [`${value}건`, '다운로드']} />
                            <Area type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} fill="url(#dlGradient)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400">
                          데이터가 없습니다.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 2열: 인기 악보 + 다운로드 소스 */}
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {/* 인기 무료 악보 TOP 10 */}
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                      <h4 className="mb-3 text-sm font-semibold text-gray-700">🏆 인기 무료 악보 TOP 10</h4>
                      {drumLessonAnalytics.popularSheets.length > 0 ? (
                        <div className="max-h-[320px] overflow-y-auto">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-gray-50">
                              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                                <th className="pb-2 pr-2">#</th>
                                <th className="pb-2 pr-2">곡명</th>
                                <th className="pb-2 pr-2">아티스트</th>
                                <th className="pb-2 text-right">다운로드</th>
                                <th className="pb-2 text-right">유저 수</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drumLessonAnalytics.popularSheets.map((sheet, idx) => (
                                <tr key={sheet.sheetId} className="border-b border-gray-100 last:border-0">
                                  <td className="py-2 pr-2 text-gray-400 font-medium">{idx + 1}</td>
                                  <td className="py-2 pr-2">
                                    <div className="font-medium text-gray-900 truncate max-w-[140px]">{sheet.title}</div>
                                    {sheet.subCategories.filter(c => c !== '드럼레슨').length > 0 && (
                                      <div className="flex gap-1 mt-0.5">
                                        {sheet.subCategories.filter(c => c !== '드럼레슨').map(cat => (
                                          <span key={cat} className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">{cat}</span>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 pr-2 text-gray-600 truncate max-w-[100px]">{sheet.artist}</td>
                                  <td className="py-2 text-right font-semibold text-purple-600">{sheet.downloadCount.toLocaleString()}</td>
                                  <td className="py-2 text-right text-gray-500">{sheet.uniqueUsers.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
                          데이터가 없습니다.
                        </div>
                      )}
                    </div>

                    {/* 다운로드 소스별 & 서브카테고리별 분포 */}
                    <div className="space-y-4">
                      {/* 다운로드 소스별 분포 */}
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                        <h4 className="mb-3 text-sm font-semibold text-gray-700">📊 다운로드 경로 분석</h4>
                        {drumLessonAnalytics.sourceBreakdown.length > 0 ? (
                          <div className="space-y-2">
                            {drumLessonAnalytics.sourceBreakdown.map((src) => (
                              <div key={src.source} className="flex items-center gap-3">
                                <div className="w-24 text-xs text-gray-600 truncate">{src.label}</div>
                                <div className="flex-1 h-5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all"
                                    style={{ width: `${Math.max(src.percentage, 2)}%` }}
                                  ></div>
                                </div>
                                <div className="w-16 text-right text-xs font-medium text-gray-700">
                                  {src.count}건 ({src.percentage}%)
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-20 items-center justify-center text-sm text-gray-400">
                            데이터가 없습니다.
                          </div>
                        )}
                      </div>

                      {/* 서브카테고리별 분포 */}
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                        <h4 className="mb-3 text-sm font-semibold text-gray-700">📂 서브카테고리별 다운로드</h4>
                        {drumLessonAnalytics.subCategoryBreakdown.length > 0 ? (
                          <div className="space-y-2">
                            {drumLessonAnalytics.subCategoryBreakdown.map((cat) => (
                              <div key={cat.name} className="flex items-center gap-3">
                                <div className="w-20 text-xs text-gray-600 truncate">{cat.name}</div>
                                <div className="flex-1 h-5 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full transition-all"
                                    style={{ width: `${Math.max(cat.percentage, 2)}%` }}
                                  ></div>
                                </div>
                                <div className="w-16 text-right text-xs font-medium text-gray-700">
                                  {cat.count}건 ({cat.percentage}%)
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-20 items-center justify-center text-sm text-gray-400">
                            데이터가 없습니다.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 유료 전환 분석 */}
                  <div className="rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-5">
                    <h4 className="mb-4 text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <i className="ri-exchange-funds-line text-green-600"></i>
                      무료 → 유료 전환 분석
                    </h4>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="text-center">
                        <p className="text-xs text-gray-500">무료 다운로드 회원</p>
                        <p className="mt-1 text-xl font-bold text-gray-900">
                          {drumLessonAnalytics.conversion.totalFreeDownloadUsers.toLocaleString()}명
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500">유료 구매 전환</p>
                        <p className="mt-1 text-xl font-bold text-green-600">
                          {drumLessonAnalytics.conversion.convertedUsers.toLocaleString()}명
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500">전환율</p>
                        <p className="mt-1 text-xl font-bold" style={{ color: drumLessonAnalytics.conversion.conversionRate > 0 ? '#16a34a' : '#9ca3af' }}>
                          {drumLessonAnalytics.conversion.conversionRate}%
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-500">비회원 다운로드</p>
                        <p className="mt-1 text-xl font-bold text-gray-600">
                          {drumLessonAnalytics.conversion.totalFreeDownloadsAnonymous.toLocaleString()}건
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-lg bg-white/60 p-3">
                      <p className="text-xs text-gray-600">
                        💡 <strong>전환율 해석:</strong> 무료 악보를 다운로드한 회원 중 유료 악보를 구매한 비율입니다.
                        {drumLessonAnalytics.conversion.conversionRate > 10
                          ? ' 전환율이 높습니다! 무료 악보가 유료 구매에 큰 기여를 하고 있습니다.'
                          : drumLessonAnalytics.conversion.conversionRate > 0
                            ? ' 전환이 발생하고 있습니다. 더 많은 무료 악보를 통해 전환율을 높일 수 있습니다.'
                            : ' 아직 전환 데이터가 충분하지 않습니다. 다운로드가 쌓이면 분석이 가능합니다.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">커스텀 주문 현황</h3>
                    <p className="text-sm text-gray-500">상태별 분포와 평균 견적</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">총 요청</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">
                      {analyticsData.customOrder.metrics.totalCount.toLocaleString('ko-KR')}건
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">진행 중</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">
                      {analyticsData.customOrder.metrics.activeCount.toLocaleString('ko-KR')}건
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <p className="text-xs text-gray-500">평균 견적 금액</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">
                      {formatCurrency(analyticsData.customOrder.metrics.averageEstimatedPrice)}
                    </p>
                  </div>
                </div>
                <div className="mt-6 h-[280px]">
                  {customStatusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={customStatusData} dataKey="count" nameKey="status" innerRadius={60} outerRadius={100} paddingAngle={4}>
                          {customStatusData.map((entry, index) => (
                            <Cell
                              key={entry.status}
                              fill={statusColorMap[entry.status] ?? pieColors[index % pieColors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `${value.toLocaleString('ko-KR')}건`} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      표시할 데이터가 없습니다.
                    </div>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {customStatusData.map((entry) => (
                    <div
                      key={entry.status}
                      className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3 text-sm"
                    >
                      <span className="font-medium text-gray-700">
                        {getCustomOrderStatusLabel(entry.status)}
                      </span>
                      <span className="font-semibold text-gray-900">
                        {entry.count.toLocaleString('ko-KR')}건
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">신규 회원 추이</h3>
                    <p className="text-sm text-gray-500">기간 내 가입한 회원 수</p>
                  </div>
                </div>
                <div className="h-[320px]">
                  {newUsersData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={newUsersData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(value: number) => `${value.toLocaleString('ko-KR')}명`} />
                        <Tooltip formatter={(value: number) => [`${value.toLocaleString('ko-KR')}명`, '신규 회원']} />
                        <Line type="monotone" dataKey="count" name="신규 회원" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500">
                      표시할 데이터가 없습니다.
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-gray-500">
            아직 집계된 데이터가 없습니다.
          </div>
        )}
      </div>
    );
  };
  const renderCopyrightReport = () => {
    const totalPurchases = copyrightReportData.reduce(
      (sum, row) => sum + row.purchaseCount,
      0,
    );
    const totalRevenue = copyrightReportData.reduce((sum, row) => sum + row.revenue, 0);
    const totalDirectSalesAmount = directSalesData.reduce(
      (sum, order) => sum + (Number.isFinite(order.totalAmount) ? order.totalAmount : 0),
      0,
    );
    const totalCashChargeAmount = cashChargeData.reduce(
      (sum, transaction) => sum + (Number.isFinite(transaction.amount) ? transaction.amount : 0),
      0,
    );
    const totalCashBonusAmount = cashChargeData.reduce(
      (sum, transaction) => sum + (Number.isFinite(transaction.bonusAmount) ? transaction.bonusAmount : 0),
      0,
    );
    const totalCashIssued = cashChargeData.reduce(
      (sum, transaction) => sum + (Number.isFinite(transaction.totalCredit) ? transaction.totalCredit : 0),
      0,
    );
    const hasPurchaseData = copyrightReportData.length > 0;
    const hasDirectSalesData = directSalesData.length > 0;
    const hasCashChargeData = cashChargeData.length > 0;
    const hasAnyExcelData = hasPurchaseData || hasDirectSalesData || hasCashChargeData;
    const isTableEmpty = !copyrightReportLoading && !hasPurchaseData;

    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">시작일</label>
              <input
                type="date"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={copyrightStartDate}
                onChange={(event) => handleCopyrightStartDateChange(event.target.value)}
                max={copyrightEndDate}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">종료일</label>
              <input
                type="date"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                value={copyrightEndDate}
                onChange={(event) => handleCopyrightEndDateChange(event.target.value)}
                min={copyrightStartDate}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {COPYRIGHT_QUICK_RANGES.map((range) => (
              <button
                key={range.key}
                type="button"
                onClick={() => handleSelectCopyrightQuickRange(range.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${copyrightQuickRange === range.key
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                disabled={copyrightReportLoading}
              >
                {range.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCopyrightSearch}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:bg-blue-300"
              disabled={copyrightReportLoading}
            >
              <i className="ri-search-line mr-2"></i>
              자료 조회
            </button>
            <button
              type="button"
              onClick={() => void handleIntegratedCopyrightExport()}
              className="inline-flex items-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
              disabled={copyrightReportLoading || !hasAnyExcelData}
            >
              <i className="ri-file-excel-2-line mr-2"></i>
              통합 Excel 다운로드
            </button>
            <button
              type="button"
              onClick={() => void handleCopyrightExport()}
              className="inline-flex items-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
              disabled={copyrightReportLoading || !hasPurchaseData}
            >
              <i className="ri-download-2-line mr-2"></i>
              Excel 다운로드
            </button>
            {copyrightReportLoading && (
              <span className="inline-flex items-center text-sm text-gray-500">
                <i className="ri-loader-4-line mr-2 animate-spin"></i>
                데이터를 불러오는 중입니다...
              </span>
            )}
          </div>

          {copyrightReportError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {copyrightReportError}
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">총 구매 수</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {totalPurchases.toLocaleString('ko-KR')}건
            </div>
            <p className="mt-1 text-xs text-gray-500">
              선택한 기간 동안 판매된 악보의 총 구매 수입니다.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">직접 결제 매출</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {formatCurrency(Math.round(totalDirectSalesAmount))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              카드·무통장입금·카카오페이로 결제된 주문 금액 합계입니다.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">캐시 충전 금액 (유상)</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {formatCurrency(Math.round(totalCashChargeAmount))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              고객이 실제 결제한 캐시 충전 금액 합계입니다. (보너스 제외)
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">캐시 실결제 금액</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">
              {formatCurrency(Math.round(totalCashChargeAmount))}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              캐시 충전 시 결제된 금액입니다. 보너스 지급: {formatCurrency(Math.round(totalCashBonusAmount))} · 총 지급 캐시:
              {formatCurrency(Math.round(totalCashIssued))}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            {copyrightReportLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                <i className="ri-loader-4-line mr-2 animate-spin"></i>
                데이터를 불러오는 중입니다...
              </div>
            ) : isTableEmpty ? (
              <div className="flex h-48 flex-col items-center justify-center text-sm text-gray-500">
                <i className="ri-information-line mb-2 text-xl"></i>
                선택한 기간에 해당하는 판매 데이터가 없습니다.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      SONG ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      작품명
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      가수명
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      앨범명
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      장르
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      구매 수
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                      매출액
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {copyrightReportData.map((row) => (
                    <tr key={row.songId}>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900">{row.songId}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">{row.title || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{row.artist || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.albumName || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.categoryName || '-'}</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        {row.purchaseCount.toLocaleString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-blue-700">
                        {formatCurrency(Math.round(row.revenue))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">직접 결제 매출</h3>
              <p className="text-sm text-gray-500">
                카드·무통장입금·카카오페이로 결제된 주문 내역입니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleDirectSalesExport()}
              className="inline-flex items-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
              disabled={copyrightReportLoading || directSalesData.length === 0}
            >
              <i className="ri-download-2-line mr-2"></i>
              Excel 다운로드
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              {copyrightReportLoading ? (
                <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                  <i className="ri-loader-4-line mr-2 animate-spin"></i>
                  데이터를 불러오는 중입니다...
                </div>
              ) : directSalesData.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                  선택한 기간의 직접 결제 매출 데이터가 없습니다.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        주문번호
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        주문일시
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        결제수단
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        주문금액
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        악보 수량
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        고객 이메일
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {directSalesData.map((order) => (
                      <tr key={order.orderId}>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                          {order.orderNumber ?? order.orderId}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(order.orderedAt)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{order.paymentMethodLabel}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                          {formatCurrency(order.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700">
                          {order.itemCount.toLocaleString('ko-KR')}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{order.customerEmail ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">캐시 충전 내역 (유상)</h3>
              <p className="text-sm text-gray-500">
                고객이 결제한 캐시 충전 내역과 보너스 지급 정보를 확인할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCashChargeExport()}
              className="inline-flex items-center rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400"
              disabled={copyrightReportLoading || cashChargeData.length === 0}
            >
              <i className="ri-download-2-line mr-2"></i>
              Excel 다운로드
            </button>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              {copyrightReportLoading ? (
                <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                  <i className="ri-loader-4-line mr-2 animate-spin"></i>
                  데이터를 불러오는 중입니다...
                </div>
              ) : cashChargeData.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                  선택한 기간의 캐시 충전 데이터가 없습니다.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        충전일시
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        고객 이메일
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        유상 금액
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        보너스 금액
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        총 지급 캐시
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        결제수단
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {cashChargeData.map((transaction) => (
                      <tr key={transaction.id}>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatDateTime(transaction.chargedAt)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{transaction.userEmail ?? '-'}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                          {formatCurrency(transaction.amount)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-700">
                          {formatCurrency(transaction.bonusAmount)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                          {formatCurrency(transaction.totalCredit)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div>{transaction.paymentLabel}</div>
                          {transaction.description ? (
                            <div className="text-xs text-gray-500">{transaction.description}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 인기곡 순위 관리 상태
  const [popularitySelectedGenre, setPopularitySelectedGenre] = useState<string>('');
  const [popularityRanks, setPopularityRanks] = useState<Map<number, DrumSheet | null>>(new Map());
  const [popularitySearchTerm, setPopularitySearchTerm] = useState('');
  const [popularitySearchResults, setPopularitySearchResults] = useState<DrumSheet[]>([]);
  const [popularitySearchLoading, setPopularitySearchLoading] = useState(false);
  const [popularitySearchModalOpen, setPopularitySearchModalOpen] = useState(false);
  const [popularitySearchTargetRank, setPopularitySearchTargetRank] = useState<number | null>(null);
  const [popularitySaving, setPopularitySaving] = useState(false);
  const [popularityHasChanges, setPopularityHasChanges] = useState(false);
  const [popularityOriginalRanks, setPopularityOriginalRanks] = useState<Map<number, DrumSheet | null>>(new Map());

  // 인기곡 순위 관리: 카테고리 목록 로드
  useEffect(() => {
    if (activeMenu !== 'popularity') return;

    // categories가 비어있으면 로드
    if (categories.length === 0) {
      loadCategories();
    } else if (!popularitySelectedGenre && categories.length > 0) {
      // categories가 있지만 선택된 장르가 없으면 첫 번째 장르 선택
      setPopularitySelectedGenre(categories[0].id);
    }
  }, [activeMenu, categories, popularitySelectedGenre]);

  // 인기곡 순위 관리: 선택된 장르의 순위 로드
  useEffect(() => {
    if (activeMenu !== 'popularity' || !popularitySelectedGenre) return;

    const loadPopularityRanks = async () => {
      try {
        const ranksMap = new Map<number, DrumSheet | null>();
        // 1-10위 초기화
        for (let i = 1; i <= 10; i++) {
          ranksMap.set(i, null);
        }

        // 1. 먼저 drum_sheet_categories에서 순위 로드 (최신 방식)
        const { data: categoryRanks, error: categoryError } = await supabase
          .from('drum_sheet_categories')
          .select(`
            popularity_rank,
            sheet:drum_sheets (
              id,
              title,
              artist,
              thumbnail_url,
              category_id
            )
          `)
          .eq('category_id', popularitySelectedGenre)
          .not('popularity_rank', 'is', null)
          .order('popularity_rank', { ascending: true });

        if (categoryError) {
          console.warn('drum_sheet_categories 로드 실패:', categoryError);
        } else if (categoryRanks && categoryRanks.length > 0) {
          // drum_sheet_categories에서 데이터가 있으면 사용
          categoryRanks.forEach((row: any) => {
            const rank = row.popularity_rank;
            const sheet = row.sheet;
            if (rank && sheet && rank >= 1 && rank <= 10) {
              ranksMap.set(rank, sheet as DrumSheet);
            }
          });
        } else {
          // 2. drum_sheet_categories에 데이터가 없으면 drum_sheets.popularity_rank를 fallback으로 사용
          const { data: sheetRanks, error: sheetError } = await supabase
            .from('drum_sheets')
            .select('id, title, artist, thumbnail_url, category_id, popularity_rank')
            .eq('category_id', popularitySelectedGenre)
            .eq('is_active', true)
            .not('popularity_rank', 'is', null)
            .gte('popularity_rank', 1)
            .lte('popularity_rank', 10)
            .order('popularity_rank', { ascending: true });

          if (sheetError) {
            console.warn('drum_sheets.popularity_rank 로드 실패:', sheetError);
          } else if (sheetRanks && sheetRanks.length > 0) {
            // 기존 데이터를 drum_sheet_categories로 마이그레이션
            sheetRanks.forEach((sheet: any) => {
              const rank = sheet.popularity_rank;
              if (rank && rank >= 1 && rank <= 10) {
                ranksMap.set(rank, sheet as DrumSheet);
                
                // drum_sheet_categories에 자동 마이그레이션 (백그라운드)
                supabase
                  .from('drum_sheet_categories')
                  .upsert({
                    sheet_id: sheet.id,
                    category_id: popularitySelectedGenre,
                    popularity_rank: rank,
                  }, { onConflict: 'sheet_id,category_id' })
                  .then(({ error: migrateError }) => {
                    if (migrateError) {
                      console.warn('자동 마이그레이션 실패:', migrateError);
                    }
                  });
              }
            });
          }
        }

        setPopularityRanks(ranksMap);
        setPopularityOriginalRanks(new Map(ranksMap));
        setPopularityHasChanges(false);
      } catch (error) {
        console.error('순위 로드 실패:', error);
        alert('순위를 불러오는데 실패했습니다.');
      }
    };

    loadPopularityRanks();
  }, [activeMenu, popularitySelectedGenre]);

  const renderPopularityManagement = () => {

    // 장르 목록 가져오기
    const genreOrder = ['가요', '팝', '락', 'CCM', '트로트/성인가요', '재즈', 'J-POP', 'OST', '드럼솔로', '드럼커버'];
    const sortedCategories = categories.length > 0 
      ? [...categories].sort((a, b) => {
          const indexA = genreOrder.indexOf(a.name);
          const indexB = genreOrder.indexOf(b.name);
          if (indexA === -1 && indexB === -1) return 0;
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        })
      : [];

    // 악보 검색
    const handleSearchSheets = async (searchTerm: string) => {
      if (!searchTerm.trim() || !popularitySelectedGenre) {
        setPopularitySearchResults([]);
        return;
      }

      setPopularitySearchLoading(true);
      try {
        // 1. 기본 category_id로 검색
        const { data: basicResults, error: basicError } = await supabase
          .from('drum_sheets')
          .select('id, title, artist, thumbnail_url, category_id')
          .eq('category_id', popularitySelectedGenre)
          .eq('is_active', true)
          .or(`title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`)
          .limit(20);

        if (basicError) throw basicError;

        // 2. drum_sheet_categories를 통한 추가 카테고리 검색
        const { data: categoryRelations, error: relationError } = await supabase
          .from('drum_sheet_categories')
          .select(`
            sheet_id,
            sheet:drum_sheets (
              id,
              title,
              artist,
              thumbnail_url,
              category_id
            )
          `)
          .eq('category_id', popularitySelectedGenre);

        if (relationError) {
          console.warn('추가 카테고리 검색 실패:', relationError);
        }

        // 3. 결과 병합 및 중복 제거
        const resultMap = new Map<string, any>();
        
        // 기본 결과 추가
        if (basicResults) {
          basicResults.forEach(sheet => {
            resultMap.set(sheet.id, sheet);
          });
        }

        // 추가 카테고리 결과 추가 (검색어 필터링)
        if (categoryRelations) {
          categoryRelations.forEach((relation: any) => {
            const sheet = relation.sheet;
            if (sheet && !resultMap.has(sheet.id)) {
              const searchLower = searchTerm.toLowerCase();
              const titleMatch = sheet.title?.toLowerCase().includes(searchLower);
              const artistMatch = sheet.artist?.toLowerCase().includes(searchLower);
              
              if (titleMatch || artistMatch) {
                resultMap.set(sheet.id, sheet);
              }
            }
          });
        }

        const mergedResults = Array.from(resultMap.values()).slice(0, 20);
        setPopularitySearchResults(mergedResults);
      } catch (error) {
        console.error('악보 검색 실패:', error);
        alert('악보 검색에 실패했습니다.');
      } finally {
        setPopularitySearchLoading(false);
      }
    };

    // 순위에 악보 배정
    const handleAssignSheet = (rank: number, sheet: DrumSheet) => {
      // 중복 체크: 같은 악보가 다른 순위에 있는지 확인
      const newRanks = new Map(popularityRanks);
      let hasDuplicate = false;
      
      newRanks.forEach((existingSheet, existingRank) => {
        if (existingSheet && existingSheet.id === sheet.id && existingRank !== rank) {
          hasDuplicate = true;
        }
      });

      if (hasDuplicate) {
        if (!confirm(`이 악보는 이미 다른 순위에 배정되어 있습니다. 기존 순위를 제거하고 ${rank}위로 이동하시겠습니까?`)) {
          return;
        }
        // 기존 순위에서 제거
        newRanks.forEach((existingSheet, existingRank) => {
          if (existingSheet && existingSheet.id === sheet.id) {
            newRanks.set(existingRank, null);
          }
        });
      }

      // 새 순위에 배정
      newRanks.set(rank, sheet);
      setPopularityRanks(newRanks);
      setPopularityHasChanges(true);
      setPopularitySearchModalOpen(false);
      setPopularitySearchTerm('');
    };

    // 순위에서 악보 제거
    const handleRemoveSheet = (rank: number) => {
      if (!confirm(`${rank}위의 악보를 제거하시겠습니까?`)) {
        return;
      }

      const newRanks = new Map(popularityRanks);
      newRanks.set(rank, null);
      setPopularityRanks(newRanks);
      setPopularityHasChanges(true);
    };

    // 순위 위로 이동 (1위는 위로 이동 불가)
    const handleMoveUp = (rank: number) => {
      if (rank <= 1) return;

      const newRanks = new Map(popularityRanks);
      const currentSheet: DrumSheet | null = newRanks.get(rank) ?? null;
      const upperSheet: DrumSheet | null = newRanks.get(rank - 1) ?? null;

      // 위 순위와 교체
      newRanks.set(rank - 1, currentSheet);
      newRanks.set(rank, upperSheet);
      setPopularityRanks(newRanks);
      setPopularityHasChanges(true);
    };

    // 순위 아래로 이동 (10위는 아래로 이동 불가)
    const handleMoveDown = (rank: number) => {
      if (rank >= 10) return;

      const newRanks = new Map(popularityRanks);
      const currentSheet: DrumSheet | null = newRanks.get(rank) ?? null;
      const lowerSheet: DrumSheet | null = newRanks.get(rank + 1) ?? null;

      // 아래 순위와 교체
      newRanks.set(rank + 1, currentSheet);
      newRanks.set(rank, lowerSheet);
      setPopularityRanks(newRanks);
      setPopularityHasChanges(true);
    };

    // 순위 저장
    const handleSaveRanks = async () => {
      if (!popularitySelectedGenre) return;

      setPopularitySaving(true);
      try {
        // 1) 선택된 장르의 기존 순위 초기화 (drum_sheet_categories)
        const { error: clearError } = await supabase
          .from('drum_sheet_categories')
          .update({ popularity_rank: null })
          .eq('category_id', popularitySelectedGenre);

        if (clearError) throw clearError;

        // 2) drum_sheets.popularity_rank도 초기화 (선택된 장르의 기본 category_id를 가진 악보들)
        const sheetIds: string[] = [];
        popularityRanks.forEach((sheet) => {
          if (sheet) {
            sheetIds.push(sheet.id);
          }
        });

        if (sheetIds.length > 0) {
          // 선택된 장르의 기본 category_id를 가진 악보들의 popularity_rank 초기화
          const { error: clearSheetsError } = await supabase
            .from('drum_sheets')
            .update({ popularity_rank: null })
            .eq('category_id', popularitySelectedGenre);

          if (clearSheetsError) {
            console.warn('drum_sheets.popularity_rank 초기화 실패:', clearSheetsError);
          }
        }

        // 3) 새 순위 배정 (drum_sheet_categories에 upsert)
        const updates: Array<{ sheet_id: string; category_id: string; popularity_rank: number }> = [];
        popularityRanks.forEach((sheet, rank) => {
          if (sheet) {
            updates.push({
              sheet_id: sheet.id,
              category_id: popularitySelectedGenre,
              popularity_rank: rank,
            });
          }
        });

        if (updates.length > 0) {
          const { error: upsertError } = await supabase
            .from('drum_sheet_categories')
            .upsert(updates, { onConflict: 'sheet_id,category_id' });

          if (upsertError) throw upsertError;

          // 4) drum_sheets.popularity_rank도 동기화 (기본 category_id가 선택된 장르인 경우만)
          const sheetUpdates = updates
            .filter(update => {
              // 해당 악보의 기본 category_id가 선택된 장르와 일치하는지 확인
              const sheet = Array.from(popularityRanks.values()).find(s => s?.id === update.sheet_id);
              return sheet && (sheet as any).category_id === popularitySelectedGenre;
            })
            .map(update => ({
              id: update.sheet_id,
              popularity_rank: update.popularity_rank,
            }));

          if (sheetUpdates.length > 0) {
            // 배치 업데이트
            const updatePromises = sheetUpdates.map(update =>
              supabase
                .from('drum_sheets')
                .update({ popularity_rank: update.popularity_rank })
                .eq('id', update.id)
            );

            const updateResults = await Promise.all(updatePromises);
            const updateErrors = updateResults.filter(result => result.error);
            if (updateErrors.length > 0) {
              console.warn('drum_sheets.popularity_rank 동기화 일부 실패:', updateErrors);
            }
          }
        }

        setPopularityOriginalRanks(new Map(popularityRanks));
        setPopularityHasChanges(false);
        alert('순위가 저장되었습니다.');
      } catch (error) {
        console.error('순위 저장 실패:', error);
        alert('순위 저장에 실패했습니다.');
      } finally {
        setPopularitySaving(false);
      }
    };

    // 초기화
    const handleResetRanks = () => {
      if (!popularityHasChanges) return;
      if (!confirm('변경사항을 취소하고 마지막 저장 상태로 되돌리시겠습니까?')) {
        return;
      }

      setPopularityRanks(new Map(popularityOriginalRanks));
      setPopularityHasChanges(false);
    };

    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">인기곡 순위 관리</h2>
          <p className="text-gray-500">
            장르별로 인기곡 순위를 1-10위까지 지정할 수 있습니다. 지정된 순위는 메인 페이지의 인기곡 섹션에 표시됩니다.
          </p>
        </div>

        {/* 장르 탭 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          {sortedCategories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sortedCategories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => {
                    setPopularitySelectedGenre(category.id);
                    setPopularityHasChanges(false);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    popularitySelectedGenre === category.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-gray-500">
              <i className="ri-loader-4-line animate-spin text-2xl mb-2 block"></i>
              <p>장르 목록을 불러오는 중...</p>
            </div>
          )}
        </div>

        {/* 저장/초기화 버튼 */}
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            {popularityHasChanges && (
              <span className="text-sm text-orange-600 font-medium">변경사항이 있습니다</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetRanks}
              disabled={!popularityHasChanges || popularitySaving}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                popularityHasChanges && !popularitySaving
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'
              }`}
            >
              초기화
            </button>
            <button
              onClick={handleSaveRanks}
              disabled={!popularityHasChanges || popularitySaving}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                popularityHasChanges && !popularitySaving
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-gray-300 cursor-not-allowed'
              }`}
            >
              {popularitySaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        {/* 순위 관리 영역 */}
        {popularitySelectedGenre && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((rank) => {
              const sheet = popularityRanks.get(rank);
              return (
                <div
                  key={rank}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-gray-900">{rank}위</span>
                    <div className="flex items-center gap-1">
                      {/* 위로 이동 버튼 */}
                      {sheet && rank > 1 && (
                        <button
                          onClick={() => handleMoveUp(rank)}
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          title="위로 이동"
                        >
                          <i className="ri-arrow-up-line text-lg"></i>
                        </button>
                      )}
                      {/* 아래로 이동 버튼 */}
                      {sheet && rank < 10 && (
                        <button
                          onClick={() => handleMoveDown(rank)}
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          title="아래로 이동"
                        >
                          <i className="ri-arrow-down-line text-lg"></i>
                        </button>
                      )}
                      {/* 제거 버튼 */}
                      {sheet && (
                        <button
                          onClick={() => handleRemoveSheet(rank)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                          title="순위 제거"
                        >
                          <i className="ri-close-line text-xl"></i>
                        </button>
                      )}
                    </div>
                  </div>

                  {sheet ? (
                    <div className="space-y-2">
                      {sheet.thumbnail_url ? (
                        <img
                          src={sheet.thumbnail_url}
                          alt={sheet.title}
                          className="w-full aspect-square object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center">
                          <i className="ri-music-line text-4xl text-gray-400"></i>
                        </div>
                      )}
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-gray-900 truncate" title={sheet.title}>
                          {sheet.title}
                        </p>
                        <p className="text-xs text-gray-500 truncate" title={sheet.artist}>
                          {sheet.artist}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setPopularitySearchTargetRank(rank);
                          setPopularitySearchModalOpen(true);
                        }}
                        className="w-full px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        변경
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setPopularitySearchTargetRank(rank);
                        setPopularitySearchModalOpen(true);
                      }}
                      className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      <i className="ri-add-line text-2xl mb-2 block"></i>
                      <span className="text-sm">악보 검색</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 악보 검색 모달 */}
        {popularitySearchModalOpen && popularitySearchTargetRank && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {popularitySearchTargetRank}위 악보 검색
                </h3>
                <button
                  onClick={() => {
                    setPopularitySearchModalOpen(false);
                    setPopularitySearchTerm('');
                    setPopularitySearchResults([]);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="p-4 border-b border-gray-200">
                <input
                  type="text"
                  value={popularitySearchTerm}
                  onChange={(e) => {
                    setPopularitySearchTerm(e.target.value);
                    handleSearchSheets(e.target.value);
                  }}
                  placeholder="제목 또는 아티스트로 검색..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {popularitySearchLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <i className="ri-loader-4-line animate-spin text-2xl text-blue-600"></i>
                  </div>
                ) : popularitySearchResults.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {popularitySearchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleAssignSheet(popularitySearchTargetRank!, result)}
                        className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                      >
                        {result.thumbnail_url ? (
                          <img
                            src={result.thumbnail_url}
                            alt={result.title}
                            className="w-16 h-16 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center">
                            <i className="ri-music-line text-2xl text-gray-400"></i>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{result.title}</p>
                          <p className="text-xs text-gray-500 truncate">{result.artist}</p>
                        </div>
                        <i className="ri-arrow-right-line text-gray-400"></i>
                      </button>
                    ))}
                  </div>
                ) : popularitySearchTerm ? (
                  <div className="text-center py-8 text-gray-500">
                    검색 결과가 없습니다.
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    검색어를 입력하세요.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMarketing = () => {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">마케팅 자동화 관리</h2>
          <p className="text-gray-500">
            티스토리, 핀터레스트 등 외부 플랫폼에 악보 미리보기를 자동으로 포스팅합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="lg:col-span-2">
            <MarketingStatus />
          </div>
          <div className="lg:col-span-2">
            <MarketingSettings onSettingsChange={() => { }} />
          </div>
        </div>
      </div>
    );
  };

  const renderMainContent = () => {
    switch (activeMenu) {
      case 'dashboard':
        return renderDashboard();
      case 'sheets':
        return renderSheetManagement();
      case 'categories':
        return renderCategoryManagement();
      case 'collections':
        return renderCollectionManagement();
      case 'event-discounts':
        return renderEventDiscountManagement();
      case 'member-list':
        return renderMemberManagement();
      case 'orders':
        return renderOrderManagement();
      case 'inquiries':
        return renderInquiryManagement();
      case 'custom-orders':
        return renderCustomOrderManagement();
      case 'points':
        return renderCashManagement();
      case 'analytics':
        return renderAnalytics();
      case 'copyright-report':
        return renderCopyrightReport();
      case 'settings':
        return renderSettings();
      case 'marketing':
        return renderMarketing();
      case 'drum-lessons':
        return <DrumLessonManagement />;
      case 'popularity':
        return renderPopularityManagement();
      default:
        return renderDashboard();
    }
  };

  if (loading || !authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <i className="ri-loader-4-line w-8 h-8 animate-spin text-blue-600 mx-auto mb-4"></i>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">접근 권한이 없습니다.</p>
        </div>
      </div>
    );
  }

  const handleMenuClick = (menu: string) => {
    setActiveMenu(menu);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 모바일 오버레이 */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 사이드바 */}
      <div className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col transform transition-transform duration-300 ease-in-out md:transform-none ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}>
        <div className="p-4 md:p-6 border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-lg md:text-xl font-bold text-gray-900">관리자 패널</h1>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden flex items-center justify-center h-8 w-8 rounded-full hover:bg-gray-100 text-gray-500"
            aria-label="메뉴 닫기"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <nav className="flex-1 p-3 md:p-4 space-y-2 overflow-y-auto">
          <button
            onClick={() => handleMenuClick('dashboard')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'dashboard' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-home-line w-5 h-5"></i>
            <span className="text-sm md:text-base">대시보드</span>
          </button>

          <button
            onClick={() => handleMenuClick('member-list')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'member-list' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-user-line w-5 h-5"></i>
            <span className="text-sm md:text-base">회원 관리</span>
          </button>

          <button
            onClick={() => handleMenuClick('sheets')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'sheets' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-music-line w-5 h-5"></i>
            <span className="text-sm md:text-base">악보 관리</span>
          </button>

          <button
            onClick={() => handleMenuClick('drum-lessons')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'drum-lessons' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-play-circle-line w-5 h-5"></i>
            <span className="text-sm md:text-base">드럼레슨 관리</span>
          </button>

          <button
            onClick={() => handleMenuClick('categories')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'categories' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-folder-open-line w-5 h-5"></i>
            <span className="text-sm md:text-base">카테고리 관리</span>
          </button>

          <button
            onClick={() => handleMenuClick('collections')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'collections' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-bookmark-line w-5 h-5"></i>
            <span className="text-sm md:text-base">악보모음집 관리</span>
          </button>

          <button
            onClick={() => handleMenuClick('event-discounts')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'event-discounts' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-fire-line w-5 h-5"></i>
            <span className="text-sm md:text-base">이벤트 할인악보</span>
          </button>

          <button
            onClick={() => handleMenuClick('orders')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'orders' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-shopping-cart-line w-5 h-5"></i>
            <span className="text-sm md:text-base">주문 관리</span>
          </button>

          <button
            onClick={() => handleMenuClick('inquiries')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'inquiries' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <span className="flex items-center gap-3">
              <i className="ri-customer-service-2-line w-5 h-5"></i>
              <span className="text-sm md:text-base">문의 관리</span>
            </span>
            {pendingInquiryCount > 0 && (
              <span className="inline-flex min-w-[20px] justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                {pendingInquiryCount > 99 ? '99+' : pendingInquiryCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleMenuClick('custom-orders')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'custom-orders' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <span className="flex items-center gap-3">
              <i className="ri-clipboard-line w-5 h-5"></i>
              <span className="text-sm md:text-base">주문 제작 관리</span>
            </span>
            {pendingCustomOrderCount > 0 && (
              <span className="inline-flex min-w-[20px] justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                {pendingCustomOrderCount > 99 ? '99+' : pendingCustomOrderCount}
              </span>
            )}
          </button>

          <button
            onClick={() => handleMenuClick('points')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'points' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-star-line w-5 h-5"></i>
            <span className="text-sm md:text-base">적립금 관리</span>
          </button>

          <button
            onClick={() => handleMenuClick('copyright-report')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'copyright-report'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-file-chart-line w-5 h-5"></i>
            <span className="text-sm md:text-base">저작권 보고</span>
          </button>

          <button
            onClick={() => handleMenuClick('analytics')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'analytics' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-bar-chart-line w-5 h-5"></i>
            <span className="text-sm md:text-base">분석</span>
          </button>

          <button
            onClick={() => handleMenuClick('settings')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'settings' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-settings-line w-5 h-5"></i>
            <span className="text-sm md:text-base">설정</span>
          </button>

          <button
            onClick={() => handleMenuClick('marketing')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'marketing' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-share-forward-line w-5 h-5"></i>
            <span className="text-sm md:text-base">마케팅 자동화</span>
          </button>

          <button
            onClick={() => handleMenuClick('popularity')}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${activeMenu === 'popularity' ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
              }`}
          >
            <i className="ri-trophy-line w-5 h-5"></i>
            <span className="text-sm md:text-base">인기곡 순위 관리</span>
          </button>
        </nav>

        <div className="p-3 md:p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left text-red-600 hover:bg-red-50 transition-colors"
          >
            <i className="ri-logout-box-line w-5 h-5"></i>
            <span className="text-sm md:text-base">로그아웃</span>
          </button>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex flex-col w-full md:w-auto">
        {/* 헤더 - 모바일에서도 표시 */}
        <header className="block bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="px-4 md:px-6 py-3 md:py-4">
            <div className="flex justify-between items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="md:hidden flex items-center justify-center h-10 w-10 rounded-full hover:bg-gray-100 text-gray-600"
                  aria-label="메뉴 열기"
                >
                  <i className="ri-menu-line text-xl"></i>
                </button>
                <h2 className="text-base md:text-lg font-semibold text-gray-900 truncate">
                  {activeMenu === 'dashboard' ? '대시보드' :
                    activeMenu === 'member-list' ? '회원 관리' :
                      activeMenu === 'sheets' ? '악보 관리' :
                        activeMenu === 'drum-lessons' ? '드럼레슨 관리' :
                          activeMenu === 'categories' ? '카테고리 관리' :
                            activeMenu === 'collections' ? '악보모음집 관리' :
                              activeMenu === 'event-discounts' ? '이벤트 할인악보 관리' :
                                activeMenu === 'orders' ? '주문 관리' :
                                  activeMenu === 'inquiries' ? '채팅 상담 관리' :
                                    activeMenu === 'custom-orders' ? '주문 제작 관리' :
                                      activeMenu === 'points' ? '적립금 관리' :
                                        activeMenu === 'copyright-report' ? '저작권 보고' :
                                          activeMenu === 'analytics' ? '분석' :
                                            activeMenu === 'settings' ? '설정' :
                                              activeMenu === 'marketing' ? '마케팅 자동화' :
                                                activeMenu === 'popularity' ? '인기곡 순위 관리' : '대시보드'}
                </h2>
              </div>
              <div className="flex items-center">
                <span className="text-sm md:text-base text-gray-700 truncate max-w-[120px] md:max-w-none">{user?.email?.split('@')[0]}님</span>
              </div>
            </div>
          </div>
        </header>

        {/* 메인 컨텐츠 영역 */}
        <main className="flex-1 p-3 md:p-6 overflow-auto">
          {renderMainContent()}
        </main>
      </div>
    </div>
  );
};

export default AdminPage;