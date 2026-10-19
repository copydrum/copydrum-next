'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import Footer from '@/components/common/Footer';
import PurchaseOrderList from '@/components/purchase/PurchaseOrderList';
import InquiryForm from '@/components/support/InquiryForm';
import MyBookPurchaseList from '@/components/myBook/MyBookPurchaseList';
import { countPurchasedSheets, loadPurchaseOrders } from '@/lib/purchases/purchaseOrders';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import MainHeader from '../../components/common/MainHeader';
import PasswordSettingsCard from '../../components/account/PasswordSettingsCard';
import { useCart } from '../../hooks/useCart';
import type { FavoriteSheet } from '../../lib/favorites';
import { fetchUserFavorites, removeFavorite } from '../../lib/favorites';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { getUserDisplayName } from '../../utils/userDisplayName';
import { useUserCredits } from '../../hooks/useUserCredits';
import { useRewardPoints } from '../../hooks/useRewardPoints';
import PointsPanel from '../../components/points/PointsPanel';
import { useMembership } from '../../hooks/useMembership';
import MembershipCard from '../../components/membership/MembershipCard';
import { formatRewardPoints, formatWalletAmount } from '../../lib/wallet/display';
import { openCashChargeModal } from '../../lib/cashChargeModal';

type TabKey = 'profile' | 'purchases' | 'favorites' | 'inquiries' | 'custom-orders' | 'points';

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

interface CustomOrderSummary {
  id: string;
  song_title: string;
  artist: string;
  status: string;
  estimated_price: number | null;
  locale: string | null;
  created_at: string;
  updated_at: string;
}

const formatDate = (value: MaybeDateString) => (value ? new Date(value).toLocaleDateString('ko-KR') : '-');
const formatDateTime = (value: MaybeDateString) => (value ? new Date(value).toLocaleString('ko-KR') : '-');

