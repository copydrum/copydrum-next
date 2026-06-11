'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { getSiteUrl } from '@/lib/siteUrl';
import { useGuestCheckoutStore } from '@/stores/guestCheckoutStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function GuestCheckoutModal() {
  const { i18n } = useTranslation();
  const { isOpen, close } = useGuestCheckoutStore();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isKo = i18n.language === 'ko';
  const text = {
    title: isKo ? '회원가입 없이 구매하기' : 'Buy without signing up',
    desc: isKo
      ? '이메일만 입력하면 바로 결제·다운로드할 수 있어요. 결제 후 비밀번호 설정 메일을 보내드립니다.'
      : 'Just enter your email to pay and download right away. We’ll email you a link to set a password.',
    placeholder: isKo ? '이메일 주소' : 'Email address',
    button: isKo ? '계속하기' : 'Continue',
    loginInstead: isKo ? '이미 회원이신가요? 로그인' : 'Already a member? Sign in',
    invalidEmail: isKo ? '유효한 이메일을 입력해 주세요.' : 'Please enter a valid email.',
    exists: isKo
      ? '이미 가입된 이메일입니다. 비밀번호로 로그인해 주세요.'
      : 'This email already has an account. Please sign in with your password.',
    failed: isKo
      ? '게스트 결제 준비 중 오류가 발생했습니다. 다시 시도해 주세요.'
      : 'Something went wrong preparing guest checkout. Please try again.',
    cancel: isKo ? '닫기' : 'Close',
  };

  if (!isOpen) return null;

  const loginHref = (() => {
    const path =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : '/';
    return `/auth/login?redirect=${encodeURIComponent(path)}`;
  })();

  const handleSubmit = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !EMAIL_RE.test(normalized)) {
      setError(text.invalidEmail);
      return;
    }
    setLoading(true);
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
        setError(json.error || text.failed);
        return;
      }
      if (json.exists) {
        setInfo(text.exists);
        return;
      }

      let otpErr = (
        await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: 'magiclink' })
      ).error;
      if (otpErr) {
        otpErr = (
          await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: 'email' })
        ).error;
      }
      if (otpErr) {
        setError(text.failed);
        return;
      }

      // 비밀번호 설정 메일 (검증된 Supabase 채널)
      try {
        const redirectBase = window.location.origin || getSiteUrl();
        await supabase.auth.resetPasswordForEmail(normalized, {
          redirectTo: `${redirectBase}/auth/reset-password`,
        });
      } catch {
        /* 메일 실패해도 진행 */
      }

      // 세션이 수립됐으므로 현재 페이지를 새로고침하면 로그인 상태로 이어서 결제 가능
      window.location.reload();
    } catch {
      setError(text.failed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <i className="ri-flashlight-line text-blue-600 text-xl" />
            <h2 className="text-lg font-bold text-gray-900">{text.title}</h2>
          </div>
          <button
            onClick={close}
            className="text-gray-400 hover:text-gray-600"
            aria-label={text.cancel}
          >
            <i className="ri-close-line text-2xl" />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{text.desc}</p>

        {info && (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {info}{' '}
            <a href={loginHref} className="font-semibold underline">
              {text.loginInstead}
            </a>
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={text.placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? <i className="ri-loader-4-line animate-spin" /> : text.button}
        </button>

        <a
          href={loginHref}
          className="mt-3 block text-center text-sm text-gray-500 hover:text-gray-700 underline"
        >
          {text.loginInstead}
        </a>
      </div>
    </div>
  );
}
