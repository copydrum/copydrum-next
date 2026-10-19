'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from '@supabase/supabase-js';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import LocaleLink from '../../components/common/LocaleLink';
import { supabase } from '../../lib/supabase';
import { openChatWidget } from '../../lib/chat/openChat';
import { FREE_LESSONS_PUBLIC_ENABLED, isMyBookVisible } from '@/config/featureFlags';

interface GuideLink {
  labelKey: string;
  href: string;
}

interface GuideSection {
  id: string;
  key: string;
  icon: string;
  links: GuideLink[];
}

const QUICK_STEPS = [
  { key: 'find', icon: 'ri-search-line' },
  { key: 'pay', icon: 'ri-bank-card-line' },
  { key: 'download', icon: 'ri-download-cloud-2-line' },
] as const;

const SECTIONS: GuideSection[] = [
  {
    id: 'search',
    key: 'search',
    icon: 'ri-search-line',
    links: [
      { labelKey: 'guidePage.sections.search.cta.categories', href: '/categories' },
      { labelKey: 'guidePage.sections.search.cta.eventSale', href: '/event-sale' },
    ],
  },
  {
    id: 'payment',
    key: 'payment',
    icon: 'ri-bank-card-line',
    links: [{ labelKey: 'guidePage.sections.payment.cta.cart', href: '/cart' }],
  },
  {
    id: 'download',
    key: 'download',
    icon: 'ri-download-cloud-2-line',
    links: [{ labelKey: 'guidePage.sections.download.cta.purchases', href: '/purchases' }],
  },
  {
    id: 'benefits',
    key: 'benefits',
    icon: 'ri-copper-coin-line',
    links: [
      { labelKey: 'guidePage.sections.benefits.cta.mypage', href: '/mypage' },
      { labelKey: 'guidePage.sections.benefits.cta.eventSale', href: '/event-sale' },
    ],
  },
];

const JUMP_KEYS = ['start', 'search', 'payment', 'download', 'benefits', 'services'] as const;

