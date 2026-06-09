import { supabase } from '@/lib/supabase';

export const SITE_SETTING_KEYS = ['general', 'payment', 'event', 'system', 'notification', 'chat'] as const;

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

export interface GeneralSettings {
  siteName: string;
  contactNumber: string;
  contactEmail: string;
  address: string;
  about: string;
  businessHours: string;
}

export interface PaymentSettings {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  paymentGuide: string;
}

export interface EventSettings {
  defaultDiscountRate: number;
  minPrice: number;
  maxPrice: number;
  defaultDurationDays: number;
}

export interface SystemSettings {
  maintenanceMode: boolean;
  maxUploadSizeMB: number;
  itemsPerPage: number;
}

export interface NotificationSettings {
  orderNotification: boolean;
  customOrderNotification: boolean;
  inquiryNotification: boolean;
  newsletterSubscription: boolean;
}

/** 요일별 운영시간 (0=일요일 ~ 6=토요일). enabled=false면 그날은 종일 오프라인. */
export interface ChatBusinessDay {
  enabled: boolean;
  /** "HH:mm" 24시간 형식 */
  from: string;
  to: string;
}

export interface ChatSettings {
  /** 채팅 기능 자체 사용 여부(끄면 위젯 미노출) */
  enabled: boolean;
  /**
   * online 판정 방식
   * - 'manual': manualOnline 값만 사용(운영시간 무시)
   * - 'auto': 운영시간(businessHours)으로 자동 판정
   * - 'manual_and_hours': manualOnline=true 이고 운영시간 내일 때만 온라인
   */
  mode: 'manual' | 'auto' | 'manual_and_hours';
  /** mode가 manual/manual_and_hours일 때 사용하는 수동 스위치 */
  manualOnline: boolean;
  /** 운영시간 판정 기준 타임존 */
  timezone: string;
  /** 0(일)~6(토) 인덱스의 7일 배열 */
  businessHours: ChatBusinessDay[];
  /** 위젯 환영 메시지 */
  welcomeMessage: string;
  /** 오프라인 안내 문구 */
  offlineMessage: string;
}

export interface SiteSettings {
  general: GeneralSettings;
  payment: PaymentSettings;
  event: EventSettings;
  system: SystemSettings;
  notification: NotificationSettings;
  chat: ChatSettings;
}

export type SiteSettingValue<K extends SiteSettingKey = SiteSettingKey> = SiteSettings[K];

