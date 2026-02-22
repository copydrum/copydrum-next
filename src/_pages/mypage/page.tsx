'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import Link from 'next/link';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import MainHeader from '../../components/common/MainHeader';
import { useCart } from '../../hooks/useCart';
import type { FavoriteSheet } from '../../lib/favorites';
import { fetchUserFavorites, removeFavorite } from '../../lib/favorites';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { buildDownloadKey, downloadFile, getDownloadFileName, requestSignedDownloadUrl } from '../../utils/downloadHelpers';
// convertUSDToKRW is not used in this component anymore
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { getUserDisplayName } from '../../utils/userDisplayName';
import { useUserCredits } from '../../hooks/useUserCredits';
import { isKoreanSiteHost } from '../../config/hostType';

import type { VirtualAccountInfo } from '../../lib/payments';

type TabKey = 'profile' | 'purchases' | 'favorites' | 'inquiries' | 'custom-orders';

type MaybeDateString = string | null | undefined;

interface ProfileInfo {
  id: string;
  email: string | null;
  name: string | null;
  display_name?: string | null;
  phone: string | null;
  credits: number;
  created_at: MaybeDateString;
}

interface CustomerInquiry {
  id: string;
  category: string;
  title: string;
  content: string;
  status: string;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

interface CategoryInfo {
  name: string | null;
}

interface SheetInfo {
  id: string;
  title: string;
  artist: string;
  price: number;
  thumbnail_url: string | null;
  pdf_url: string | null;
  preview_image_url: string | null;
  slug: string | null;
  categories?: CategoryInfo | null;
}

interface OrderItemDetail {
  id: string;
  sheet_id: string;
  price: number;
  created_at: string;
  drum_sheets: SheetInfo | null;
}

const DOWNLOADABLE_STATUSES = ['completed', 'payment_confirmed', 'paid'];

interface OrderSummary {
  id: string;
  created_at: string;
  status: string;
  total_amount: number;
  payment_method?: string | null;
  payment_status?: string | null;
  payment_confirmed_at?: string | null;
  transaction_id?: string | null;
  depositor_name?: string | null;
  virtual_account_info?: VirtualAccountInfo | null;
  order_items: OrderItemDetail[];
}

interface DownloadableItem extends OrderItemDetail {
  order_id: string;
  order_status: string;
  order_created_at: string;
}

interface CustomOrderSummary {
  id: string;
  song_title: string;
  artist: string;
  status: string;
  estimated_price: number | null;
  created_at: string;
  updated_at: string;
}

const formatDate = (value: MaybeDateString) => (value ? new Date(value).toLocaleDateString('ko-KR') : '-');
const formatDateTime = (value: MaybeDateString) => (value ? new Date(value).toLocaleString('ko-KR') : '-');

export default function MyPage() {
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const { cartItems, addToCart, isInCart } = useCart();
  const { t, i18n } = useTranslation();

  // user 상태를 최상단에 선언 (다른 훅에서 사용하기 전에 선언 필요)
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);
  const isKoreanSite = isKoreanSiteHost(hostname);
  const { credits, isLoading: creditsLoading } = useUserCredits(user);

  const formatCurrency = useCallback(
    (value: number) => {
      const converted = convertFromKrw(value, currency, i18n.language);
      return formatCurrencyUtil(converted, currency);
    },
    [currency, i18n.language],
  );

  // Status maps using t()
  const orderStatusStyles = useMemo(() => ({
    completed: { label: t('mypage.status.order.completed'), className: 'bg-green-100 text-green-800' },
    pending: { label: t('mypage.status.order.pending'), className: 'bg-yellow-100 text-yellow-800' },
    cancelled: { label: t('mypage.status.order.cancelled'), className: 'bg-red-100 text-red-700' },
    refunded: { label: t('mypage.status.order.refunded'), className: 'bg-purple-100 text-purple-700' },
  }), [t]);

  const customOrderStatusMap = useMemo(() => ({
    pending: { label: t('mypage.status.customOrder.pending'), className: 'bg-blue-100 text-blue-800' },
    quoted: { label: t('mypage.status.customOrder.quoted'), className: 'bg-amber-100 text-amber-700' },
    payment_confirmed: { label: t('mypage.status.customOrder.paymentConfirmed'), className: 'bg-emerald-100 text-emerald-700' },
    in_progress: { label: t('mypage.status.customOrder.inProgress'), className: 'bg-indigo-100 text-indigo-700' },
    completed: { label: t('mypage.status.customOrder.completed'), className: 'bg-purple-100 text-purple-700' },
    cancelled: { label: t('mypage.status.customOrder.cancelled'), className: 'bg-red-100 text-red-700' },
  }), [t]);

  const inquiryStatusMap = useMemo(() => ({
    pending: { label: t('mypage.status.inquiry.pending'), className: 'bg-yellow-100 text-yellow-800' },
    answered: { label: t('mypage.status.inquiry.answered'), className: 'bg-emerald-100 text-emerald-700' },
  }), [t]);

  const getInquiryStatusMeta = useCallback((status: string) =>
    (inquiryStatusMap[status as keyof typeof inquiryStatusMap] ?? { label: t('mypage.status.inquiry.processing'), className: 'bg-gray-100 text-gray-600' }),
    [inquiryStatusMap, t]);


  const getTabs = useCallback((): { id: TabKey; label: string; icon: string; description?: string }[] => [
    { id: 'profile', label: t('mypage.tabs.profile.label'), icon: 'ri-user-line', description: t('mypage.tabs.profile.description') },
    { id: 'purchases', label: t('mypage.tabs.purchases.label'), icon: 'ri-shopping-bag-line', description: t('mypage.tabs.purchases.description') },
    { id: 'favorites', label: t('mypage.tabs.favorites.label'), icon: 'ri-heart-line', description: t('mypage.tabs.favorites.description') },
    { id: 'inquiries', label: t('mypage.tabs.inquiries.label'), icon: 'ri-question-answer-line', description: t('mypage.tabs.inquiries.description') },
    { id: 'custom-orders', label: t('mypage.tabs.customOrders.label'), icon: 'ri-file-text-line', description: t('mypage.tabs.customOrders.description') },
  ], [t]);

  // URL 쿼리 파라미터에서 탭 정보 읽기
  const getInitialTab = useCallback((): TabKey => {
    const tabParam = searchParams.get('tab') || searchParams.get('section');
    if (
      tabParam &&
      ['profile', 'purchases', 'favorites', 'inquiries', 'custom-orders'].includes(tabParam)
    ) {
      return tabParam as TabKey;
    }
    // section 파라미터 매핑 (기존 호환성 유지)
    const sectionParam = searchParams.get('section');
    if (sectionParam === 'profile') return 'profile';
    if (sectionParam === 'inquiries') return 'inquiries';
    return 'profile';
  }, [searchParams]);

