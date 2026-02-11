'use client';
import Link from 'next/link';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { getSiteUrl } from '../../lib/siteUrl';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    // 이메일 검증
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('authForgotPassword.errors.emailRequired'));
      setLoading(false);
      return;
    }

    try {
      // 로컬 개발 환경에서는 localhost를 사용
      const redirectBase = window.location.origin || getSiteUrl();
      console.log(t('authForgotPassword.console.resetRequest'), { email: trimmedEmail, redirectBase });
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${redirectBase}/auth/reset-password`,
      });
      console.log(t('authForgotPassword.console.resetResponse'), { error: resetError });

      if (resetError) {
        throw resetError;
      }

      setMessage(t('authForgotPassword.messages.resetLinkSent'));
      setEmail(''); // 성공 시 이메일 필드 비우기
    } catch (err: any) {
      console.error(t('authForgotPassword.console.resetError'), err);
      if (err.message.includes('Invalid email')) {
        setError(t('authForgotPassword.errors.invalidEmail'));
      } else {
        setError(t('authForgotPassword.errors.resetFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <MainHeader />

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 py-12">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900">{t('authForgotPassword.title')}</h2>
            <p className="mt-2 text-sm text-gray-600">
              {t('authForgotPassword.description')}
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

                {message && (
                  <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
                    {message}
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    {t('authForgotPassword.form.email')}
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
                      placeholder={t('authForgotPassword.form.emailPlaceholder')}
                    />
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
                        {t('authForgotPassword.form.submitting')}
                      </div>
                    ) : (
                      t('authForgotPassword.form.submit')
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-6 text-center">
                <div className="text-sm space-y-2">
                  <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer">
                    {t('authForgotPassword.links.backToLogin')}
                  </Link>
                  <div className="text-gray-500">{t('authForgotPassword.links.or')}</div>
                  <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer">
                    {t('authForgotPassword.links.createAccount')}
                  </Link>
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
