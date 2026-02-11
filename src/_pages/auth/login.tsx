'use client';
import Link from 'next/link';

import { useState, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { getSiteUrl } from '../../lib/siteUrl';
import Footer from '../../components/common/Footer';
import MainHeader from '../../components/common/MainHeader';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { removeLocaleFromPathname } from '@/lib/localeUrl';

// 이전 경로를 가져오는 헬퍼 함수
const getRedirectPath = (): string => {
  if (typeof window === 'undefined') return '/';
  
  // 1. URL 쿼리 파라미터에서 확인 (예: /login?from=/sheet-detail/123)
  const urlParams = new URLSearchParams(window.location.search);
  const fromParam = urlParams.get('from');
  if (fromParam) {
    return fromParam;
  }
  
  // 2. localStorage에서 확인
  const storedPath = localStorage.getItem('auth_redirect_path');
  if (storedPath) {
    return storedPath;
  }
  
  // 3. 기본값: 홈
  return '/';
};

// 이전 경로를 저장하는 헬퍼 함수
const saveRedirectPath = (path: string) => {
  if (typeof window === 'undefined') return;
  // 로그인 페이지 자체는 저장하지 않음
  if (path && !path.includes('/login') && !path.includes('/auth/login')) {
    localStorage.setItem('auth_redirect_path', path);
  }
};

export default function Login() {
  const { t } = useTranslation();
  const router = useLocaleRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    // 로그인 페이지 진입 시 이전 경로 저장
    const currentPath = pathname + window.location.search;
    const fromParam = searchParams.get('from');
    
    if (fromParam) {
      // 쿼리 파라미터로 전달된 경로 저장
      saveRedirectPath(fromParam);
    } else {
      // 현재 경로가 로그인 페이지가 아니면 저장 (뒤로가기 등으로 진입한 경우)
      const referrer = document.referrer;
      if (referrer) {
        try {
          const referrerUrl = new URL(referrer);
          const referrerPath = referrerUrl.pathname + referrerUrl.search;
          if (referrerPath && !referrerPath.includes('/login') && !referrerPath.includes('/auth/login')) {
            saveRedirectPath(referrerPath);
          }
        } catch (e) {
          // referrer 파싱 실패 시 무시
        }
      }
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    // 모바일 환경에서만 로그인 페이지 진입 시 스크롤을 최상단으로 이동
    if (typeof window !== 'undefined') {
      const isMobile = window.innerWidth < 768;
      
      if (isMobile) {
        // setTimeout을 사용하여 DOM이 완전히 렌더링된 후 스크롤 이동
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }, 0);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // A. 페이지 진입 시 세션 확인
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      if (data.session?.user) {
        const redirectPath = getRedirectPath();
        router.replace(redirectPath);
      }
    });

    // B. OAuth 로그인 직후 세션 변화를 감지
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      if (session?.user) {
        const redirectPath = getRedirectPath();
        router.replace(redirectPath);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleKakaoLogin = async () => {
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
        console.error(t('authLogin.console.kakaoLoginError'), error);
        alert(t('authLogin.errors.kakaoLoginFailed'));
      }
    } catch (err) {
      console.error(t('authLogin.console.kakaoLoginError'), err);
      alert(t('authLogin.errors.kakaoLoginFailed'));
    }
  };

  const handleGoogleLogin = async () => {
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
        console.error(t('authLogin.console.googleLoginError'), error);
        alert(t('authLogin.errors.googleLoginFailed'));
      }
    } catch (err) {
      console.error(t('authLogin.console.googleLoginError'), err);
      alert(t('authLogin.errors.googleLoginFailed'));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

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
        // 사용자 프로필 정보 가져오기
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profileError) {
          console.error(t('authLogin.console.profileLookupError'), profileError);
          
          // 프로필이 없으면 기본 프로필 생성 (최소한의 필드만 사용: id, email만)
          if (profileError.code === 'PGRST116') {
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: data.user.id,
                email: data.user.email || ''
              });
            
            if (insertError) {
              // 프로필 생성 실패해도 로그인은 계속 진행
              console.error('프로필 생성 오류:', insertError);
            }
          }
        }

        // 로그인 성공 시 이전 경로로 이동 (없으면 홈)
        const redirectPath = getRedirectPath();
        // localStorage에서 경로 제거 (한 번만 사용)
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_redirect_path');
          const currentOrigin = window.location.origin;
          window.location.replace(`${currentOrigin}${redirectPath}`);
        } else {
          router.push(redirectPath);
        }
      }
    } catch (err: any) {
      console.error(t('authLogin.console.loginError'), err);
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
              console.error(t('authLogin.console.resetPasswordEmailError'), resetError);
              setError(t('authLogin.errors.resetPasswordEmailError'));
            } else {
              setInfo(t('authLogin.messages.passwordResetEmailSent'));
            }
            return;
          }

          if (profileError && profileError.code !== 'PGRST116') {
            console.error(t('authLogin.console.profileLookupError'), profileError);
          }
        } catch (migrationError) {
          console.error(t('authLogin.console.migrationCheckError'), migrationError);
        }

        setError(t('authLogin.errors.invalidCredentials'));
      } else if (err.message.includes('Email not confirmed')) {
        setError(t('authLogin.errors.emailNotConfirmed'));
      } else {
        setError(t('authLogin.errors.loginFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <MainHeader />

      <main className="flex-1 flex flex-col items-center py-12 sm:px-6 lg:px-8">
        <div className="w-full sm:max-w-md">
          <div className="mb-6">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {t('authLogin.notice')}
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900">{t('authLogin.title')}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {t('authLogin.noAccount')}{' '}
              <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer">
                {t('authLogin.signUp')}
              </Link>
            </p>
          </div>

          <div className="mt-8">
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <form className="space-y-6" onSubmit={handleLogin}>
                {info && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md text-sm">
                    {info}
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    {t('authLogin.form.email')}
                  </label>
                  <div className="mt-1">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder={t('authLogin.form.emailPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    {t('authLogin.form.password')}
                  </label>
                  <div className="mt-1">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder={t('authLogin.form.passwordPlaceholder')}
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900 cursor-pointer">
                      {t('authLogin.form.rememberMe')}
                    </label>
                  </div>

                  <div className="text-sm">
                    <Link 
                      href="/auth/forgot-password"
                      className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer underline"
                    >
                      {t('authLogin.form.forgotPassword')}
                    </Link>
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
                  >
                    {loading ? (
                      <div className="flex items-center">
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        {t('authLogin.form.submitting')}
                      </div>
                    ) : (
                      t('authLogin.form.submit')
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">{t('authLogin.divider')}</span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 cursor-pointer"
                  >
                    <i className="ri-google-fill text-red-500 text-lg"></i>
                    <span className="ml-2">{t('authLogin.social.google')}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={handleKakaoLogin}
                    className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 cursor-pointer"
                  >
                    <i className="ri-kakao-talk-fill text-yellow-500 text-lg"></i>
                    <span className="ml-2">{t('authLogin.social.kakao')}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-16">
        <Footer />
      </footer>
    </div>
  );
}
