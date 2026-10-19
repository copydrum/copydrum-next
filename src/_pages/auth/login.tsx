'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { getSiteUrl } from '../../lib/siteUrl';
import Footer from '../../components/common/Footer';
import MainHeader from '../../components/common/MainHeader';
import LocaleLink from '@/components/common/LocaleLink';
import { useSignupBonus } from '../../components/auth/SignupBonus';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

/** 사이트 내부 경로만 허용 (`//evil.com`, `@evil.com` 같은 외부 이동 차단) */
const toSafePath = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null;
  return path;
};

const getRedirectParam = (params: URLSearchParams) =>
  toSafePath(params.get('from')) || toSafePath(params.get('redirect'));

// 이전 경로를 가져오는 헬퍼 함수
const getRedirectPath = (): string => {
  if (typeof window === 'undefined') return '/';

  // 1. URL 쿼리 파라미터에서 확인 (예: /login?from=/sheet-detail/123)
  const fromParam = getRedirectParam(new URLSearchParams(window.location.search));
  if (fromParam) return fromParam;

  // 2. localStorage에서 확인
  const storedPath = toSafePath(localStorage.getItem('auth_redirect_path'));
  if (storedPath) return storedPath;

  // 3. 기본값: 홈
  return '/';
};

// 이전 경로를 저장하는 헬퍼 함수
const saveRedirectPath = (path: string) => {
  if (typeof window === 'undefined') return;
  const safePath = toSafePath(path);
  // 로그인 페이지 자체는 저장하지 않음
  if (safePath && !safePath.includes('/login') && !safePath.includes('/auth/login')) {
    localStorage.setItem('auth_redirect_path', safePath);
  }
};

/** 결제 흐름에서 넘어온 경우 게스트 구매 영역을 펼쳐 둔다 */
const PURCHASE_FLOW_PATH = /\/(cart|checkout|payments|drum-sheet)(\/|\?|$)/;

const inputClass =
  'block h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-[15px] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