export default function GuidePage() {
  const [user, setUser] = useState<User | null>(null);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const points = (key: string): string[] => {
    const value = t(`guidePage.sections.${key}.points`, { returnObjects: true });
    return Array.isArray(value) ? (value as string[]) : [];
  };

  const services = [
    { key: 'customOrder', icon: 'ri-edit-line', href: '/custom-order', visible: true },
    { key: 'myBook', icon: 'ri-book-open-line', href: '/my-book', visible: isMyBookVisible(i18n.language) },
    { key: 'freeLessons', icon: 'ri-play-circle-line', href: '/free-lessons', visible: FREE_LESSONS_PUBLIC_ENABLED },
  ].filter((service) => service.visible);

  const sectionCard = 'scroll-mt-[180px] rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:scroll-mt-[140px] md:p-7';
  const linkButton =
    'inline-flex items-center gap-1 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>

      <main className="mx-auto max-w-4xl px-4 pb-14 pt-6 sm:px-6 md:pt-12">
        <header className="text-center">
          <h1 className="text-2xl font-extrabold text-gray-900 md:text-4xl">{t('guidePage.title')}</h1>
          <p className="mx-auto mt-2 max-w-xl break-keep text-sm text-gray-600 md:text-base">{t('guidePage.subtitle')}</p>
        </header>

        {/* 섹션 바로가기 */}
        <nav
          aria-label={t('guidePage.title')}
          className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {JUMP_KEYS.map((key) => (
            <a
              key={key}
              href={`#${key}`}
              className="flex-shrink-0 whitespace-nowrap rounded-full border border-gray-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t(`guidePage.jump.${key}`)}
            </a>
          ))}
        </nav>

        <div className="mt-6 space-y-4 md:mt-8 md:space-y-5">
          {/* 첫 구매 */}
          <section id="start" className={`${sectionCard} border-blue-100 bg-gradient-to-br from-blue-50 via-white to-pink-50`}>
            <h2 className="text-lg font-bold text-gray-900 md:text-xl">{t('guidePage.quickStart.title')}</h2>
            <ol className="mt-4 grid gap-3 md:grid-cols-3">
              {QUICK_STEPS.map((step, index) => (
                <li key={step.key} className="flex gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-100 md:flex-col md:gap-2">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                    <i className={`${step.icon} text-lg`} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-blue-600">STEP {index + 1}</p>
                    <p className="text-[15px] font-bold text-gray-900">{t(`guidePage.quickStart.steps.${step.key}.title`)}</p>
                    <p className="mt-0.5 break-keep text-sm leading-relaxed text-gray-600">
                      {t(`guidePage.quickStart.steps.${step.key}.detail`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 break-keep text-sm font-medium text-blue-800">
                <i className="ri-user-smile-line" />
                {t('guidePage.quickStart.note')}
              </p>
              <LocaleLink
                href="/categories"
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {t('guidePage.quickStart.cta')}
                <i className="ri-arrow-right-s-line text-base" />
              </LocaleLink>
            </div>
          </section>

          {SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className={sectionCard}>
              <h2 className="flex items-center gap-2.5 text-lg font-bold text-gray-900 md:text-xl">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <i className={`${section.icon} text-lg`} />
                </span>
                {t(`guidePage.sections.${section.key}.title`)}
              </h2>
              <ul className="mt-4 space-y-2.5">
                {points(section.key).map((point) => (
                  <li key={point} className="flex gap-2.5 break-keep text-sm leading-relaxed text-gray-700 md:text-[15px]">
                    <i className="ri-check-line mt-0.5 flex-shrink-0 text-base text-blue-600" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              {section.links.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {section.links.map((link) => (
                    <LocaleLink key={link.href} href={link.href} className={linkButton}>
                      {t(link.labelKey)}
                      <i className="ri-arrow-right-s-line text-base" />
                    </LocaleLink>
                  ))}
                </div>
              )}
            </section>
          ))}

          {/* 더 많은 서비스 */}
          <section id="services" className={sectionCard}>
            <h2 className="flex items-center gap-2.5 text-lg font-bold text-gray-900 md:text-xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <i className="ri-sparkling-line text-lg" />
              </span>
              {t('guidePage.sections.services.title')}
            </h2>
            <div className={`mt-4 grid gap-3 ${services.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              {services.map((service) => (
                <LocaleLink
                  key={service.key}
                  href={service.href}
                  className="group flex flex-col rounded-xl border border-gray-100 p-4 transition hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <span className="flex items-center gap-2 text-[15px] font-bold text-gray-900">
                    <i className={`${service.icon} text-lg text-blue-600`} />
                    {t(`guidePage.sections.services.items.${service.key}.title`)}
                  </span>
                  <span className="mt-1.5 flex-1 break-keep text-sm leading-relaxed text-gray-600">
                    {t(`guidePage.sections.services.items.${service.key}.detail`)}
                  </span>
                  <span className="mt-3 inline-flex items-center text-sm font-semibold text-blue-700">
                    {t(`guidePage.sections.services.items.${service.key}.cta`)}
                    <i className="ri-arrow-right-s-line text-base transition-transform group-hover:translate-x-0.5" />
                  </span>
                </LocaleLink>
              ))}
            </div>
          </section>

          {/* 도움말 */}
          <section className="rounded-2xl bg-ink p-6 text-center text-white md:p-8">
            <h2 className="text-lg font-bold md:text-xl">{t('guidePage.help.title')}</h2>
            <p className="mx-auto mt-1.5 max-w-md break-keep text-sm text-white/70">{t('guidePage.help.description')}</p>
            <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
              <LocaleLink
                href="/customer-support"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-5 py-3 text-sm font-bold text-ink hover:bg-white/90"
              >
                <i className="ri-question-line" />
                {t('guidePage.help.faq')}
              </LocaleLink>
              <button
                type="button"
                onClick={openChatWidget}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700"
              >
                <i className="ri-chat-3-line" />
                {t('guidePage.help.chat')}
              </button>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
