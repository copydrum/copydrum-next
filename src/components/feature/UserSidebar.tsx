'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../lib/supabase';
import { getSiteUrl } from '../../lib/siteUrl';
import { googleAuth } from '../../lib/google';
import type { User } from '@supabase/supabase-js';
import { usePathname } from 'next/navigation';
import { useCart } from '../../hooks/useCart';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency } from '../../lib/currency';
import { getUserDisplayName } from '../../utils/userDisplayName';

interface UserSidebarProps {
  user: User | null;
}

export default function UserSidebar({ user }: UserSidebarProps) {
  const [profile, setProfile] = useState<Profile | null>(null);

  // 로그인 폼 상태
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginInfo, setLoginInfo] = useState('');
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const router = useLocaleRouter();
  const { i18n, t } = useTranslation();

  const { cartItems } = useCart();

  // 통합 통화 로직 적용 (locale 기반)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = useMemo(() => getSiteCurrency(hostname, i18n.language), [hostname, i18n.language]);
  const isGlobalSite = currency !== 'KRW';

  const handleLogout = async () => {
    try {
      // 구글 로그아웃
      if (googleAuth.isLoggedIn()) {
        googleAuth.logout();
      }

      // Supabase 로그아웃
      await supabase.auth.signOut();
      window.location.reload();
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    setLoginInfo('');

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      if (data.user) {
        window.location.reload();
      }
    } catch (err: any) {
      console.error('로그인 오류:', err);
      if (err.message?.includes('Invalid login credentials')) {
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('migrated_at')
            .eq('email', normalizedEmail)
            .maybeSingle();

          if (!profileError && profile?.migrated_at) {
            const redirectBase = getSiteUrl();
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
              redirectTo: `${redirectBase}/auth/reset-password`,
            });

            if (resetError) {
              console.error('비밀번호 재설정 메일 발송 오류:', resetError);
              setLoginError(t('sidebar.loginError.resetFailed'));
            } else {
              setLoginInfo(t('sidebar.loginInfo.resetSent'));
            }
            return;
          }

          if (profileError && profileError.code !== 'PGRST116') {
            console.error('프로필 조회 오류:', profileError);
          }
        } catch (checkError) {
          console.error('마이그레이션 사용자 확인 오류:', checkError);
        }

        setLoginError(t('sidebar.loginError.invalidCredentials'));
      } else if (err.message.includes('Email not confirmed')) {
        setLoginError(t('sidebar.loginError.emailConfirmation'));
      } else {
        setLoginError(t('sidebar.loginError.generic'));
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleKakaoLogin = async () => {
    setKakaoLoading(true);
    setLoginError('');

    try {
      // 현재 호스트를 유지하여 리다이렉트
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://copydrum.com';
      const redirectUrl = `${currentOrigin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: redirectUrl,
        },
      });

      if (error) {
        console.error('카카오 로그인 오류:', error);
        setLoginError(t('sidebar.loginError.kakao'));
        setKakaoLoading(false);
      }
      // 성공 시 리다이렉트되므로 여기서는 아무것도 하지 않음
    } catch (error: any) {
      console.error('카카오 로그인 오류:', error);
      setLoginError(error.message || t('sidebar.loginError.kakaoFailed'));
      setKakaoLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setLoginError('');

    try {
      // 현재 호스트를 유지하여 리다이렉트
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://copydrum.com';
      const currentHost = typeof window !== 'undefined' ? window.location.host : 'copydrum.com';

      // 원래 호스트를 localStorage에 저장 (콜백에서 확인용)
      if (typeof window !== 'undefined') {
        localStorage.setItem('oauth_original_host', currentHost);
      }

      const redirectUrl = `${currentOrigin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            // 추가 파라미터로 호스트 정보 전달 (Supabase가 무시할 수 있지만 시도)
            host: currentHost,
          },
        },
      });

      if (error) {
        console.error('구글 로그인 오류:', error);
        setLoginError(t('sidebar.loginError.google'));
        setGoogleLoading(false);
      }
      // 성공 시 리다이렉트되므로 여기서는 아무것도 하지 않음
    } catch (error: any) {
      console.error('구글 로그인 오류:', error);
      setLoginError(error.message || t('sidebar.loginError.googleFailed'));
      setGoogleLoading(false);
    }
  };

  const handleCustomerSupportClick = () => {
    router.push('/customer-support');
  };

  const handleNavigate = useCallback(
    (path: string) => {
      if (!path) {
        return;
      }
      router.push(path);
    },
    [router],
  );

  const handleKakaoChatClick = useCallback(() => {
    window.open('https://pf.kakao.com/_Hbxezxl/chat', '_blank', 'noopener,noreferrer');
  }, []);

  const sidebarMenuItems = useMemo(
    () => [
      {
        icon: 'ri-user-settings-line',
        label: t('sidebar.updateProfile'),
        onClick: () => handleNavigate('/mypage?section=profile'),
      },
      {
        icon: 'ri-shopping-cart-line',
        label: t('sidebar.cart'),
        onClick: () => handleNavigate('/cart'),
        badge: cartItems.length,
      },
      {
        icon: 'ri-file-list-3-line',
        label: t('sidebar.purchaseHistory'),
        onClick: () => handleNavigate('/my-orders'),
      },
      {
        icon: 'ri-edit-2-line',
        label: t('sidebar.customOrder'),
        onClick: () => handleNavigate('/custom-order'),
      },
      {
        icon: 'ri-user-line',
        label: t('sidebar.myPage'),
        onClick: () => handleNavigate('/mypage'),
      },
      {
        icon: 'ri-customer-service-2-line',
        label: t('sidebar.customerSupport'),
        onClick: () => handleNavigate('/customer-support'),
      },
      {
        icon: 'ri-question-answer-line',
        label: t('sidebar.inquiry'),
        onClick: () => handleNavigate('/mypage?section=inquiries'),
      },
      {
        icon: 'ri-question-line',
        label: t('sidebar.guide'),
        onClick: () => handleNavigate('/guide'),
      },
    ],
    [handleNavigate, t],
  );


  // 프로필 정보 로드
  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, email')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[UserSidebar] 프로필 조회 오류:', error);
        setProfile(null);
        return;
      }

      if (data) {
        setProfile(data as Profile);
      }
    } catch (error) {
      console.error('[UserSidebar] 프로필 로드 오류:', error);
      setProfile(null);
    }
  }, [user]);

  // 프로필 정보 로드
  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // 로그인하지 않은 경우 로그인 사이드바 표시
  if (!user) {
    return (
      <div className="hidden md:block">
        <div className="fixed top-0 right-0 h-full w-64 bg-white shadow-2xl z-50 border-l border-gray-200">
          {/* 헤더 */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white flex flex-col items-center justify-center" style={{ height: '156px' }}>
            <h2 className="text-lg font-bold text-center">{t('sidebar.loginTitle')}</h2>
            <p className="text-blue-100 text-xs text-center mt-1">{t('sidebar.loginDescription')}</p>
          </div>

          {/* 로그인 폼 */}
          <div className="p-4 h-full overflow-y-auto pb-16">
            <form onSubmit={handleLogin} className="space-y-4">
              {loginInfo && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-md text-xs">
                  {loginInfo}
                </div>
              )}

              {loginError && (
                <div className="space-y-2">
                  <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md text-xs">
                    {loginError}
                  </div>
                  <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 px-3 py-2 rounded-md">
                    {t('sidebar.migrationNotice1')}<br />
                    {t('sidebar.migrationNotice2')}
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('sidebar.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={t('sidebar.emailPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('sidebar.password')}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={t('sidebar.passwordPlaceholder')}
                />
              </div>

              <div className="flex items-center">
                <input
                  id="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900 cursor-pointer">
                  {t('sidebar.rememberMe')}
                </label>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {loginLoading ? (
                  <div className="flex items-center justify-center">
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    {t('sidebar.loggingIn')}
                  </div>
                ) : (
                  t('sidebar.login')
                )}
              </button>
            </form>

            {/* 소셜 로그인 */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-gray-500">{t('sidebar.or')}</span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {/* 카카오톡 로그인 버튼 (한국어 사이트에서만 표시) */}
                {!isGlobalSite && (
                  <button
                    onClick={handleKakaoLogin}
                    disabled={kakaoLoading}
                    className="w-full flex items-center justify-center py-3 px-4 bg-yellow-400 text-gray-900 rounded-md shadow-sm font-bold text-sm hover:bg-yellow-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {kakaoLoading ? (
                      <>
                        <i className="ri-loader-4-line animate-spin text-lg mr-2"></i>
                        {t('sidebar.kakaoLoggingIn')}
                      </>
                    ) : (
                      <>
                        <i className="ri-kakao-talk-fill text-lg mr-2"></i>
                        {t('sidebar.kakaoLogin')}
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  className="w-full flex items-center justify-center py-3 px-4 bg-white border border-gray-300 text-gray-700 rounded-md shadow-sm font-bold text-sm hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {googleLoading ? (
                    <>
                      <i className="ri-loader-4-line animate-spin text-lg mr-2"></i>
                      {t('sidebar.googleLoggingIn')}
                    </>
                  ) : (
                    <>
                      <i className="ri-google-fill text-red-500 text-lg mr-2"></i>
                      {t('sidebar.googleLogin')}
                    </>
                  )}
                </button>
              </div>

              {/* 링크들 */}
              <div className="mt-6 space-y-3">
                <a
                  href="/auth/register"
                  className="w-full flex items-center justify-center py-2 px-4 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 font-medium text-sm cursor-pointer"
                >
                  <i className="ri-user-add-line mr-2"></i>
                  {t('sidebar.register')}
                </a>

                <div className="flex space-x-2">
                  <a
                    href="/auth/forgot-password"
                    className="flex-1 text-center py-2 px-3 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md hover:bg-blue-50 cursor-pointer"
                  >
                    {t('sidebar.findId')}
                  </a>
                  <a
                    href="/auth/forgot-password"
                    className="flex-1 text-center py-2 px-3 text-xs text-white bg-blue-600 hover:bg-blue-700 border border-blue-600 rounded-md cursor-pointer"
                  >
                    {t('sidebar.findPassword')}
                  </a>
                </div>
              </div>

              {/* 고객센터 */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-3">{t('sidebar.needHelp')}</h3>
                <div className="space-y-2">
                  <button
                    onClick={handleCustomerSupportClick}
                    className="w-full flex items-center p-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md cursor-pointer"
                  >
                    <i className="ri-customer-service-2-line mr-2"></i>
                    {t('sidebar.customerSupport')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden md:block">
      {/* 사이드바 - 항상 표시, 더 좁은 너비 */}
      <div className="fixed top-0 right-0 h-full w-64 bg-white shadow-2xl z-50 border-l border-gray-200">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-white">
          <div className="mb-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{getUserDisplayName(profile, user?.email || null) || t('sidebar.user')}</h2>
              <button
                onClick={handleLogout}
                className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-white transition-colors cursor-pointer"
              >
                {t('sidebar.logout')}
              </button>
            </div>
            <p className="text-blue-100 text-xs">{user?.email}</p>
          </div>
        </div>

        {/* 메뉴 목록 */}
        <div className="flex-1 overflow-y-auto h-full pb-16">
          <div className="p-3 space-y-2">
            {sidebarMenuItems.map((item) => (
              <Fragment key={item.label}>
                <button
                  onClick={item.onClick}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer"
                >
                  <div className="flex items-center">
                    <i className={`${item.icon} text-gray-600 text-sm mr-3`}></i>
                    <span className="text-gray-800 text-sm">{item.label}</span>
                  </div>
                  {item.badge ? (
                    <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-600">
                      {item.badge}
                    </span>
                  ) : null}
                </button>

                {item.label === t('sidebar.guide') && !isGlobalSite && (
                  <div className="pt-2 pb-2">
                    <button
                      onClick={handleKakaoChatClick}
                      className="group w-full rounded-2xl border border-yellow-300 bg-gradient-to-r from-[#FEE500] to-[#FFD43B] p-3 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black/85 text-[#FEE500]">
                          <i className="ri-kakao-talk-fill text-lg"></i>
                        </div>
                        <span className="flex-1 text-center text-sm font-semibold text-gray-900">{t('sidebar.kakaoChat')}</span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/35 text-gray-900 transition-transform group-hover:translate-x-0.5">
                          <i className="ri-arrow-right-up-line text-base"></i>
                        </div>
                      </div>
                      <p className="mt-3 text-xs font-medium text-gray-900/80">
                        {t('sidebar.kakaoChatDescription')}
                      </p>
                    </button>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