export default function MyPage() {
  const router = useLocaleRouter();
  const searchParams = useSearchParams();
  const { addToCart, isInCart } = useCart();
  const { t, i18n } = useTranslation();

  // user 상태를 최상단에 선언 (다른 훅에서 사용하기 전에 선언 필요)
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);
  const { credits, isLoading: creditsLoading, refresh: refreshCredits } = useUserCredits(user);
  const rewardPoints = useRewardPoints(user?.id);
  const { membership } = useMembership(user?.id);

  const formatCurrency = useCallback(
    (value: number) => {
      const converted = convertFromKrw(value, currency, i18n.language);
      return formatCurrencyUtil(converted, currency);
    },
    [currency, i18n.language],
  );

  // Status maps using t()
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


  const getTabs = useCallback((): { id: TabKey; label: string; icon: string }[] => [
    { id: 'purchases', label: t('mypage.tabs.purchases.label'), icon: 'ri-download-cloud-2-line' },
    { id: 'favorites', label: t('mypage.tabs.favorites.label'), icon: 'ri-heart-line' },
    { id: 'custom-orders', label: t('mypage.tabs.customOrders.label'), icon: 'ri-file-text-line' },
    { id: 'inquiries', label: t('mypage.tabs.inquiries.label'), icon: 'ri-question-answer-line' },
    { id: 'points', label: t('mypage.tabs.points.label'), icon: 'ri-coins-line' },
    { id: 'profile', label: t('mypage.tabs.profile.label'), icon: 'ri-user-settings-line' },
  ], [t]);

  // URL 쿼리 파라미터에서 탭 정보 읽기
  const getInitialTab = useCallback((): TabKey => {
    const tabParam = searchParams.get('tab') || searchParams.get('section');
    if (
      tabParam &&
      ['profile', 'purchases', 'favorites', 'inquiries', 'custom-orders', 'points'].includes(tabParam)
    ) {
      return tabParam as TabKey;
    }
    // section 파라미터 매핑 (기존 호환성 유지)
    const sectionParam = searchParams.get('section');
    if (sectionParam === 'profile') return 'profile';
    if (sectionParam === 'inquiries') return 'inquiries';
    return 'purchases';
  }, [searchParams]);

  const initialTab = useMemo(() => getInitialTab(), [getInitialTab]);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [profileForm, setProfileForm] = useState({ name: '', phone: '' });
  const [profileSaving, setProfileSaving] = useState(false);

  const [totalPurchasedSheets, setTotalPurchasedSheets] = useState(0);
  const [favorites, setFavorites] = useState<FavoriteSheet[]>([]);
  const [customOrders, setCustomOrders] = useState<CustomOrderSummary[]>([]);
  const [userInquiries, setUserInquiries] = useState<CustomerInquiry[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const loadUserInquiries = useCallback(async (currentUser: User) => {
    setInquiriesLoading(true);
    try {
      const { data, error } = await supabase
        .from('customer_inquiries')
        .select('id, category, title, content, subject, message, status, admin_reply, replied_at, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const normalized = (data ?? []).map((item: any) => ({
        id: item.id as string,
        category: item.category ?? '',
        // 예전 고객센터 양식은 subject/message 에만 저장했다
        title: item.title || item.subject || '',
        content: item.content || item.message || '',
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

  // 구매 목록 자체는 PurchaseOrderList 가 그리고, 여기서는 요약에 쓸 곡 수만 구한다
  const loadOrders = useCallback(async (currentUser: User) => {
    const purchaseOrders = await loadPurchaseOrders(currentUser.id);
    setTotalPurchasedSheets(countPurchasedSheets(purchaseOrders));
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
        .select('*')
        .eq('user_id', currentUser.id)
        // 나만의 악보집은 구매내역에서 보여 준다
        .or('order_type.is.null,order_type.neq.book')
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
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!isMounted) return;

      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        // Supabase 인증 콜백 내부에서 직접 DB 쿼리를 호출하면 인증 잠금과 충돌해
        // 교착(deadlock)이 발생할 수 있으므로, setTimeout으로 콜백 실행 컨텍스트 밖에서 처리한다.
        setTimeout(() => {
          if (!isMounted) return;

          if (event === 'USER_UPDATED') {
            setLoading(true);
            Promise.allSettled([loadProfile(nextUser)]).finally(() => {
              if (isMounted) setLoading(false);
            });
            return;
          }

          loadAll(nextUser);
        }, 0);
      } else {
        setProfile(null);
        setProfileForm({ name: '', phone: '' });
        setTotalPurchasedSheets(0);
        setFavorites([]);
        setCustomOrders([]);
        setUserInquiries([]);
        setInquiriesLoading(false);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadAll, loadProfile]);

  const stats = useMemo(
    (): { label: string; value: number; tab: TabKey }[] => [
      { label: t('mypage.stats.purchasedSheets'), value: totalPurchasedSheets, tab: 'purchases' },
      { label: t('mypage.stats.favoriteSheets'), value: favorites.length, tab: 'favorites' },
      { label: t('mypage.stats.customOrders'), value: customOrders.length, tab: 'custom-orders' },
      { label: t('mypage.stats.inquiries'), value: userInquiries.length, tab: 'inquiries' },
    ],
    [totalPurchasedSheets, favorites.length, userInquiries.length, customOrders.length, t]
  );

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    router.push(`/categories?search=${encodeURIComponent(searchQuery.trim())}`);
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
          onClick={() => router.push('/auth/register')}
          className="px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition"
        >
          {t('mypage.guest.signup')}
        </button>
      </div>
    </div>
  );

  const displayName =
    profile?.name?.trim() ||
    getUserDisplayName(profile as Parameters<typeof getUserDisplayName>[0], profile?.email || null);
  const tabs = getTabs();

  /** 탭 전환은 URL(?tab=)에도 남겨 새로고침·공유 시 같은 탭이 열리게 한다 */
  const selectTab = (tab: TabKey, scrollToContent = false) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    params.delete('section');
    window.history.replaceState({ ...window.history.state }, '', `${window.location.pathname}?${params.toString()}`);
    if (scrollToContent) {
      document.getElementById('mypage-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>

      <div>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-12 md:py-10">
          {loading ? (
            renderLoader()
          ) : !user ? (
            renderGuestState()
          ) : (
            <div className="space-y-6 md:space-y-8">
              <h2 className="text-2xl font-extrabold text-gray-900 md:text-3xl">{t('mypage.title')}</h2>

              <section>
                <div className="grid gap-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:grid-cols-2 md:gap-8 md:p-6">
                  <div className="flex flex-col justify-between gap-5">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-pink-500 text-xl font-bold text-white">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-bold text-gray-900">{displayName}</h3>
                        <p className="truncate text-sm text-gray-500">{profile?.email}</p>
                        <p className="mt-0.5 text-xs text-gray-400">{t('mypage.profile.joinedOn')} {formatDate(profile?.created_at)}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 divide-x divide-gray-100 rounded-2xl border border-gray-100">
                      {stats.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => selectTab(item.tab, true)}
                          className="flex flex-col items-center gap-0.5 px-1 py-3 transition-colors hover:bg-gray-50 first:rounded-l-2xl last:rounded-r-2xl"
                        >
                          <span className="text-lg font-extrabold text-gray-900">{item.value.toLocaleString()}</span>
                          <span className="text-center text-[11px] leading-tight text-gray-500">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 보유 포인트·캐쉬 (해외는 Rewards·Credits 를 달러로 표시) */}
                  <div className="space-y-4 rounded-2xl bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">{t('mypage.profile.cashBalance')}</p>
                        <p className="text-xl font-extrabold text-gray-900">
                          {creditsLoading ? '-' : formatWalletAmount(credits, i18n.language)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openCashChargeModal({ onCharged: () => refreshCredits() })}
                        className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        {t('mypage.profile.chargeCash')}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-gray-200/70 pt-4">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">{t('mypage.points.balance')}</p>
                        <p className="text-xl font-extrabold text-gray-900">
                          {formatRewardPoints(rewardPoints.balance, i18n.language)}
                        </p>
                        {rewardPoints.expiringSoon > 0 && (
                          <p className="text-xs text-rose-600">
                            {t('mypage.points.expiringSoon')} {formatRewardPoints(rewardPoints.expiringSoon, i18n.language)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => selectTab('points', true)}
                        className="flex shrink-0 items-center text-sm font-semibold text-gray-600 hover:text-gray-900"
                      >
                        {t('mypage.points.viewHistory')}
                        <i className="ri-arrow-right-s-line text-base" />
                      </button>
                    </div>
                    {membership && (
                      <div className="border-t border-gray-200/70 pt-4">
                        <MembershipCard membership={membership} compact />
                      </div>
                    )}
                  </div>
                </div>

              </section>

              <section id="mypage-content" className="grid scroll-mt-[120px] grid-cols-1 gap-4 md:scroll-mt-[140px] lg:grid-cols-4 lg:gap-8">
                {/* 모바일·태블릿: 가로로 넘기는 탭 */}
                <nav
                  aria-label={t('mypage.title')}
                  className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => selectTab(tab.id)}
                      aria-current={activeTab === tab.id ? 'page' : undefined}
                      className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                        activeTab === tab.id ? 'bg-ink text-white' : 'border border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      <i className={`${tab.icon} text-base`} />
                      {tab.label}
                    </button>
                  ))}
                </nav>

                {/* PC: 왼쪽 세로 메뉴 */}
                <aside className="hidden lg:col-span-1 lg:block">
                  <nav aria-label={t('mypage.title')} className="sticky top-[140px] space-y-1 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => selectTab(tab.id)}
                        aria-current={activeTab === tab.id ? 'page' : undefined}
                        className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] transition-colors ${
                          activeTab === tab.id ? 'bg-blue-50 font-bold text-blue-700' : 'font-medium text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <i className={`${tab.icon} text-lg ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}`} />
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </aside>

                <section className="min-w-0 lg:col-span-3">
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

                      <div className="mt-8 pt-8 border-t border-gray-200">
                        <PasswordSettingsCard />
                      </div>

                      {/* 회원탈퇴: 자주 쓰는 기능이 아니라 접어 둔다 */}
                      <details className="mt-8 border-t border-gray-100 pt-6">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm text-gray-400 hover:text-gray-600 [&::-webkit-details-marker]:hidden">
                          {t('mypage.deleteAccount.title')}
                          <i className="ri-arrow-down-s-line" />
                        </summary>
                        <div className="mt-3 rounded-xl bg-gray-50 p-4">
                          <p className="mb-3 text-sm text-gray-600">{t('mypage.deleteAccount.description')}</p>
                          <button
                            type="button"
                            onClick={handleDeleteAccount}
                            disabled={deletingAccount}
                            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingAccount ? t('mypage.deleteAccount.processing') : t('mypage.deleteAccount.button')}
                          </button>
                        </div>
                      </details>
                    </div>
                  )}

                  {activeTab === 'purchases' && user && (
                    <div className="space-y-4">
                      <MyBookPurchaseList userId={user.id} />
                      <PurchaseOrderList user={user} />
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

                        <InquiryForm
                          user={user}
                          showHistoryLink={false}
                          onSubmitted={() => {
                            if (user) void loadUserInquiries(user);
                          }}
                        />
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
                                  <h4 className="text-lg font-semibold text-gray-900">
                                    {(order as any).order_type === 'book' && (
                                      <span className="mr-2 inline-block rounded-md bg-indigo-100 px-2 py-0.5 align-middle text-xs font-bold text-indigo-700">
                                        {t('myBook.order.badge', '악보집')}
                                      </span>
                                    )}
                                    {order.song_title}
                                  </h4>
                                  <p className="text-sm text-gray-500">{order.artist}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  {renderCustomOrderStatusBadge(order.status)}
                                  <p className="text-sm font-semibold text-gray-900">
                                    {order.status === 'quoted' && order.estimated_price
                                      ? (order.locale && order.locale !== 'ko' ? `$${order.estimated_price}` : formatCurrency(order.estimated_price))
                                      : order.status === 'quoted' && !order.estimated_price
                                        ? t('mypage.customOrders.quoteConfirm')
                                        : order.status === 'completed' && !order.estimated_price
                                          ? t('mypage.customOrders.workCompleted')
                                          : order.estimated_price
                                            ? (order.locale && order.locale !== 'ko' ? `$${order.estimated_price}` : formatCurrency(order.estimated_price))
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

                  {activeTab === 'points' && user && <PointsPanel userId={user.id} />}
                </section>
              </section>
            </div>
          )}
        </main>
      </div>

      <Footer />
    </div>
  );
}