export interface SiteSettingRow<K extends SiteSettingKey = SiteSettingKey> {
  key: K;
  value: SiteSettingValue<K>;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface SiteSettingsResponse {
  settings: SiteSettings;
  rows: SiteSettingRow[];
}

export const SITE_SETTING_DEFAULTS: SiteSettings = {
  general: {
    siteName: 'CopyDrum',
    contactNumber: '010-0000-0000',
    contactEmail: 'copydrum@hanmail.net',
    address: '서울특별시',
    about: 'CopyDrum은 드러머를 위한 맞춤 악보 서비스를 제공합니다.',
    businessHours: '평일 10:00-18:00 (점심시간 12:00-13:00)',
  },
  payment: {
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    paymentGuide: '입금 확인 후 맞춤 제작이 시작됩니다.',
  },
  event: {
    defaultDiscountRate: 20,
    minPrice: 1000,
    maxPrice: 50000,
    defaultDurationDays: 3,
  },
  system: {
    maintenanceMode: false,
    maxUploadSizeMB: 50,
    itemsPerPage: 20,
  },
  notification: {
    orderNotification: true,
    customOrderNotification: true,
    inquiryNotification: true,
    newsletterSubscription: false,
  },
  chat: {
    enabled: true,
    mode: 'manual_and_hours',
    manualOnline: false,
    timezone: 'Asia/Seoul',
    businessHours: [
      { enabled: false, from: '10:00', to: '18:00' }, // 일
      { enabled: true, from: '10:00', to: '18:00' }, // 월
      { enabled: true, from: '10:00', to: '18:00' }, // 화
      { enabled: true, from: '10:00', to: '18:00' }, // 수
      { enabled: true, from: '10:00', to: '18:00' }, // 목
      { enabled: true, from: '10:00', to: '18:00' }, // 금
      { enabled: false, from: '10:00', to: '18:00' }, // 토
    ],
    welcomeMessage: '안녕하세요! 무엇을 도와드릴까요? 결제·다운로드 관련 문의는 주문번호를 함께 남겨주시면 빠르게 확인해 드립니다.',
    offlineMessage:
      '현재 고객센터 운영시간이 아닙니다. 메시지를 남겨주시면 운영시간에 순차적으로 확인 후 답변드리겠습니다.',
  },
};

export const createDefaultSiteSettings = (): SiteSettings => ({
  general: { ...SITE_SETTING_DEFAULTS.general },
  payment: { ...SITE_SETTING_DEFAULTS.payment },
  event: { ...SITE_SETTING_DEFAULTS.event },
  system: { ...SITE_SETTING_DEFAULTS.system },
  notification: { ...SITE_SETTING_DEFAULTS.notification },
  chat: {
    ...SITE_SETTING_DEFAULTS.chat,
    businessHours: SITE_SETTING_DEFAULTS.chat.businessHours.map((d) => ({ ...d })),
  },
});

const isSiteSettingKey = (value: string): value is SiteSettingKey => {
  return SITE_SETTING_KEYS.includes(value as SiteSettingKey);
};

const mergeWithDefaults = <K extends SiteSettingKey>(key: K, value: SiteSettingValue<K>): SiteSettingValue<K> => {
  switch (key) {
    case 'general':
      return { ...SITE_SETTING_DEFAULTS.general, ...value } as SiteSettingValue<K>;
    case 'payment':
      return { ...SITE_SETTING_DEFAULTS.payment, ...value } as SiteSettingValue<K>;
    case 'event':
      return { ...SITE_SETTING_DEFAULTS.event, ...value } as SiteSettingValue<K>;
    case 'system':
      return { ...SITE_SETTING_DEFAULTS.system, ...value } as SiteSettingValue<K>;
    case 'notification':
      return { ...SITE_SETTING_DEFAULTS.notification, ...value } as SiteSettingValue<K>;
    case 'chat': {
      const merged = { ...SITE_SETTING_DEFAULTS.chat, ...(value as Partial<ChatSettings>) } as ChatSettings;
      const incomingHours = (value as Partial<ChatSettings>)?.businessHours;
      merged.businessHours = Array.isArray(incomingHours) && incomingHours.length === 7
        ? incomingHours.map((d) => ({ ...SITE_SETTING_DEFAULTS.chat.businessHours[0], ...d }))
        : SITE_SETTING_DEFAULTS.chat.businessHours.map((d) => ({ ...d }));
      return merged as SiteSettingValue<K>;
    }
    default:
      return value;
  }
};

export const fetchSettings = async (): Promise<SiteSettingsResponse> => {
  const { data, error } = await supabase
    .from('site_settings')
    .select('key, value, created_at, updated_at, updated_by');

  if (error) {
    console.error('사이트 설정 조회 오류:', error);
    throw error;
  }

  const settings = createDefaultSiteSettings();
  const rows: SiteSettingRow[] = [];

  (data ?? []).forEach((row) => {
    if (!row || !isSiteSettingKey(row.key)) {
      return;
    }

    const key = row.key;
    const value = (row.value || {}) as SiteSettingValue<typeof key>;

    settings[key] = mergeWithDefaults(key, value);

    rows.push({
      key,
      value: settings[key],
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    });
  });

  // ensure metadata rows exist even if defaults only
  SITE_SETTING_KEYS.forEach((key) => {
    if (!rows.some((row) => row.key === key)) {
      rows.push({
        key,
        value: settings[key],
        created_at: '',
        updated_at: '',
        updated_by: null,
      });
    }
  });

  return { settings, rows };
};

export const getSettingByKey = async <K extends SiteSettingKey>(key: K): Promise<SiteSettingValue<K>> => {
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error(`사이트 설정(${key}) 조회 오류:`, error);
    throw error;
  }

  if (!data || !data.value) {
    return mergeWithDefaults(key, SITE_SETTING_DEFAULTS[key]);
  }

  return mergeWithDefaults(key, data.value as SiteSettingValue<K>);
};

export const updateSettings = async (
  payload: Partial<{ [K in SiteSettingKey]: SiteSettingValue<K> }>,
  options: { updatedBy?: string | null } = {}
): Promise<SiteSettingsResponse> => {
  const entries = Object.entries(payload).filter(([key]) => isSiteSettingKey(key)) as [
    SiteSettingKey,
    SiteSettingValue
  ][];

  if (entries.length === 0) {
    return fetchSettings();
  }

  const { error } = await supabase.from('site_settings').upsert(
    entries.map(([key, value]) => ({
      key,
      value,
      updated_by: options.updatedBy ?? null,
    })),
    {
      onConflict: 'key',
    }
  );

  if (error) {
    console.error('사이트 설정 저장 오류:', error);
    throw error;
  }

  return fetchSettings();
};




