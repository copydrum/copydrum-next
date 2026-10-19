'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import LocaleLink from '@/components/common/LocaleLink';

/** DB에는 한국어 분류명으로 저장한다 (관리자 화면 필터와 같은 값) */
const CATEGORIES = [
  { value: '주문/결제', labelKey: 'customerSupport.contact.categories.orderPayment' },
  { value: '악보/다운로드', labelKey: 'customerSupport.contact.categories.sheetDownload' },
  { value: '주문제작', labelKey: 'customerSupport.contact.categories.customOrder' },
  { value: '기술지원', labelKey: 'customerSupport.contact.categories.technical' },
  { value: '기타', labelKey: 'customerSupport.contact.categories.other' },
];

const EMPTY_FORM = { name: '', email: '', category: '', subject: '', message: '' };

const inputClass =
  'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50';

interface InquiryFormProps {
  user: User | null;
  /** 접수 후 목록을 다시 불러오는 등 부모가 할 일 */
  onSubmitted?: () => void;
  /** 바로 아래에 문의 내역이 있는 화면(마이페이지)에서는 내역 링크를 숨긴다 */
  showHistoryLink?: boolean;
}

/** 고객센터 페이지와 마이페이지 1:1 문의 탭이 함께 쓰는 문의 양식 */
export default function InquiryForm({ user, onSubmitted, showHistoryLink = true }: InquiryFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setForm((prev) => ({
      ...prev,
      name: prev.name || (user.user_metadata?.name as string) || '',
      email: prev.email || user.email || '',
    }));
  }, [user]);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const name = form.name.trim();
    const email = form.email.trim();
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (!name || !email || !form.category || !subject || !message) {
      setError(t('customerSupport.errors.fillAllFields'));
      return;
    }

    setSubmitting(true);
    try {
      // 관리자 화면·마이페이지는 title/content 를 읽는다. 예전 화면이 쓰던 subject/message 도 같이 채워 둔다
      const { error: insertError } = await supabase.from('customer_inquiries').insert({
        user_id: user?.id ?? null,
        name,
        email,
        category: form.category,
        title: subject,
        content: message,
        subject,
        message,
        status: 'pending',
      });
      if (insertError) throw insertError;

      setSubmitted(true);
      setForm((prev) => ({ ...EMPTY_FORM, name: user ? prev.name : '', email: user ? prev.email : '' }));
      onSubmitted?.();
    } catch (submitError) {
      console.error('[InquiryForm] 문의 접수 실패:', submitError);
      setError(t('customerSupport.errors.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="py-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
          <i className="ri-checkbox-circle-fill text-3xl text-blue-600" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-gray-900">{t('customerSupport.contact.success.title')}</h3>
        <p className="mx-auto mt-2 max-w-sm break-keep text-sm leading-relaxed text-gray-600">
          {user ? t('customerSupport.contact.success.member') : t('customerSupport.contact.success.guest')}
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          {user && showHistoryLink && (
            <LocaleLink
              href="/mypage?tab=inquiries"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <i className="ri-question-answer-line" />
              {t('customerSupport.contact.success.viewHistory')}
            </LocaleLink>
          )}
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <i className="ri-add-line" />
            {t('customerSupport.contact.success.again')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!user && (
        <p className="flex items-start gap-2 rounded-xl bg-blue-50/70 px-4 py-3 text-xs leading-relaxed text-blue-900">
          <i className="ri-information-line mt-px text-sm text-blue-600" />
          <span className="break-keep">{t('customerSupport.contact.guestNotice')}</span>
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="inquiry-name" className="mb-2 block text-sm font-semibold text-gray-800">
            {t('customerSupport.contact.form.name')} <span className="text-rose-500">*</span>
          </label>
          <input
            id="inquiry-name"
            name="name"
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={handleChange}
            required
            disabled={submitting}
            className={inputClass}
            placeholder={t('customerSupport.contact.form.namePlaceholder')}
          />
        </div>
        <div>
          <label htmlFor="inquiry-email" className="mb-2 block text-sm font-semibold text-gray-800">
            {t('customerSupport.contact.form.email')} <span className="text-rose-500">*</span>
          </label>
          <input
            id="inquiry-email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            required
            disabled={submitting}
            className={inputClass}
            placeholder={t('customerSupport.contact.form.emailPlaceholder')}
          />
        </div>
      </div>

      <div>
        <label htmlFor="inquiry-category" className="mb-2 block text-sm font-semibold text-gray-800">
          {t('customerSupport.contact.form.inquiryType')} <span className="text-rose-500">*</span>
        </label>
        <select
          id="inquiry-category"
          name="category"
          value={form.category}
          onChange={handleChange}
          required
          disabled={submitting}
          className={`${inputClass} bg-white`}
        >
          <option value="">{t('customerSupport.contact.form.inquiryTypePlaceholder')}</option>
          {CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {t(category.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="inquiry-subject" className="mb-2 block text-sm font-semibold text-gray-800">
          {t('customerSupport.contact.form.subject')} <span className="text-rose-500">*</span>
        </label>
        <input
          id="inquiry-subject"
          name="subject"
          type="text"
          value={form.subject}
          onChange={handleChange}
          required
          disabled={submitting}
          className={inputClass}
          placeholder={t('customerSupport.contact.form.subjectPlaceholder')}
        />
      </div>

      <div>
        <label htmlFor="inquiry-message" className="mb-2 block text-sm font-semibold text-gray-800">
          {t('customerSupport.contact.form.message')} <span className="text-rose-500">*</span>
        </label>
        <textarea
          id="inquiry-message"
          name="message"
          value={form.message}
          onChange={handleChange}
          required
          disabled={submitting}
          rows={6}
          maxLength={500}
          className={`${inputClass} resize-none`}
          placeholder={t('customerSupport.contact.form.messagePlaceholder')}
        />
        <p className="mt-1 text-right text-xs text-gray-400">
          {form.message.length}/500{t('customerSupport.contact.form.characters')}
        </p>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-300"
      >
        {submitting ? t('customerSupport.contact.form.submitting') : t('customerSupport.contact.form.submit')}
      </button>
      <p className="break-keep text-center text-xs text-gray-500">{t('customerSupport.contact.form.note')}</p>
    </form>
  );
}
