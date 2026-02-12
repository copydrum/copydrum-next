'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import Link from 'next/link';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import Footer from '../../components/common/Footer';
import MainHeader from '../../components/common/MainHeader';

export default function Register() {
  const { t } = useTranslation();
  const router = useLocaleRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
    agreePrivacy: false,
    agreeMarketing: false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
        console.error(t('authRegister.console.kakaoLoginError'), error);
        alert(t('authRegister.errors.kakaoLoginFailed'));
      }
    } catch (err) {
      console.error(t('authRegister.console.kakaoLoginError'), err);
      alert(t('authRegister.errors.kakaoLoginFailed'));
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
        console.error(t('authRegister.console.googleLoginError'), error);
        alert(t('authRegister.errors.googleLoginFailed'));
      }
    } catch (err) {
      console.error(t('authRegister.console.googleLoginError'), err);
      alert(t('authRegister.errors.googleLoginFailed'));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // 유효성 검사
    if (formData.password !== formData.confirmPassword) {
      setError(t('authRegister.errors.passwordMismatch'));
      setLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError(t('authRegister.errors.passwordTooShort'));
      setLoading(false);
      return;
    }

    if (!formData.agreeTerms || !formData.agreePrivacy) {
      setError(t('authRegister.errors.termsRequired'));
      setLoading(false);
      return;
    }

    try {
      // Supabase 회원가입
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            role: 'user' // 기본값으로 'user' 고정
          }
        }
      });

      if (signUpError) {
        console.error('SIGNUP_ERROR', signUpError);
        throw signUpError;
      }

      if (data.user) {
        // 프로필 생성 - 이메일 ID를 이름으로 사용
        // upsert를 사용하여 트리거가 먼저 생성한 프로필도 업데이트
        const emailName = formData.email.split('@')[0] || '';
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: data.user.id,
              email: formData.email,
              name: emailName
            },
            { onConflict: 'id' } // 같은 id면 update로 덮어쓰기
          );

        if (profileError) {
          // 프로필 생성 실패해도 회원가입은 성공 처리
          // (DB 트리거나 다른 메커니즘으로 프로필이 생성될 수 있음)
          console.error('프로필 생성/업데이트 오류:', profileError);
        } else {
          console.log('프로필 생성/업데이트 성공');
        }

        // 프로필 생성 실패 여부와 관계없이 회원가입 성공 처리
        setSuccess(t('authRegister.messages.signUpSuccess'));
        
        // 3초 후 로그인 페이지로 이동
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } catch (err: any) {
      console.error(t('authRegister.console.signUpError'), err);
      if (err.message.includes('already registered')) {
        setError(t('authRegister.errors.emailAlreadyRegistered'));
      } else if (err.message.includes('Invalid email')) {
        setError(t('authRegister.errors.invalidEmail'));
      } else {
        setError(t('authRegister.errors.signUpFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <MainHeader />

      <main className="flex-1 py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900">{t('authRegister.title')}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {t('authRegister.hasAccount')}{' '}
              <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer">
                {t('authRegister.signIn')}
              </Link>
            </p>
          </div>

          <div className="mt-8">
            <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
              <form className="space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
                    {success}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    {t('authRegister.form.email')} *
                  </label>
                  <div className="mt-1">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder={t('authRegister.form.emailPlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    {t('authRegister.form.password')} *
                  </label>
                  <div className="mt-1">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder={t('authRegister.form.passwordPlaceholder')}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {t('authRegister.form.passwordHint')}
                  </p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-707">
                    {t('authRegister.form.confirmPassword')} *
                  </label>
                  <div className="mt-1">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder={t('authRegister.form.confirmPasswordPlaceholder')}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start">
                    <input
                      id="agreeTerms"
                      name="agreeTerms"
                      type="checkbox"
                      checked={formData.agreeTerms}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer mt-0.5"
                    />
                    <label htmlFor="agreeTerms" className="ml-2 block text-sm text-gray-900 cursor-pointer">
                      <span className="text-red-500">*</span> {t('authRegister.form.agreeTerms')}{' '}
                      <a href="/guide#terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-500 underline">
                        {t('authRegister.form.viewTerms')}
                      </a>
                    </label>
                  </div>

                  <div className="flex items-start">
                    <input
                      id="agreePrivacy"
                      name="agreePrivacy"
                      type="checkbox"
                      checked={formData.agreePrivacy}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer mt-0.5"
                    />
                    <label htmlFor="agreePrivacy" className="ml-2 block text-sm text-gray-900 cursor-pointer">
                      <span className="text-red-500">*</span> {t('authRegister.form.agreePrivacy')}{' '}
                      <a href="/guide#privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-500 underline">
                        {t('authRegister.form.viewPrivacy')}
                      </a>
                    </label>
                  </div>

                  <div className="flex items-start">
                    <input
                      id="agreeMarketing"
                      name="agreeMarketing"
                      type="checkbox"
                      checked={formData.agreeMarketing}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer mt-0.5"
                    />
                    <label htmlFor="agreeMarketing" className="ml-2 block text-sm text-gray-900 cursor-pointer">
                      {t('authRegister.form.agreeMarketing')}
                    </label>
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
                        {t('authRegister.form.submitting')}
                      </div>
                    ) : (
                      t('authRegister.form.submit')
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
                    <span className="px-2 bg-white text-gray-500">{t('authRegister.divider')}</span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button 
                    type="button"
                    onClick={handleGoogleLogin}
                    className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 cursor-pointer"
                  >
                    <i className="ri-google-fill text-red-500 text-lg"></i>
                    <span className="ml-2">{t('authRegister.social.google')}</span>
                  </button>

                  <button 
                    type="button"
                    onClick={handleKakaoLogin}
                    className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 cursor-pointer"
                  >
                    <i className="ri-kakao-talk-fill text-yellow-500 text-lg"></i>
                    <span className="ml-2">{t('authRegister.social.kakao')}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
