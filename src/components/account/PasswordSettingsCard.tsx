'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';

interface PasswordSettingsCardProps {
  /** 'guest': 비회원 구매 직후 결제 완료 화면에서 비밀번호 설정을 권유할 때 */
  variant?: 'default' | 'guest';
  email?: string | null;
}

export default function PasswordSettingsCard({ variant = 'default', email }: PasswordSettingsCardProps) {
  const { i18n } = useTranslation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const isKo = i18n.language === 'ko';
  const isGuest = variant === 'guest';
  const text = {
    title: isGuest
      ? isKo
        ? '다른 기기에서도 다운로드하려면 비밀번호를 설정하세요'
        : 'Set a password to download on other devices'
      : isKo
        ? '비밀번호 설정/변경'
        : 'Set or change password',
    desc: isGuest
      ? isKo
        ? `회원가입 없이 구매하셨습니다. 지금 비밀번호를 정해 두시면 PC 등 다른 기기에서도 ${email || '이메일'}과 이 비밀번호로 로그인해 구매한 악보를 받을 수 있습니다.`
        : `You purchased without signing up. Set a password now to sign in on other devices (like a PC) with ${email || 'your email'} and download your sheets.`
      : isKo
        ? '비회원으로 구매하셨거나 Google·카카오로 가입하셨다면, 여기서 비밀번호를 만들어 이메일과 비밀번호로도 로그인할 수 있습니다.'
        : 'If you purchased as a guest or signed up with Google/Kakao, create a password here to also sign in with your email and password.',
    password: isKo ? '새 비밀번호' : 'New password',
    passwordPlaceholder: isKo ? '8자 이상 입력하세요' : 'At least 8 characters',
    confirm: isKo ? '비밀번호 확인' : 'Confirm password',
    confirmPlaceholder: isKo ? '비밀번호를 다시 입력하세요' : 'Re-enter your password',
    submit: isKo ? '비밀번호 저장' : 'Save password',
    saving: isKo ? '저장 중...' : 'Saving...',
    tooShort: isKo ? '비밀번호는 8자 이상이어야 합니다.' : 'Password must be at least 8 characters.',
    mismatch: isKo ? '비밀번호가 일치하지 않습니다.' : 'Passwords do not match.',
    samePassword: isKo
      ? '현재 비밀번호와 다른 비밀번호를 입력해 주세요.'
      : 'Please choose a password different from your current one.',
    weakPassword: isKo
      ? '더 안전한 비밀번호를 입력해 주세요. (영문·숫자·특수문자 조합 권장)'
      : 'Please choose a stronger password (mix letters, numbers and symbols).',
    reauth: isKo
      ? '보안을 위해 로그인 화면의 "비밀번호 찾기"로 변경해 주세요.'
      : 'For security, please change it via "Forgot password" on the sign-in page.',
    failed: isKo ? '비밀번호 저장에 실패했습니다. 다시 시도해 주세요.' : 'Failed to save password. Please try again.',
    success: isKo
      ? '비밀번호가 저장되었습니다. 이제 다른 기기에서도 이메일과 비밀번호로 로그인할 수 있습니다.'
      : 'Your password has been saved. You can now sign in on any device with your email and password.',
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(text.tooShort);
      return;
    }
    if (password !== confirmPassword) {
      setError(text.mismatch);
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { password_set: true },
      });
      if (updateError) {
        if (updateError.code === 'same_password') setError(text.samePassword);
        else if (updateError.code === 'weak_password') setError(text.weakPassword);
        else if (updateError.code === 'reauthentication_needed') setError(text.reauth);
        else setError(text.failed);
        return;
      }
      setDone(true);
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError(text.failed);
    } finally {
      setSaving(false);
    }
  };

  const containerClass = isGuest
    ? 'bg-amber-50 border border-amber-200 rounded-lg p-6'
    : 'bg-gray-50 border border-gray-200 rounded-lg p-6';

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2 mb-2">
        <i className={`ri-lock-password-line text-xl ${isGuest ? 'text-amber-600' : 'text-gray-700'}`} />
        <h4 className="text-lg font-semibold text-gray-900">{text.title}</h4>
      </div>

      {done ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {text.success}
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-600 mb-4">{text.desc}</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{text.password}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={text.passwordPlaceholder}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{text.confirm}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={text.confirmPlaceholder}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className={`px-6 py-3 rounded-lg font-semibold text-white transition ${
                  saving ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {saving ? text.saving : text.submit}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