export default function Login() {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const signupBonus = useSignupBonus();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState('');
  const [showPasswordSetupHint, setShowPasswordSetupHint] = useState(false);
  const [setupMailSending, setSetupMailSending] = useState(false);
  const isKo = i18n.language === 'ko';
  const guestText = {
    title: isKo ? '회원가입 없이 구매하기' : 'Buy without signing up',
    desc: isKo
      ? '이메일만 입력하면 바로 결제하고 다운로드할 수 있어요. 결제 후 비밀번호 설정 메일을 보내드립니다.'
      : 'Just enter your email to pay and download right away. We’ll email you a link to set a password.',
    placeholder: isKo ? '이메일 주소' : 'Email address',
    button: isKo ? '게스트로 계속하기' : 'Continue as guest',
    invalidEmail: isKo ? '유효한 이메일을 입력해 주세요.' : 'Please enter a valid email.',
    exists: isKo
      ? '이미 가입된 이메일입니다. 비밀번호로 로그인해 주세요.'
      : 'This email already has an account. Please sign in with your password.',
    failed: isKo
      ? '게스트 결제 준비 중 오류가 발생했습니다. 다시 시도해 주세요.'
      : 'Something went wrong preparing guest checkout. Please try again.',
  };

  const passwordSetupText = {
    hint: isKo
      ? '회원가입 없이 구매하셨거나 Google·카카오로 가입하셨다면 아직 비밀번호가 없을 수 있어요.'
      : 'If you purchased without signing up or joined with Google/Kakao, you may not have a password yet.',
    button: isKo ? '비밀번호 설정 메일 받기' : 'Email me a password setup link',
    emailRequired: isKo ? '이메일을 먼저 입력해 주세요.' : 'Please enter your email first.',
    sent: isKo
      ? '비밀번호 설정 메일을 보냈습니다. 꼭 지금 사용 중인 이 기기(브라우저)에서 메일의 링크를 열어 주세요.'
      : 'We sent a password setup email. Please open the link on this same device (browser).',
    failed: isKo ? '메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' : 'Failed to send the email. Please try again later.',
  };

  const handleSendPasswordSetupMail = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError(passwordSetupText.emailRequired);
      return;
    }
    setSetupMailSending(true);
    try {
      const redirectBase = window.location.origin || getSiteUrl();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalized, {
        redirectTo: `${redirectBase}/auth/reset-password`,
      });
      if (resetError) {
        setError(passwordSetupText.failed);
        return;
      }
      setError('');
      setInfo(passwordSetupText.sent);
      setShowPasswordSetupHint(false);
    } catch {
      setError(passwordSetupText.failed);
    } finally {
      setSetupMailSending(false);
    }
  };

  const handleGuestCheckout = async () => {
    const normalized = guestEmail.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setGuestError(guestText.invalidEmail);
      return;
    }
    setGuestLoading(true);
    setGuestError('');
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/guest/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      });
      const json = await res.json();
      if (!json.success) {
        setGuestError(json.error || guestText.failed);
        return;
      }
      if (json.exists) {
        setEmail(normalized);
        setInfo(guestText.exists);
        setShowPasswordSetupHint(true);
        passwordRef.current?.focus();
        return;
      }
      let otpErr = (
        await supabase.auth.verifyOtp({
          token_hash: json.tokenHash,
          type: 'magiclink',
        })
      ).error;
      if (otpErr) {
        // 일부 GoTrue 버전 호환: 'email' 타입으로 재시도
        otpErr = (
          await supabase.auth.verifyOtp({
            token_hash: json.tokenHash,
            type: 'email',
          })
        ).error;
      }
      if (otpErr) {
        setGuestError(guestText.failed);
        return;
      }
      // 비밀번호 설정 메일 — 비밀번호 찾기와 동일한 Supabase 내장 메일 채널 사용(검증된 경로)
      try {
        const redirectBase = window.location.origin || getSiteUrl();
        await supabase.auth.resetPasswordForEmail(normalized, {
          redirectTo: `${redirectBase}/auth/reset-password`,
        });
      } catch {
        // 메일 발송 실패해도 결제/다운로드는 그대로 진행
      }
      const redirectPath = getRedirectPath();
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_redirect_path');
        window.location.replace(`${window.location.origin}${redirectPath}`);
      } else {
        router.push(redirectPath);
      }
    } catch {
      setGuestError(guestText.failed);
    } finally {
      setGuestLoading(false);
    }
  };

  useEffect(() => {
    // 로그인 페이지 진입 시 이전 경로 저장
    const fromParam = getRedirectParam(new URLSearchParams(searchParams.toString()));

    if (fromParam) {
      // 쿼리 파라미터로 전달된 경로 저장
      saveRedirectPath(fromParam);
    } else {
      // 현재 경로가 로그인 페이지가 아니면 저장 (뒤로가기 등으로 진입한 경우)
      const referrer = document.referrer;
      if (referrer) {
        try {
          const referrerUrl = new URL(referrer);
          if (referrerUrl.origin === window.location.origin) {
            saveRedirectPath(referrerUrl.pathname + referrerUrl.search);
          }
        } catch (e) {
          // referrer 파싱 실패 시 무시
        }
      }
    }

    if (PURCHASE_FLOW_PATH.test(getRedirectPath())) {
      setGuestOpen(true);
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
    setError('');
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
        setError(t('authLogin.errors.kakaoLoginFailed'));
      }
    } catch (err) {
      console.error(t('authLogin.console.kakaoLoginError'), err);
      setError(t('authLogin.errors.kakaoLoginFailed'));
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
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
        setError(t('authLogin.errors.googleLoginFailed'));
      }
    } catch (err) {
      console.error(t('authLogin.console.googleLoginError'), err);
      setError(t('authLogin.errors.googleLoginFailed'));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');
    setShowPasswordSetupHint(false);

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

          // 프로필이 없으면 기본 프로필 생성
          if (profileError.code === 'PGRST116') {
            // 이름 우선순위: user_metadata.full_name > name > user_name > 이메일 ID
            const meta = data.user.user_metadata || {};
            const resolvedName =
              meta.full_name?.trim() ||
              meta.name?.trim() ||
              meta.user_name?.trim() ||
              (data.user.email ? data.user.email.split('@')[0] : '');

            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: data.user.id,
                email: data.user.email || '',
                name: resolvedName
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
        setShowPasswordSetupHint(true);
      } else if (err.message?.includes('Email not confirmed')) {
        setError(t('authLogin.errors.emailNotConfirmed'));
      } else {
        setError(t('authLogin.errors.loginFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const alertMessage = error || info;
  const alertBox = alertMessage ? (
    <div
      role={error ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm ${
        error ? 'border-rose-100 bg-rose-50 text-rose-700' : 'border-blue-100 bg-blue-50 text-blue-800'
      }`}
    >
      <p className="flex items-start gap-2 break-keep">
        <i className={`${error ? 'ri-error-warning-line' : 'ri-information-line'} mt-0.5 text-base leading-none`} />
        <span>{alertMessage}</span>
      </p>
      {showPasswordSetupHint && (
        <div className="mt-3 border-t border-black/5 pt-3">
          <p className="break-keep text-xs leading-relaxed text-gray-600">{passwordSetupText.hint}</p>
          <button
            type="button"
            onClick={handleSendPasswordSetupMail}
            disabled={setupMailSending}
            className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-gray-800 ring-1 ring-gray-200 transition hover:bg-gray-50 disabled:opacity-60"
          >
            {setupMailSending ? (
              <i className="ri-loader-4-line animate-spin" />
            ) : (
              <i className="ri-mail-send-line text-sm" />
            )}
            {passwordSetupText.button}
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <MainHeader />

      <main className="flex-1 px-4 pb-14 pt-6 sm:px-6 md:pt-12">
        <div className="mx-auto w-full max-w-[440px]">
          <header className="text-center">
            <h1 className="text-2xl font-extrabold text-gray-900 md:text-3xl">{t('authLogin.title')}</h1>
            <p className="mt-2 break-keep text-sm text-gray-600">{t('authLogin.subtitle')}</p>
          </header>

          <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-8">
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleKakaoLogin}
                className="relative flex h-12 w-full items-center justify-center rounded-xl bg-[#FEE500] text-[15px] font-semibold text-black/85 transition hover:brightness-95"
              >
                <i className="ri-kakao-talk-fill absolute left-4 text-xl" />
                {t('authLogin.social.kakaoContinue')}
              </button>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="relative flex h-12 w-full items-center justify-center rounded-xl border border-gray-200 bg-white text-[15px] font-semibold text-gray-800 transition hover:bg-gray-50"
              >
                <i className="ri-google-fill absolute left-4 text-xl text-[#EA4335]" />
                {t('authLogin.social.googleContinue')}
              </button>
            </div>

            <div className="my-6 flex items-center gap-3 text-xs text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              {t('authLogin.divider')}
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <form className="space-y-4" onSubmit={handleLogin}>
              {alertBox}

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-800">
                  {t('authLogin.form.email')}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder={t('authLogin.form.emailPlaceholder')}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-800">
                    {t('authLogin.form.password')}
                  </label>
                  <LocaleLink
                    href="/auth/forgot-password"
                    className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-blue-600 hover:underline"
                  >
                    {t('authLogin.form.forgotPassword')}
                  </LocaleLink>
                </div>
                <div className="relative">
                  <input
                    ref={passwordRef}
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-12`}
                    placeholder={t('authLogin.form.passwordPlaceholder')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('authLogin.form.hidePassword') : t('authLogin.form.showPassword')}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-400 transition hover:text-gray-700"
                  >
                    <i className={`${showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} text-lg`} />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-[15px] font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <i className="ri-loader-4-line mr-2 animate-spin" />
                    {t('authLogin.form.submitting')}
                  </>
                ) : (
                  t('authLogin.form.submit')
                )}
              </button>
            </form>

            <div className="mt-6 border-t border-gray-100 pt-6 text-center">
              <p className="text-sm text-gray-600">{t('authLogin.noAccount')}</p>
              <LocaleLink
                href="/auth/register"
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50/60 text-[15px] font-bold text-blue-700 transition hover:bg-blue-50"
              >
                <i className="ri-user-add-line text-lg" />
                {t('authLogin.signUp')}
              </LocaleLink>
              {signupBonus.show && (
                <p className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-pink-600">
                  <i className="ri-gift-2-line" />
                  {signupBonus.short}
                </p>
              )}
            </div>
          </section>

          {/* 게스트 결제 (회원가입 없이 구매) */}
          <section className="mt-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setGuestOpen((v) => !v)}
              aria-expanded={guestOpen}
              className="flex w-full items-center gap-3 px-5 py-4 text-left md:px-8"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                <i className="ri-shopping-bag-3-line text-lg" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-gray-900">{guestText.title}</span>
                {!guestOpen && (
                  <span className="mt-0.5 block truncate text-xs text-gray-500">{guestText.desc}</span>
                )}
              </span>
              <i className={`ri-arrow-down-s-line text-xl text-gray-400 transition-transform ${guestOpen ? 'rotate-180' : ''}`} />
            </button>

            {guestOpen && (
              <div className="px-5 pb-5 md:px-8 md:pb-6">
                <p className="break-keep text-xs leading-relaxed text-gray-500">{guestText.desc}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    aria-label={guestText.placeholder}
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleGuestCheckout();
                      }
                    }}
                    placeholder={guestText.placeholder}
                    className={`${inputClass} sm:min-w-0 sm:flex-1`}
                  />
                  <button
                    type="button"
                    onClick={handleGuestCheckout}
                    disabled={guestLoading}
                    className="inline-flex h-12 flex-shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-ink px-5 text-sm font-bold text-white transition hover:bg-ink-light disabled:opacity-60"
                  >
                    {guestLoading ? <i className="ri-loader-4-line animate-spin" /> : guestText.button}
                  </button>
                </div>
                {guestError && (
                  <p role="alert" className="mt-2 flex items-start gap-1.5 break-keep text-xs text-rose-600">
                    <i className="ri-error-warning-line mt-px" />
                    {guestError}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
