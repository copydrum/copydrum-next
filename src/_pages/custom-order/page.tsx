'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import LocaleLink from '../../components/common/LocaleLink';
import { generateDefaultThumbnail } from '../../lib/defaultThumbnail';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ExistingSheet {
  id: string;
  title: string;
  artist: string;
  slug: string | null;
  thumbnail_url: string | null;
}

/** drum_sheets.normalized_key 와 같은 규칙 (괄호 내용·공백·기호 제거) */
const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ]/g, '');

/** youtu.be/... 처럼 프로토콜 없이 붙여 넣어도 접수되게 한다 */
const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const GRADES = ['c', 'b', 'a'] as const;
const STEPS = [
  { key: 'request', icon: 'ri-file-edit-line' },
  { key: 'quote', icon: 'ri-price-tag-3-line' },
  { key: 'payment', icon: 'ri-bank-card-line' },
  { key: 'completed', icon: 'ri-download-cloud-2-line' },
] as const;
const FAQ_KEYS = ['quote', 'production', 'payment'] as const;

const inputClass =
  'w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

const CustomOrderPage = () => {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading } = useAuthStore();
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLocale = (params?.locale as string) || i18n.language || 'ko';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'info'; message: string } | null>(null);
  const [formData, setFormData] = useState({ songTitle: '', artist: '', songUrl: '', memo: '' });
  const [existingSheets, setExistingSheets] = useState<ExistingSheet[]>([]);

  // 검색 결과 없음 화면에서 넘어온 검색어로 곡명을 채운다
  useEffect(() => {
    const title = searchParams?.get('title');
    if (title) setFormData((prev) => (prev.songTitle ? prev : { ...prev, songTitle: title }));
  }, [searchParams]);

  // 로그인 후 이 페이지로 돌아오게 한다 (login 페이지는 from 파라미터를 읽는다)
  const loginHref = `/auth/login?from=${encodeURIComponent(pathname || '/custom-order')}`;

  // 이미 판매 중인 같은 곡이 있으면 알려 준다
  useEffect(() => {
    const titleKey = normalizeKey(formData.songTitle);
    if (titleKey.length < 2) {
      setExistingSheets([]);
      return;
    }
    const artistKey = normalizeKey(formData.artist);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const escape = (s: string) => s.replace(/[%_]/g, (m) => `\\${m}`);
      let query = supabase
        .from('drum_sheets')
        .select('id, title, artist, slug, thumbnail_url')
        .eq('is_active', true)
        .ilike('normalized_key', `%${escape(titleKey)}%`);
      if (artistKey.length >= 2) query = query.ilike('normalized_key', `%${escape(artistKey)}%`);
      const { data, error } = await query.limit(3);
      if (cancelled) return;
      setExistingSheets(error ? [] : ((data ?? []) as ExistingSheet[]));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formData.songTitle, formData.artist]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 비로그인 유저: 이메일로 게스트 계정을 만들고 세션을 수립한다.
  // 반환값으로 { userId, email } 을 주거나, 진행 불가 시 null 을 반환한다.
  const ensureGuestSession = async (): Promise<{ userId: string; email: string } | null> => {
    const email = guestEmail.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      setFeedback({ type: 'error', message: t('customOrder.guest.invalidEmail') });
      return null;
    }

    const res = await fetch('/api/guest/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();

    if (!json.success) {
      setFeedback({ type: 'error', message: json.error || t('customOrder.errors.submitError') });
      return null;
    }
    if (json.exists) {
      setFeedback({ type: 'info', message: t('customOrder.guest.exists') });
      return null;
    }

    let otpRes = await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: 'magiclink' });
    if (otpRes.error) {
      otpRes = await supabase.auth.verifyOtp({ token_hash: json.tokenHash, type: 'email' });
    }
    if (otpRes.error || !otpRes.data?.user?.id) {
      setFeedback({ type: 'error', message: t('customOrder.errors.submitError') });
      return null;
    }

    // 비밀번호 설정 메일 (주문 추적을 위해 계정에 다시 로그인할 수 있도록)
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
    } catch {
      /* 메일 발송 실패해도 주문 접수는 진행 */
    }

    return { userId: otpRes.data.user.id, email };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);
    try {
      // 로그인 유저 → 기존 계정 사용 / 비로그인 → 이메일로 게스트 계정 수립
      let orderUserId: string;
      let orderEmail: string;
      let orderName: string;

      if (user) {
        orderUserId = user.id;
        orderEmail = user.email || '';
        orderName = user.user_metadata?.name || user.email || '';
      } else {
        const guest = await ensureGuestSession();
        if (!guest) {
          setIsSubmitting(false);
          return;
        }
        orderUserId = guest.userId;
        orderEmail = guest.email;
        orderName = guest.email.split('@')[0];
      }

      const { error } = await supabase.from('custom_orders').insert({
        user_id: orderUserId,
        name: orderName,
        email: orderEmail,
        phone: '',
        song_title: formData.songTitle.trim(),
        artist: formData.artist.trim(),
        song_url: normalizeUrl(formData.songUrl),
        requirements: formData.memo,
        status: 'pending',
        max_download_count: 20, // 기본 다운로드 횟수 20회로 설정
        locale: currentLocale, // 고객의 언어 설정 저장 (견적 통화 결정용)
      });

      if (error) throw error;

      setSubmitted(true);
      setFormData({ songTitle: '', artist: '', songUrl: '', memo: '' });
      setGuestEmail('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error(t('customOrder.console.submitError'), error);
      setFeedback({ type: 'error', message: t('customOrder.errors.submitError') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const pricingCard = (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900 md:text-lg">{t('customOrder.pricing.title')}</h2>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          {t('customOrder.pricing.deliveryBadge')}
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-0 lg:divide-y lg:divide-gray-100">
        {GRADES.map((grade) => (
          <li
            key={grade}
            className="rounded-xl bg-gray-50 p-2.5 text-center lg:flex lg:items-start lg:justify-between lg:gap-3 lg:rounded-none lg:bg-transparent lg:px-0 lg:py-3 lg:text-left"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">{t(`customOrder.pricing.grades.${grade}.name`)}</p>
              <p className="mt-0.5 break-keep text-[11px] leading-snug text-gray-500 lg:text-xs">
                {t(`customOrder.pricing.grades.${grade}.description`)}
              </p>
            </div>
            <p className="mt-1 text-xs font-extrabold text-blue-700 lg:mt-0 lg:whitespace-nowrap lg:text-sm">
              {/* 좁은 칸에서는 "~" 뒤에서 줄을 바꾼다 */}
              {t(`customOrder.pricing.grades.${grade}.price`).replace('~', '~\u200b')}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 break-keep text-[11px] leading-relaxed text-gray-500 md:text-xs">{t('customOrder.pricing.note')}</p>
    </section>
  );

  const successCard = (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm md:p-10">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
        <i className="ri-checkbox-circle-fill text-3xl text-blue-600" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-gray-900">{t('customOrder.success.title')}</h2>
      <p className="mx-auto mt-2 max-w-md break-keep text-sm leading-relaxed text-gray-600">{t('customOrder.success.description')}</p>
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <LocaleLink
          href="/mypage?tab=custom-orders"
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <i className="ri-file-list-3-line" />
          {t('customOrder.success.viewOrders')}
        </LocaleLink>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <i className="ri-add-line" />
          {t('customOrder.success.newRequest')}
        </button>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-14 pt-6 sm:px-6 md:pt-12">
        {/* 소개 + 진행 과정 */}
        <header className="text-center">
          <h1 className="text-2xl font-extrabold text-gray-900 md:text-4xl">{t('customOrder.title')}</h1>
          <p className="mx-auto mt-2 max-w-xl break-keep text-sm text-gray-600 md:text-base">
            {t('customOrder.description.line2')} {t('customOrder.description.line3')}
          </p>
        </header>

        <ol className="mx-auto mt-6 grid max-w-3xl grid-cols-4 gap-2 md:mt-8">
          {STEPS.map((step, index) => (
            <li key={step.key} className="relative flex flex-col items-center text-center">
              {index > 0 && (
                <span className="absolute right-1/2 top-5 -z-0 h-px w-full bg-blue-100" aria-hidden="true" />
              )}
              <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm ring-1 ring-blue-100">
                <i className={`${step.icon} text-lg`} />
              </span>
              <span className="mt-2 text-[11px] font-semibold text-blue-600">STEP {index + 1}</span>
              <span className="break-keep text-xs font-bold text-gray-900 md:text-sm">
                {t(`customOrder.process.steps.${step.key}.title`)}
              </span>
              <span className="mt-1 hidden break-keep text-xs leading-snug text-gray-500 md:block">
                {t(`customOrder.process.steps.${step.key}.description`)}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-4 md:mt-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
          <div className="lg:sticky lg:top-[140px] lg:order-2">{pricingCard}</div>

          <div className="lg:order-1">
            {submitted ? (
              successCard
            ) : (
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-7">
                <h2 className="text-lg font-bold text-gray-900 md:text-xl">{t('customOrder.form.title')}</h2>

                <form onSubmit={handleSubmit} className="mt-5 space-y-5">
                  {/* 신청자: 로그인 상태 확인 전에는 아무것도 그리지 않아 깜빡임을 막는다 */}
                  {authLoading ? (
                    <div className="h-12 animate-pulse rounded-xl bg-gray-100" aria-hidden="true" />
                  ) : user ? (
                    <p className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      <i className="ri-user-3-line text-base text-gray-400" />
                      <span className="min-w-0 truncate">{t('customOrder.form.accountNotice', { email: user.email || '' })}</span>
                    </p>
                  ) : (
                    <div>
                      <label htmlFor="guestEmail" className="mb-2 block text-sm font-semibold text-gray-800">
                        {t('customOrder.guest.emailLabel')} <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        id="guestEmail"
                        autoComplete="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        required
                        className={inputClass}
                        placeholder={t('customOrder.guest.emailPlaceholder')}
                      />
                      <p className="mt-1.5 break-keep text-xs text-gray-500">
                        {t('customOrder.guest.emailHint')}{' '}
                        <LocaleLink href={loginHref} className="font-semibold text-blue-600 underline underline-offset-2">
                          {t('customOrder.guest.loginInstead')}
                        </LocaleLink>
                      </p>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="songTitle" className="mb-2 block text-sm font-semibold text-gray-800">
                        {t('customOrder.form.songTitle')} <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="songTitle"
                        name="songTitle"
                        value={formData.songTitle}
                        onChange={handleInputChange}
                        required
                        className={inputClass}
                        placeholder={t('customOrder.form.songTitlePlaceholder')}
                      />
                    </div>
                    <div>
                      <label htmlFor="artist" className="mb-2 block text-sm font-semibold text-gray-800">
                        {t('customOrder.form.artist')}
                      </label>
                      <input
                        type="text"
                        id="artist"
                        name="artist"
                        value={formData.artist}
                        onChange={handleInputChange}
                        className={inputClass}
                        placeholder={t('customOrder.form.artistPlaceholder')}
                      />
                    </div>
                  </div>

                  {existingSheets.length > 0 && (
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
                      <p className="flex items-center gap-1.5 text-sm font-bold text-blue-800">
                        <i className="ri-information-line" />
                        {t('customOrder.existing.title')}
                      </p>
                      <p className="mt-0.5 break-keep text-xs text-blue-900/70">{t('customOrder.existing.description')}</p>
                      <ul className="mt-2.5 space-y-1.5">
                        {existingSheets.map((sheet) => (
                          <li key={sheet.id}>
                            <LocaleLink
                              href={`/drum-sheet/${sheet.slug || sheet.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 rounded-lg bg-white px-2.5 py-2 transition hover:shadow-sm"
                            >
                              <img
                                src={sheet.thumbnail_url || generateDefaultThumbnail(80, 80)}
                                alt=""
                                className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-gray-900">{sheet.title}</span>
                                <span className="block truncate text-xs text-gray-500">{sheet.artist}</span>
                              </span>
                              <span className="flex flex-shrink-0 items-center text-xs font-semibold text-blue-700">
                                {t('customOrder.existing.view')}
                                <i className="ri-external-link-line ml-1" />
                              </span>
                            </LocaleLink>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <label htmlFor="songUrl" className="mb-2 block text-sm font-semibold text-gray-800">
                      {t('customOrder.form.youtubeUrl')}
                    </label>
                    <input
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      id="songUrl"
                      name="songUrl"
                      value={formData.songUrl}
                      onChange={handleInputChange}
                      className={inputClass}
                      placeholder={t('customOrder.form.youtubeUrlPlaceholder')}
                    />
                    <p className="mt-1.5 break-keep text-xs text-gray-500">{t('customOrder.form.youtubeUrlHint')}</p>
                  </div>

                  <div>
                    <label htmlFor="memo" className="mb-2 block text-sm font-semibold text-gray-800">
                      {t('customOrder.form.memo')}
                    </label>
                    <textarea
                      id="memo"
                      name="memo"
                      value={formData.memo}
                      onChange={handleInputChange}
                      rows={4}
                      maxLength={500}
                      className={`${inputClass} resize-none`}
                      placeholder={t('customOrder.form.memoPlaceholder')}
                    />
                    <p className="mt-1 text-right text-xs text-gray-400">
                      {formData.memo.length}/500{t('customOrder.form.characters')}
                    </p>
                  </div>

                  {feedback && (
                    <div
                      className={`rounded-xl border px-4 py-3 text-sm ${
                        feedback.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-blue-200 bg-blue-50 text-blue-700'
                      }`}
                    >
                      {feedback.message}
                      {feedback.type === 'info' && (
                        <>
                          {' '}
                          <LocaleLink href={loginHref} className="font-semibold underline">
                            {t('customOrder.guest.loginInstead')}
                          </LocaleLink>
                        </>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-300"
                  >
                    {isSubmitting ? t('customOrder.form.submitting') : t('customOrder.form.submit')}
                  </button>
                  <p className="break-keep text-center text-xs leading-relaxed text-gray-500">{t('customOrder.form.note')}</p>
                </form>
              </section>
            )}
          </div>
        </div>

        {/* FAQ */}
        <section className="mx-auto mt-10 max-w-3xl md:mt-14">
          <h2 className="mb-3 text-center text-lg font-bold text-gray-900 md:text-xl">{t('customOrder.faq.title')}</h2>
          <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white shadow-sm">
            {FAQ_KEYS.map((key) => (
              <details key={key} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-gray-900 md:text-base [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-2">
                    <span className="text-blue-600">Q.</span>
                    {t(`customOrder.faq.questions.${key}.question`)}
                  </span>
                  <i className="ri-arrow-down-s-line text-lg text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-2 break-keep pl-6 text-sm leading-relaxed text-gray-600">
                  {t(`customOrder.faq.questions.${key}.answer`)}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default CustomOrderPage;