  const initialTab = useMemo(() => getInitialTab(), [getInitialTab]);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' });
  const [profileSaving, setProfileSaving] = useState(false);

  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [downloads, setDownloads] = useState<DownloadableItem[]>([]);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<Record<string, string[]>>({});
  const [downloadingKeys, setDownloadingKeys] = useState<string[]>([]);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteSheet[]>([]);
  const [customOrders, setCustomOrders] = useState<CustomOrderSummary[]>([]);
  const [userInquiries, setUserInquiries] = useState<CustomerInquiry[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquiryForm, setInquiryForm] = useState({
    name: '',
    email: '',
    category: '',
    subject: '',
    message: '',
  });
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const loadUserInquiries = useCallback(async (currentUser: User) => {
    setInquiriesLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_inquiries')
        .select('id, category, title, content, status, admin_reply, replied_at, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const normalized = (data ?? []).map((item: any) => ({
        id: item.id as string,
        category: item.category ?? '',
        title: item.title ?? '',
        content: item.content ?? '',
        status: item.status ?? 'pending',
        admin_reply: item.admin_reply ?? null,
        replied_at: item.replied_at ?? null,
        created_at: item.created_at as string,
      }));

      setUserInquiries(normalized);
    } catch (error) {
      console.error(t('mypage.console.inquiryHistoryError'), error);
      setUserInquiries([]);
    } finally {
      setInquiriesLoading(false);
    }
  }, []);


  useEffect(() => {
    if (!user) {
      setInquiryForm({
        name: '',
        email: '',
        category: '',
        subject: '',
        message: '',
      });
      return;
    }

    setInquiryForm((prev) => ({
      ...prev,
      name: prev.name || (user.user_metadata?.name as string) || '',
      email: prev.email || user.email || '',
    }));
  }, [user]);

  useEffect(() => {
    setSelectedPurchaseIds((prev) => {
      if (Object.keys(prev).length === 0) {
        return prev;
      }

      const orderMap = new Map<string, Set<string>>();
      orders.forEach((order) => {
        orderMap.set(
          order.id,
          new Set(order.order_items.map((item) => item.id))
        );
      });

      const next: Record<string, string[]> = {};
      let changed = false;

      Object.entries(prev).forEach(([orderId, itemIds]) => {
        const validIds = orderMap.get(orderId);
        if (!validIds) {
          changed = true;
          return;
        }

        const filtered = itemIds.filter((itemId) => validIds.has(itemId));

        if (filtered.length !== itemIds.length) {
          changed = true;
        }

        if (filtered.length > 0) {
          next[orderId] = filtered;
        } else if (itemIds.length > 0) {
          changed = true;
        }
      });

      if (!changed) {
        return prev;
      }

      return next;
    });
  }, [orders]);

  const loadProfile = useCallback(async (currentUser: User) => {
    // fallback 프로필 (프로필 조회 실패 시 user metadata 기반)
    const fallbackProfile: ProfileInfo = {
      id: currentUser.id,
      email: currentUser.email ?? null,
      name: (currentUser.user_metadata?.name as string | null) ?? null,
      display_name: (currentUser.user_metadata?.display_name as string | null) ?? null,
      phone: (currentUser.user_metadata?.phone as string | null) ?? null,
      credits: 0,
      created_at: currentUser.created_at,
    };

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name, display_name, phone, created_at')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) {
        // RLS 또는 권한 오류 시 fallback 사용 (콘솔에 warn으로 축소)
        console.warn('[MyPage] 프로필 조회 실패, fallback 사용:', error.message || error.code || 'Unknown error');
        setProfile(fallbackProfile);
        setProfileForm({
          name: fallbackProfile.name ?? '',
          phone: fallbackProfile.phone ?? '',
        });
        return;
      }

      const profileData: ProfileInfo = {
        id: currentUser.id,
        email: data?.email ?? currentUser.email ?? null,
        name: data?.name ?? (currentUser.user_metadata?.name as string | null) ?? null,
        display_name: data?.display_name ?? null,
        phone: data?.phone ?? (currentUser.user_metadata?.phone as string | null) ?? null,
        credits: 0, // credits는 useUserCashBalance 훅에서 관리 (통일된 소스)
        created_at: data?.created_at ?? currentUser.created_at,
      };

      setProfile(profileData);
      setProfileForm({
        name: profileData.name ?? '',
        phone: profileData.phone ?? '',
      });
    } catch (error: any) {
      console.warn('[MyPage] 프로필 로드 예외, fallback 사용:', error?.message || error);
      setProfile(fallbackProfile);
      setProfileForm({
        name: fallbackProfile.name ?? '',
        phone: fallbackProfile.phone ?? '',
      });
    }
  }, []);

  // 일반 유저용: 본인 주문만 조회 (필터 필수)
  // RLS 정책과 함께 이중으로 보안 적용
  // 기본적으로 payment_status = 'paid' (결제 완료)인 주문만 표시
  const loadOrders = useCallback(async (currentUser: User) => {
    try {
      // order_items 테이블의 실제 컬럼명을 확인하기 위해 먼저 간단한 쿼리 시도
      // sheet_id가 없을 수 있으므로 오류 처리 추가
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          status,
          total_amount,
          payment_method,
          payment_status,
          payment_confirmed_at,
          transaction_id,
          depositor_name,
          virtual_account_info,
          order_type,
          order_items (
            id,
            drum_sheet_id,
            price,
            created_at,
            drum_sheets (
              id,
              title,
              artist,
              price,
              thumbnail_url,
              pdf_url,
              preview_image_url,
              slug,
              categories (
                name
              )
            )
          )
        `)
        .eq('user_id', currentUser.id)  // 일반 유저는 본인 주문만 필터링
        .eq('payment_status', 'paid')  // 결제 완료된 주문만 필터링
        .order('created_at', { ascending: false });

      if (error) {
        // 컬럼명 오류인 경우 빈 배열로 설정하고 계속 진행
        if (error.code === '42703' || error.message?.includes('does not exist')) {
          console.warn('order_items 테이블 스키마 오류 - 구매 내역을 불러올 수 없습니다:', error.message);
          setOrders([]);
          setDownloads([]);
          return;
        }
        throw error;
      }

      const normalizedOrders: OrderSummary[] = (data ?? []).map((order: any) => ({
        id: order.id,
        created_at: order.created_at,
        status: order.status,
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        payment_status: order.payment_status ?? null,
        payment_confirmed_at: order.payment_confirmed_at ?? null,
        transaction_id: order.transaction_id ?? null,
        depositor_name: order.depositor_name ?? null,
        virtual_account_info: (order.virtual_account_info ?? null) as VirtualAccountInfo | null,
        order_items: (order.order_items ?? []).map((item: any) => {
          const sheetId = item.drum_sheet_id || item.drum_sheets?.id || '';
          return {
            id: item.id,
            sheet_id: sheetId || '',
            price: item.price,
            created_at: item.created_at,
            drum_sheets: item.drum_sheets
              ? {
                id: item.drum_sheets.id,
                title: item.drum_sheets.title,
                artist: item.drum_sheets.artist,
                price: item.drum_sheets.price,
                thumbnail_url: item.drum_sheets.thumbnail_url,
                pdf_url: item.drum_sheets.pdf_url,
                preview_image_url: item.drum_sheets.preview_image_url,
                slug: item.drum_sheets.slug,
                categories: item.drum_sheets.categories,
              }
              : null,
          };
        }),
      }));

      // order_items가 있고, order_type이 'product'인 주문만 필터링 (악보 구매만)
      // order_type이 없어도 order_items가 있으면 악보 구매로 간주
      const filteredOrders = normalizedOrders.filter(
        (order) => 
          (order.order_items?.length ?? 0) > 0 && 
          (order.order_type === 'product' || !order.order_type)
      );

      setOrders(filteredOrders);
      const downloadItems: DownloadableItem[] = filteredOrders.flatMap((order) =>
        DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())
          ? order.order_items
            .filter((item) => item.sheet_id)
            .map((item) => ({
              ...item,
              order_id: order.id,
              order_status: order.status,
              order_created_at: order.created_at,
            }))
          : [],
      );
      setDownloads(downloadItems);
      setSelectedDownloadIds((prev) => {
        const validKeys = new Set(
          downloadItems.map((item) => buildDownloadKey(item.order_id, item.id)),
        );
        return prev.filter((key) => validKeys.has(key));
      });
    } catch (error) {
      console.error(t('mypage.console.orderHistoryError'), error);
      // 오류가 발생해도 빈 배열로 설정하여 다른 데이터 로드는 계속 진행
      setOrders([]);
      setDownloads([]);
    }
  }, []);

  const loadFavoritesList = useCallback(async (currentUser: User) => {
    try {
      const data = await fetchUserFavorites(currentUser.id);
      setFavorites(data);
    } catch (error) {
      console.error(t('mypage.console.favoritesLoadError'), error);
      setFavorites([]);
    }
  }, []);

  const loadCustomOrders = useCallback(async (currentUser: User) => {
    try {
      const { data, error } = await supabase
        .from('custom_orders')
        .select('id, song_title, artist, status, estimated_price, created_at, updated_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setCustomOrders((data ?? []) as CustomOrderSummary[]);
    } catch (error) {
      console.error(t('mypage.console.customOrderHistoryError'), error);
      setCustomOrders([]);
    }
  }, []);

  const loadAll = useCallback(
    async (currentUser: User) => {
      setLoading(true);
      try {
        // Promise.allSettled를 사용하여 하나의 요청이 실패해도 다른 요청은 계속 진행
        await Promise.allSettled([
          loadProfile(currentUser),
          loadOrders(currentUser),
          loadFavoritesList(currentUser),
          loadCustomOrders(currentUser),
          loadUserInquiries(currentUser),
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loadProfile, loadOrders, loadFavoritesList, loadCustomOrders, loadUserInquiries]
  );

  // URL 쿼리 파라미터 변경 시 탭 업데이트
  useEffect(() => {
    const tab = getInitialTab();
    setActiveTab(tab);
  }, [getInitialTab]);

  useEffect(() => {
    let isMounted = true;

    const initialise = async () => {
      setLoading(true);
      try {
        const {
          data: { user: currentUser },
        } = await supabase.auth.getUser();

        if (!isMounted) return;

        setUser(currentUser ?? null);
        if (currentUser) {
          await loadAll(currentUser);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error(t('mypage.console.initError'), error);
        setLoading(false);
      }
    };

    initialise();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      if (!isMounted) return;

      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        if (event === 'USER_UPDATED') {
          setLoading(true);
          try {
            await Promise.allSettled([loadProfile(nextUser)]);
          } finally {
            setLoading(false);
          }
          return;
        }

        await loadAll(nextUser);
      } else {
        setProfile(null);
        setProfileForm({ name: '', phone: '' });
        setOrders([]);
        setDownloads([]);
        setFavorites([]);
        setCustomOrders([]);
        setCashHistory([]);
        setUserInquiries([]);
        setInquiryForm({
          name: '',
          email: '',
          category: '',
          subject: '',
          message: '',
        });
        setInquiriesLoading(false);
        setInquirySubmitting(false);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadAll, loadProfile]);

  const totalPurchasedSheets = useMemo(
    () => orders.reduce((count, order) => count + order.order_items.length, 0),
    [orders]
  );

  const stats = useMemo(
    () => [
      { 
        label: t('mypage.stats.purchasedSheets'), 
        value: totalPurchasedSheets,
        path: '/purchases'
      },
      { 
        label: t('mypage.stats.availableDownloads'), 
        value: downloads.length,
        path: '/purchases'
      },
      { 
        label: t('mypage.stats.favoriteSheets'), 
        value: favorites.length,
        path: '/mypage?tab=favorites'
      },
      { 
        label: t('mypage.stats.inquiries'), 
        value: userInquiries.length,
        path: '/mypage?tab=inquiries'
      },
      { 
        label: t('mypage.stats.customOrders'), 
        value: customOrders.length,
        path: '/custom-orders'
      },
    ],
    [totalPurchasedSheets, downloads.length, favorites.length, userInquiries.length, customOrders.length, t]
  );

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    router.push(`/categories?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleInquiryInputChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setInquiryForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleInquirySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      alert(t('mypage.errors.loginRequired'));
      return;
    }

    if (
      !inquiryForm.name.trim() ||
      !inquiryForm.email.trim() ||
      !inquiryForm.category ||
      !inquiryForm.subject.trim() ||
      !inquiryForm.message.trim()
    ) {
      alert(t('mypage.errors.allFieldsRequired'));
      return;
    }

    try {
      setInquirySubmitting(true);
      const trimmedName = inquiryForm.name.trim();
      const trimmedEmail = inquiryForm.email.trim();
      const trimmedSubject = inquiryForm.subject.trim();
      const trimmedMessage = inquiryForm.message.trim();

      const { error } = await supabase
        .from('customer_inquiries')
        .insert({
          user_id: user.id,
          name: trimmedName,
          email: trimmedEmail,
          category: inquiryForm.category,
          title: trimmedSubject,
          content: trimmedMessage,
          status: 'pending',
        });

      if (error) {
        throw error;
      }

      alert(t('mypage.errors.inquirySubmitted'));
      setInquiryForm((prev) => ({
        ...prev,
        category: '',
        subject: '',
        message: '',
      }));
      await loadUserInquiries(user);
    } catch (error) {
      console.error(t('mypage.console.inquirySubmitError'), error);
      alert(t('mypage.errors.inquiryError'));
    } finally {
      setInquirySubmitting(false);
    }
  };

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) {
      alert(t('mypage.errors.loginRequired'));
      return;
    }

    setProfileSaving(true);
    try {
      const updates = {
        name: profileForm.name.trim() || null,
        phone: profileForm.phone.trim() || null,
      };

      const { error: authError } = await supabase.auth.updateUser({
        data: updates,
      });
      if (authError) throw authError;

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        name: updates.name,
        phone: updates.phone,
        updated_at: new Date().toISOString(),
      });
      if (profileError) throw profileError;

      setProfile((prev) =>
        prev
          ? { ...prev, name: updates.name, phone: updates.phone }
          : {
            id: user.id,
            email: user.email ?? null,
            name: updates.name,
            phone: updates.phone,
            credits: 0,
            created_at: user.created_at,
          }
      );

      alert(t('mypage.errors.profileUpdated'));
    } catch (error) {
      console.error(t('mypage.console.profileUpdateError'), error);
      alert(t('mypage.errors.profileUpdateError'));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) {
      alert(t('mypage.errors.loginRequired'));
      return;
    }

    // 첫 번째 확인
    const firstConfirm = confirm(t('mypage.deleteAccount.confirmFirst'));
    if (!firstConfirm) return;

    // 두 번째 확인 (이중 확인)
    const secondConfirm = confirm(t('mypage.deleteAccount.confirmFinal'));
    if (!secondConfirm) return;

    setDeletingAccount(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error(t('mypage.deleteAccount.sessionExpired'));
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || t('mypage.deleteAccount.error'));
      }

      alert(t('mypage.deleteAccount.success'));
      
      // 로그아웃 및 홈으로 리다이렉트
      await supabase.auth.signOut();
      router.push('/');
    } catch (error: any) {
      console.error('회원탈퇴 오류:', error);
      alert(error.message || t('mypage.deleteAccount.error'));
    } finally {
      setDeletingAccount(false);
    }
  };

  const toggleDownloadSelection = (item: DownloadableItem) => {
    if (!DOWNLOADABLE_STATUSES.includes((item.order_status ?? '').toLowerCase())) {
      return;
    }

    const key = buildDownloadKey(item.order_id, item.id);
    setSelectedDownloadIds((prev) =>
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]
    );
  };

  const renderInquiryStatusBadge = (status: string) => {
    const meta = getInquiryStatusMeta(status);
    return (
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${meta.className}`}
      >
        {meta.label}
      </span>
    );
  };


  const togglePurchaseSelection = (orderId: string, itemId: string) => {
    setSelectedPurchaseIds((prev) => {
      const current = prev[orderId] ?? [];
      const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];

      if (next.length === 0) {
        const { [orderId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [orderId]: next };
    });
  };

  const clearPurchaseSelection = (orderId: string) => {
    setSelectedPurchaseIds((prev) => {
      if (!(orderId in prev)) {
        return prev;
      }

      const { [orderId]: _, ...rest } = prev;
      return rest;
    });
  };

  const toggleSelectAllInOrder = (orderId: string, orderItems: OrderItemDetail[]) => {
    setSelectedPurchaseIds((prev) => {
      const selectableIds = orderItems.filter((item) => item.sheet_id).map((item) => item.id);
      if (selectableIds.length === 0) {
        return prev;
      }

      const current = prev[orderId] ?? [];
      const isAllSelected = selectableIds.every((id) => current.includes(id));

      if (isAllSelected) {
        const { [orderId]: _, ...rest } = prev;
        return rest;
      }

      return { ...prev, [orderId]: selectableIds };
    });
  };

  const handleDownloadSelectedInOrder = async (order: OrderSummary) => {
    if (!DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())) {
      alert(t('mypage.errors.downloadRestricted'));
      return;
    }

    const selectedIds = selectedPurchaseIds[order.id] ?? [];
    if (selectedIds.length === 0) {
      alert(t('mypage.errors.selectDownloadItems'));
      return;
    }

    const selectedItems = order.order_items
      .filter((item) => item.sheet_id && selectedIds.includes(item.id))
      .map<DownloadableItem>((item) => ({
        ...item,
        order_id: order.id,
        order_status: order.status,
        order_created_at: order.created_at,
      }));

    await handleDownloadMultiple(selectedItems);
  };

  const handleDownloadAllInOrder = async (order: OrderSummary) => {
    if (!DOWNLOADABLE_STATUSES.includes((order.status ?? '').toLowerCase())) {
      alert(t('mypage.errors.downloadRestricted'));
      return;
    }

    const items = order.order_items
      .filter((item) => item.sheet_id)
      .map<DownloadableItem>((item) => ({
        ...item,
        order_id: order.id,
        order_status: order.status,
        order_created_at: order.created_at,
      }));

    if (items.length === 0) {
      alert(t('mypage.errors.noDownloadableItems'));
      return;
    }

    await handleDownloadMultiple(items);
  };

  const startDownloading = (key: string) => {
    setDownloadingKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const finishDownloading = (key: string) => {
    setDownloadingKeys((prev) => prev.filter((value) => value !== key));
  };

  const downloadSheetItem = async (item: DownloadableItem, accessToken: string) => {
    if (!item.sheet_id) {
      throw new Error(t('mypage.errors.sheetInfoNotFound'));
    }

    if (!item.drum_sheets) {
      throw new Error(t('mypage.errors.downloadLinkNotFound'));
    }

    const fileName = getDownloadFileName({
      title: item.drum_sheets?.title,
      artist: item.drum_sheets?.artist,
      orderId: item.order_id,
    });

    const signedUrl = await requestSignedDownloadUrl({
      orderId: item.order_id,
      orderItemId: item.id,
      accessToken,
    });

    await downloadFile(signedUrl, fileName);
  };

  const handleDownloadMultiple = async (items: DownloadableItem[]) => {
    if (items.length === 0) {
      alert(t('mypage.errors.selectDownloadItems'));
      return;
    }

    const invalidItems = items.filter(
      (item) => !DOWNLOADABLE_STATUSES.includes((item.order_status ?? '').toLowerCase()),
    );
    if (invalidItems.length > 0) {
      alert(t('mypage.errors.downloadRestrictedMultiple'));
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      alert(t('mypage.errors.loginRequiredForDownload'));
      return;
    }

    setBulkDownloading(true);
    const failed: DownloadableItem[] = [];

    try {
      for (const item of items) {
        const key = buildDownloadKey(item.order_id, item.id);
        startDownloading(key);
        try {
          await downloadSheetItem(item, session.access_token);
        } catch (error) {
          failed.push(item);
        } finally {
          finishDownloading(key);
        }
      }
    } finally {
      setBulkDownloading(false);
    }

    if (failed.length > 0) {
      alert(t('mypage.errors.downloadFailed', { count: failed.length }));
    }
  };


  const handleDownload = async (item: DownloadableItem) => {
    if (!DOWNLOADABLE_STATUSES.includes((item.order_status ?? '').toLowerCase())) {
      alert(t('mypage.errors.downloadRestrictedMultiple'));
      return;
    }

    const key = buildDownloadKey(item.order_id, item.id);
    startDownloading(key);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(t('mypage.errors.loginRequiredForDownload'));
      }

      await downloadSheetItem(item, session.access_token);
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert(t('mypage.errors.downloadFailedSingle'));
      }
    } finally {
      finishDownloading(key);
    }
  };

  const handlePreview = (item: DownloadableItem) => {
    const previewUrl = item.drum_sheets?.preview_image_url;
    if (!previewUrl) {
      alert(t('mypage.errors.previewNotFound'));
      return;
    }
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  const handleFavoriteRemove = async (sheetId: string) => {
    if (!user) return;
    try {
      await removeFavorite(sheetId, user.id);
      await loadFavoritesList(user);
    } catch (error) {
      console.error(t('mypage.console.favoriteRemoveError'), error);
      alert(t('mypage.errors.favoriteRemoveFailed'));
    }
  };

  const handleAddToCart = async (sheetId: string) => {
    await addToCart(sheetId);
  };

  const handleGoToSheet = (slug: string, fallbackId?: string) => {
    router.push(`/drum-sheet/${slug || fallbackId}`);
  };

  const renderOrderStatusBadge = (status: string) => {
    const normalized = status?.toLowerCase();
    const badge = orderStatusStyles[normalized as keyof typeof orderStatusStyles];
    if (!badge) {
      return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">{status || t('mypage.status.order.undetermined')}</span>;
    }
    return <span className={`px-3 py-1 text-xs font-semibold rounded-full ${badge.className}`}>{badge.label}</span>;
  };

  const renderCustomOrderStatusBadge = (status: string) => {
    const normalized = status?.toLowerCase();
    const badge = customOrderStatusMap[normalized as keyof typeof customOrderStatusMap];
    if (!badge) {
      return <span className="px-3 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">{status || t('mypage.status.customOrder.undetermined')}</span>;
    }
    return <span className={`px-3 py-1 text-xs font-semibold rounded-full ${badge.className}`}>{badge.label}</span>;
  };

  const renderLoader = () => (
    <div className="py-24 flex flex-col items-center justify-center text-center">
      <div className="h-12 w-12 rounded-full border-b-2 border-blue-600 animate-spin mb-4" />
      <p className="text-gray-600 font-medium" suppressHydrationWarning>{t('mypage.loading.message')}</p>
    </div>
  );

  const renderGuestState = () => (
    <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
      <i className="ri-user-line text-5xl text-gray-400" />
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('mypage.guest.title')}</h2>
        <p className="text-gray-600">{t('mypage.guest.description')}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/login')}
          className="px-6 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
        >
          {t('mypage.guest.login')}
        </button>
        <button
          onClick={() => router.push('/auth/signup')}
          className="px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition"
        >
          {t('mypage.guest.signup')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-0">
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>

      <div className="pt-[76px] md:pt-0">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
          {loading ? (
            renderLoader()
          ) : !user ? (
            renderGuestState()
          ) : (
            <div className="space-y-10">
              <header>
                <h2 className="text-3xl font-extrabold text-gray-900">{t('mypage.title')}</h2>
                <p className="mt-2 text-gray-600">
                  {t('mypage.subtitle')}
                </p>
              </header>

              <section className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-6">
                    <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold">
                      {getUserDisplayName(profile as Profile | null, profile?.email || null).slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{t('mypage.profile.memberInfo')}</p>
                      <h3 className="text-xl font-bold text-gray-900">{getUserDisplayName(profile as Profile | null, profile?.email || null)}</h3>
                      <p className="text-sm text-gray-600">{profile?.email}</p>
                      <p className="mt-2 text-xs text-gray-400">{t('mypage.profile.joinedOn')} {formatDate(profile?.created_at)}</p>
                    </div>
                  </div>

                  {/* 보유 포인트 표시 (한국어 사이트만, credits > 0일 때만) */}
                  {isKoreanSite && !creditsLoading && credits > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('mypage.profile.cashBalance')}</h3>
                      <p className="text-3xl font-extrabold text-blue-600 mb-2">{credits.toLocaleString('ko-KR')} P</p>
                      <p className="text-xs text-gray-500" style={{ fontSize: 12, color: '#666' }}>
                        * 포인트는 예전에 충전한 금액만 사용 가능하며, 새로운 포인트 충전은 제공되지 않습니다.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {stats.map((item) => {
                    const handleCardClick = () => {
                      // 쿼리 파라미터가 있는 경우 URL 파싱
                      if (item.path.includes('?')) {
                        const [path, query] = item.path.split('?');
                        router.push(`${path}?${query}`);
                      } else {
                        router.push(item.path);
                      }
                    };

                    return (
                      <div
                        key={item.label}
                        onClick={handleCardClick}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleCardClick();
                          }
                        }}
                        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group"
                      >
                        <p className="text-sm text-gray-500">{item.label}</p>
                        <p className="mt-2 text-2xl font-extrabold text-gray-900 group-hover:text-blue-600 transition-colors">
                          {item.value.toLocaleString('ko-KR')}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                <aside className="lg:col-span-1 space-y-4">
                  {getTabs().map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left transition ${activeTab === tab.id
                        ? 'border-blue-500 bg-blue-50 text-blue-600 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:text-blue-600'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <i className={`${tab.icon} text-lg`} />
                        <span className="font-semibold">{tab.label}</span>
                      </div>
                      {tab.description ? <p className="text-xs text-gray-500">{tab.description}</p> : null}
                    </button>
                  ))}
                </aside>

                <section className="lg:col-span-3">
                  {activeTab === 'profile' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-6">{t('mypage.profile.title')}</h3>
                      <form onSubmit={handleProfileSubmit} className="space-y-6">
                        <div className="grid gap-6 md:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('mypage.profile.email')}</label>
                            <input
                              type="email"
                              value={profile?.email ?? ''}
                              disabled
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('mypage.profile.name')}</label>
                            <input
                              type="text"
                              value={profileForm.name}
                              onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
                              placeholder={t('mypage.profile.namePlaceholder')}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('mypage.profile.phoneNumber')}</label>
                            <input
                              type="tel"
                              value={profileForm.phone}
                              onChange={(event) => setProfileForm((prev) => ({ ...prev, phone: event.target.value }))}
                              placeholder={t('mypage.profile.phonePlaceholder')}
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('mypage.profile.joinDate')}</label>
                            <input
                              type="text"
                              value={formatDate(profile?.created_at)}
                              disabled
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={profileSaving}
                            className={`px-6 py-3 rounded-lg font-semibold text-white transition ${profileSaving ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                              }`}
                          >
                            {profileSaving ? t('mypage.profile.saving') : t('mypage.profile.updateProfile')}
                          </button>
                        </div>
                      </form>

                      {/* 회원탈퇴 섹션 */}
                      <div className="mt-8 pt-8 border-t border-gray-200">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                          <h4 className="text-lg font-semibold text-red-900 mb-2">{t('mypage.deleteAccount.title')}</h4>
                          <p className="text-sm text-red-700 mb-4">
                            {t('mypage.deleteAccount.description')}
                          </p>
                          <button
                            onClick={handleDeleteAccount}
                            disabled={deletingAccount}
                            className={`px-6 py-3 rounded-lg font-semibold text-white transition ${
                              deletingAccount 
                                ? 'bg-red-300 cursor-not-allowed' 
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                          >
                            {deletingAccount ? t('mypage.deleteAccount.processing') : t('mypage.deleteAccount.button')}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'purchases' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{t('mypage.purchases.title')}</h3>
                          <p className="text-sm text-gray-500">{t('mypage.purchases.description')}</p>
                        </div>
                        <Link
                          href="/categories"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-200 text-blue-600 text-sm font-semibold hover:bg-blue-50"
                        >
                          <i className="ri-add-line text-lg" /> {t('mypage.purchases.browseMore')}
                        </Link>
                      </div>

                      {orders.length === 0 ? (
                        <div className="py-16 text-center text-gray-500">
                          <i className="ri-shopping-bag-line text-4xl text-gray-300 mb-4" />
                          <p className="font-medium">{t('mypage.purchases.noPurchases')}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {orders.map((order) => {
                            const selectableOrderItems = order.order_items.filter((item) => item.sheet_id);
                            const orderSelectedIds = selectedPurchaseIds[order.id] ?? [];
                            const selectedCount = orderSelectedIds.length;
                            const allSelectableSelected =
                              selectableOrderItems.length > 0 && selectedCount === selectableOrderItems.length;
                            const hasSelectableItems = selectableOrderItems.length > 0;

                            return (
                              <div key={order.id} className="border border-gray-100 rounded-xl p-4 space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div>
                                    <p className="text-sm text-gray-500">{t('mypage.purchases.orderNumber')}</p>
                                    <h4 className="text-lg font-semibold text-gray-900">
                                      #{order.id.slice(0, 8).toUpperCase()}
                                    </h4>
                                    <p className="text-xs text-gray-400 mt-1">{formatDateTime(order.created_at)}</p>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3">
                                    {renderOrderStatusBadge(order.status)}
                                    <p className="text-base font-semibold text-gray-900">
                                      {t('mypage.purchases.total')}{' '}
                                      {order.payment_method === 'cash'
                                        ? `${order.total_amount.toLocaleString('en-US')} P`
                                        : formatCurrency(order.total_amount)}
                                    </p>
                                    {hasSelectableItems ? (
                                      <button
                                        onClick={() => handleDownloadAllInOrder(order)}
                                        disabled={bulkDownloading}
                                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${bulkDownloading
                                          ? 'border-blue-200 bg-blue-100 text-blue-300 cursor-not-allowed'
                                          : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
                                          }`}
                                      >
                                        <i className="ri-stack-line text-base" />
                                        {bulkDownloading ? t('mypage.purchases.downloading') : t('mypage.purchases.downloadAllInOrder')}
                                      </button>
                                    ) : null}
                                  </div>
                                </div>

                                {hasSelectableItems ? (
                                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        onClick={() => toggleSelectAllInOrder(order.id, order.order_items)}
                                        disabled={bulkDownloading}
                                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${bulkDownloading
                                          ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                          : 'border-gray-300 text-gray-700 hover:bg-white'
                                          }`}
                                      >
                                        <i className="ri-checkbox-multiple-line text-base" />
                                        {allSelectableSelected ? t('mypage.purchases.deselectAll') : t('mypage.purchases.selectAll')}
                                      </button>
                                      <button
                                        onClick={() => clearPurchaseSelection(order.id)}
                                        disabled={bulkDownloading || selectedCount === 0}
                                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${bulkDownloading || selectedCount === 0
                                          ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                          : 'border-gray-300 text-gray-700 hover:bg-white'
                                          }`}
                                      >
                                        <i className="ri-close-circle-line text-base" />
                                        {t('mypage.purchases.deselectAll')}
                                      </button>
                                      <span className="text-xs text-gray-500">
                                        {t('mypage.purchases.selected')} {selectedCount.toLocaleString('ko-KR')}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        onClick={() => handleDownloadSelectedInOrder(order)}
                                        disabled={bulkDownloading || selectedCount === 0}
                                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition ${bulkDownloading || selectedCount === 0
                                          ? 'bg-blue-300 cursor-not-allowed'
                                          : 'bg-blue-600 hover:bg-blue-700'
                                          }`}
                                      >
                                        <i className="ri-download-2-line text-base" />
                                        {bulkDownloading ? t('mypage.purchases.downloading') : t('mypage.purchases.downloadSelected')}
                                      </button>
                                    </div>
                                  </div>
                                ) : null}

                                <div className="space-y-3">
                                  {order.order_items.map((item) => {
                                    const downloadItem: DownloadableItem = {
                                      ...item,
                                      order_id: order.id,
                                      order_status: order.status,
                                      order_created_at: order.created_at,
                                    };
                                    const downloadKey = buildDownloadKey(downloadItem.order_id, downloadItem.id);
                                    const isDownloading = bulkDownloading || downloadingKeys.includes(downloadKey);
                                    const isSelectable = Boolean(item.sheet_id);
                                    const isSelected = isSelectable && orderSelectedIds.includes(item.id);

                                    return (
                                      <div
                                        key={item.id}
                                        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${isSelected
                                          ? 'border-blue-300 bg-blue-50/70 shadow-sm'
                                          : 'border-gray-100 bg-gray-50'
                                          }`}
                                      >
                                        <div className="flex items-center gap-3">
                                          <input
                                            type="checkbox"
                                            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={isSelectable ? isSelected : false}
                                            onChange={() => togglePurchaseSelection(order.id, item.id)}
                                            disabled={!isSelectable || bulkDownloading}
                                          />
                                          <img
                                            src={
                                              item.drum_sheets?.thumbnail_url ||
                                              generateDefaultThumbnail(80, 80)
                                            }
                                            alt={item.drum_sheets?.title ?? '악보 썸네일'}
                                            className="w-16 h-16 rounded-lg object-cover"
                                            onError={(event) => {
                                              (event.target as HTMLImageElement).src = generateDefaultThumbnail(80, 80);
                                            }}
                                          />
                                          <div>
                                            <p className="text-sm text-gray-500">
                                              {item.drum_sheets?.categories?.name ?? t('mypage.purchases.categoryNotSet')}
                                            </p>
                                            <h5 className="font-semibold text-gray-900">
                                              {item.drum_sheets?.title ?? t('mypage.purchases.deletedSheet')}
                                            </h5>
                                            <p className="text-sm text-gray-500">{item.drum_sheets?.artist ?? '-'}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <span className="text-sm font-semibold text-gray-900">
                                            {order.payment_method === 'cash'
                                              ? `${(item.price ?? 0).toLocaleString('en-US')} P`
                                              : formatCurrency(item.price ?? 0)}
                                          </span>
                                          <button
                                            onClick={() => handleDownload(downloadItem)}
                                            disabled={isDownloading}
                                            className={`px-3 py-2 rounded-lg text-sm font-semibold text-white transition ${isDownloading
                                              ? 'bg-blue-300 cursor-not-allowed'
                                              : 'bg-blue-600 hover:bg-blue-700'
                                              }`}
                                          >
                                            {isDownloading ? t('mypage.purchases.downloading') : t('mypage.purchases.download')}
                                          </button>
                                          <button
                                            onClick={() => handleGoToSheet(item.drum_sheets?.slug || '', item.sheet_id)}
                                            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                          >
                                            {t('mypage.purchases.viewDetails')}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'favorites' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{t('mypage.favorites.title')}</h3>
                          <p className="text-sm text-gray-500">{t('mypage.favorites.description')}</p>
                        </div>
                        <p className="text-sm text-gray-500">{t('mypage.favorites.totalCount', { count: favorites.length })}</p>
                      </div>

                      {favorites.length === 0 ? (
                        <div className="py-16 text-center text-gray-500">
                          <i className="ri-heart-line text-4xl text-gray-300 mb-4" />
                          <p className="font-medium">{t('mypage.favorites.noFavorites')}</p>
                          <p className="text-sm">{t('mypage.favorites.addFavorites')}</p>
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                          {favorites.map((favorite) => (
                            <div key={favorite.id} className="border border-gray-100 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-3">
                                <img
                                  src={
                                    favorite.sheet?.thumbnail_url ||
                                    generateDefaultThumbnail(96, 96)
                                  }
                                  alt={favorite.sheet?.title ?? '악보 썸네일'}
                                  className="w-20 h-20 rounded-lg object-cover"
                                  onError={(event) => {
                                    (event.target as HTMLImageElement).src = generateDefaultThumbnail(96, 96);
                                  }}
                                />
                                <div className="min-w-0">
                                  <h4 className="font-semibold text-gray-900 truncate">
                                    {favorite.sheet?.title ?? t('mypage.favorites.deletedSheet')}
                                  </h4>
                                  <p className="text-sm text-gray-500 truncate">{favorite.sheet?.artist ?? '-'}</p>
                                  <p className="text-base font-bold text-blue-600 mt-1">
                                    {favorite.sheet ? formatCurrency(favorite.sheet.price) : '-'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => handleGoToSheet(favorite.sheet?.slug || '', favorite.sheet_id)}
                                  className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                                >
                                  {t('mypage.favorites.viewDetails')}
                                </button>
                                <button
                                  onClick={() => handleAddToCart(favorite.sheet_id)}
                                  className={`flex-1 min-w-[120px] px-3 py-2 rounded-lg text-sm font-semibold border ${isInCart(favorite.sheet_id)
                                    ? 'border-green-200 bg-green-50 text-green-600 cursor-not-allowed'
                                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                    }`}
                                  disabled={isInCart(favorite.sheet_id)}
                                >
                                  {isInCart(favorite.sheet_id) ? t('mypage.favorites.inCart') : t('mypage.favorites.cart')}
                                </button>
                                <button
                                  onClick={() => handleFavoriteRemove(favorite.sheet_id)}
                                  className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50"
                                >
                                  {t('mypage.favorites.removeFavorite')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'inquiries' && (
                    <div className="space-y-6">
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{t('mypage.inquiries.title')}</h3>
                          <p className="text-sm text-gray-500">
                            {t('mypage.inquiries.description')}
                          </p>
                        </div>

                        <form className="space-y-5" onSubmit={handleInquirySubmit}>
                          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            <div>
                              <label htmlFor="inquiry-name" className="block text-sm font-medium text-gray-700 mb-2">
                                {t('mypage.inquiries.name')} *
                              </label>
                              <input
                                id="inquiry-name"
                                name="name"
                                type="text"
                                value={inquiryForm.name}
                                onChange={handleInquiryInputChange}
                                required
                                disabled={inquirySubmitting}
                                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                placeholder={t('mypage.inquiries.namePlaceholder')}
                              />
                            </div>
                            <div>
                              <label htmlFor="inquiry-email" className="block text-sm font-medium text-gray-700 mb-2">
                                {t('mypage.inquiries.email')} *
                              </label>
                              <input
                                id="inquiry-email"
                                name="email"
                                type="email"
                                value={inquiryForm.email}
                                onChange={handleInquiryInputChange}
                                required
                                disabled={inquirySubmitting}
                                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                placeholder={t('mypage.inquiries.emailPlaceholder')}
                              />
                            </div>
                          </div>

                          <div>
                            <label htmlFor="inquiry-category" className="block text-sm font-medium text-gray-700 mb-2">
                              {t('mypage.inquiries.category')} *
                            </label>
                            <select
                              id="inquiry-category"
                              name="category"
                              value={inquiryForm.category}
                              onChange={handleInquiryInputChange}
                              required
                              disabled={inquirySubmitting}
                              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                            >
                              <option value="">{t('mypage.inquiries.categoryPlaceholder')}</option>
                              <option value="주문/결제">{t('mypage.inquiries.categories.orderPayment')}</option>
                              <option value="악보/다운로드">{t('mypage.inquiries.categories.sheetDownload')}</option>
                              <option value="주문제작">{t('mypage.inquiries.categories.customOrder')}</option>
                              <option value="기술지원">{t('mypage.inquiries.categories.technical')}</option>
                              <option value="기타">{t('mypage.inquiries.categories.other')}</option>
                            </select>
                          </div>

                          <div>
                            <label htmlFor="inquiry-subject" className="block text-sm font-medium text-gray-700 mb-2">
                              {t('mypage.inquiries.subject')} *
                            </label>
                            <input
                              id="inquiry-subject"
                              name="subject"
                              type="text"
                              value={inquiryForm.subject}
                              onChange={handleInquiryInputChange}
                              required
                              disabled={inquirySubmitting}
                              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                              placeholder={t('mypage.inquiries.subjectPlaceholder')}
                            />
                          </div>

                          <div>
                            <label htmlFor="inquiry-message" className="block text-sm font-medium text-gray-700 mb-2">
                              {t('mypage.inquiries.message')} *
                            </label>
                            <textarea
                              id="inquiry-message"
                              name="message"
                              value={inquiryForm.message}
                              onChange={handleInquiryInputChange}
                              required
                              disabled={inquirySubmitting}
                              rows={6}
                              maxLength={500}
                              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 resize-none"
                              placeholder={t('mypage.inquiries.messagePlaceholder')}
                            />
                            <div className="mt-1 text-right text-xs text-gray-400">
                              {inquiryForm.message.length}/500{t('mypage.inquiries.characters')}
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={inquirySubmitting}
                            className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-blue-300"
                          >
                            {inquirySubmitting ? t('mypage.inquiries.submitting') : t('mypage.inquiries.submit')}
                          </button>
                        </form>
                      </div>

                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h3 className="text-xl font-bold text-gray-900">{t('mypage.inquiries.history.title')}</h3>
                            <p className="text-sm text-gray-500">{t('mypage.inquiries.history.description')}</p>
                          </div>
                          <span className="text-sm text-gray-500">{t('mypage.inquiries.history.total', { count: userInquiries.length })}</span>
                        </div>

                        {inquiriesLoading ? (
                          <div className="py-16 text-center text-gray-500 border border-dashed border-gray-200 rounded-xl">
                            <p className="font-medium">{t('mypage.inquiries.history.loading')}</p>
                          </div>
                        ) : userInquiries.length === 0 ? (
                          <div className="py-16 text-center text-gray-500 border border-dashed border-gray-200 rounded-xl">
                            <i className="ri-question-answer-line text-4xl text-gray-300 mb-4" />
                            <p className="font-medium">{t('mypage.inquiries.history.noInquiries')}</p>
                            <p className="text-sm">{t('mypage.inquiries.history.noInquiriesDescription')}</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {userInquiries.map((inquiry) => (
                              <div key={inquiry.id} className="border border-gray-100 rounded-xl p-5 space-y-4">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                                      {inquiry.category || t('mypage.inquiries.history.category')}
                                    </span>
                                    {renderInquiryStatusBadge(inquiry.status)}
                                  </div>
                                  <span className="text-xs text-gray-400">
                                    {t('mypage.inquiries.history.received')} {formatDateTime(inquiry.created_at)}
                                  </span>
                                </div>

                                <div>
                                  <h4 className="text-lg font-semibold text-gray-900">{inquiry.title}</h4>
                                  <div className="mt-2 rounded-lg bg-gray-50 p-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                                    {inquiry.content}
                                  </div>
                                </div>

                                {inquiry.admin_reply ? (
                                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                                    <div className="flex flex-col gap-1 text-sm text-blue-700 md:flex-row md:items-center md:justify-between">
                                      <span className="font-semibold">{t('mypage.inquiries.history.adminReply')}</span>
                                      {inquiry.replied_at ? (
                                        <span className="text-xs text-blue-500">
                                          {t('mypage.inquiries.history.replied')} {formatDateTime(inquiry.replied_at)}
                                        </span>
                                      ) : null}
                                    </div>
                                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-blue-900">
                                      {inquiry.admin_reply}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                                    {t('mypage.inquiries.history.preparing')}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'custom-orders' && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{t('mypage.customOrders.title')}</h3>
                          <p className="text-sm text-gray-500">{t('mypage.customOrders.description')}</p>
                        </div>
                        <button
                          onClick={() => router.push('/custom-order')}
                          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                        >
                          {t('mypage.customOrders.newOrderRequest')}
                        </button>
                      </div>

                      {customOrders.length === 0 ? (
                        <div className="py-16 text-center text-gray-500">
                          <i className="ri-file-text-line text-4xl text-gray-300 mb-4" />
                          <p className="font-medium">{t('mypage.customOrders.noOrders')}</p>
                          <p className="text-sm">{t('mypage.customOrders.serviceDescription')}</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {customOrders.map((order) => (
                            <div key={order.id} className="border border-gray-100 rounded-xl p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                <div>
                                  <h4 className="text-lg font-semibold text-gray-900">{order.song_title}</h4>
                                  <p className="text-sm text-gray-500">{order.artist}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  {renderCustomOrderStatusBadge(order.status)}
                                  <p className="text-sm font-semibold text-gray-900">
                                    {order.status === 'quoted' && order.estimated_price
                                      ? formatCurrency(order.estimated_price)
                                      : order.status === 'quoted' && !order.estimated_price
                                        ? t('mypage.customOrders.quoteConfirm')
                                        : order.status === 'completed' && !order.estimated_price
                                          ? t('mypage.customOrders.workCompleted')
                                          : order.estimated_price
                                            ? formatCurrency(order.estimated_price)
                                            : t('mypage.customOrders.quotePending')}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
                                <span>{t('mypage.customOrders.requestDate')} {formatDateTime(order.created_at)}</span>
                                <span>{t('mypage.customOrders.lastUpdate')} {formatDateTime(order.updated_at)}</span>
                              </div>
                              <div className="mt-4 flex justify-end">
                                <button
                                  onClick={() => router.push(`/custom-order-detail/${order.id}`)}
                                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                >
                                  <i className="ri-chat-1-line"></i>
                                  {t('mypage.customOrders.viewDetails')}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </section>
            </div>
          )}
        </main>
      </div>

      <button
        onClick={() => router.push('/cart')}
        className="hidden md:fixed md:bottom-6 md:right-6 md:z-40 md:flex items-center gap-2 rounded-full bg-blue-600 text-white px-5 py-3 shadow-lg hover:bg-blue-700"
      >
        <i className="ri-shopping-cart-line text-lg" />
        {t('mypage.cart')}
        {cartItems.length > 0 ? (
          <span className="ml-2 rounded-full bg-white text-blue-600 text-xs font-bold px-2 py-0.5">
            {cartItems.length}
          </span>
        ) : null}
      </button>
    </div>
  );
}
