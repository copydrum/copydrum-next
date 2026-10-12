'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { getLocalizedUrl } from '@/lib/localeUrl';
import { useSignupBonus } from '@/components/auth/SignupBonus';

interface SignupGateModalProps {
  open: boolean;
  onClose: () => void;
  /** 로그인 후 돌아올 경로 (locale 없는 경로, 쿼리 포함 가능) */
  returnPath: string;
}

/** 비회원이 PDF 다운로드를 누르면 띄우는 가입 유도 창 */
export default function SignupGateModal({ open, onClose, returnPath }: SignupGateModalProps) {
  const { t, i18n } = useTranslation();
  const router = useLocaleRouter();
  const bonus = useSignupBonus();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const rememberReturnPath = () => {
    try {
      localStorage.setItem('auth_redirect_path', getLocalizedUrl(returnPath, i18n.language));
    } catch {
      // 저장 실패해도 로그인은 진행
    }
  };

  const goSignup = () => {
    rememberReturnPath();
    router.push('/auth/register');
  };

  const goLogin = () => {
    rememberReturnPath();
    const from = getLocalizedUrl(returnPath, i18n.language);
    router.push(`/auth/login?from=${encodeURIComponent(from)}`);
  };

  const benefits = [t('freeLessons.gate.benefit1'), t('freeLessons.gate.benefit2'), t('freeLessons.gate.benefit3')];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-lesson-gate-title"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
          aria-label={t('freeLessons.gate.close')}
        >
          <i className="ri-close-line text-xl" />
        </button>

        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-6 pb-6 pt-8 text-white">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
            <i className="ri-file-download-line text-2xl" />
          </div>
          <h2 id="free-lesson-gate-title" className="text-xl font-bold leading-snug">
            {t('freeLessons.gate.title')}
          </h2>
          <p className="mt-1.5 text-sm text-blue-100">{t('freeLessons.gate.description')}</p>
        </div>

        <div className="space-y-5 px-6 pb-6 pt-5">
          {bonus.show && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <i className="ri-gift-2-fill text-2xl leading-none text-amber-500" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">{bonus.headline}</p>
                <p className="mt-0.5 text-xs text-gray-600">{bonus.detail}</p>
              </div>
            </div>
          )}

          <ul className="space-y-2">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-sm text-gray-700">
                <i className="ri-checkbox-circle-fill text-lg text-emerald-500" />
                {benefit}
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <button
              type="button"
              onClick={goSignup}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <i className="ri-user-add-line" />
              {t('freeLessons.gate.signup')}
              {bonus.show && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold">{bonus.badge}</span>
              )}
            </button>
            <button
              type="button"
              onClick={goLogin}
              className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t('freeLessons.gate.login')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
