'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import type { User } from '@supabase/supabase-js';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import LocaleLink from '../../components/common/LocaleLink';
import InquiryForm from '../../components/support/InquiryForm';
import { supabase } from '../../lib/supabase';
import { openChatWidget } from '../../lib/chat/openChat';
import { isMyBookVisible } from '@/config/featureFlags';

type Tab = 'faq' | 'contact';

interface FaqItem {
  key: string;
  link?: string;
  koOnly?: boolean;
}

interface FaqCategory {
  key: string;
  icon: string;
  items: FaqItem[];
}

const SUPPORT_EMAIL = 'copydrum@hanmail.net';

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    key: 'orderPayment',
    icon: 'ri-bank-card-line',
    items: [
      { key: 'payment' },
      { key: 'bankTransfer', koOnly: true },
      { key: 'guest' },
      { key: 'refund', link: '/policy/refund' },
    ],
  },
  {
    key: 'sheetDownload',
    icon: 'ri-download-2-line',
    items: [
      { key: 'download', link: '/purchases' },
      { key: 'notWorking' },
      { key: 'format' },
      { key: 'print' },
      { key: 'preorder' },
    ],
  },
  {
    key: 'cashPoints',
    icon: 'ri-copper-coin-line',
    items: [{ key: 'cash' }, { key: 'points' }, { key: 'pointsExpire' }],
  },
  {
    key: 'customOrder',
    icon: 'ri-edit-line',
    items: [{ key: 'what', link: '/custom-order' }, { key: 'cost' }, { key: 'duration' }, { key: 'payment' }],
  },
  {
    key: 'myBook',
    icon: 'ri-book-open-line',
    items: [{ key: 'what', link: '/my-book' }, { key: 'download' }],
  },
  {
    key: 'account',
    icon: 'ri-user-settings-line',
    items: [{ key: 'socialPassword' }, { key: 'forgotPassword' }, { key: 'deleteAccount' }],
  },
];

export default function CustomerSupport() {
  const { t, i18n } = useTranslation();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>(() => (searchParams.get('tab') === 'contact' ? 'contact' : 'faq'));
  const [user, setUser] = useState<User | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // 푸터의 "문의하기" 링크처럼 ?tab=contact 로 들어오는 경우를 따라간다
  useEffect(() => {
    setActiveTab(searchParams.get('tab') === 'contact' ? 'contact' : 'faq');
  }, [searchParams]);

  /** 탭은 주소만 바꾸고(기록을 쌓지 않음) 화면은 그 자리에 둔다 */
  const selectTab = (tab: Tab, scrollToTabs = false) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === 'contact') params.set('tab', 'contact');
    else params.delete('tab');
    const qs = params.toString();
    window.history.replaceState({ ...window.history.state }, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    if (scrollToTabs) {
      document.getElementById('support-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const categories = useMemo(
    () =>
      FAQ_CATEGORIES.filter((cat) => cat.key !== 'myBook' || isMyBookVisible(i18n.language)).map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => !item.koOnly || i18n.language === 'ko'),
      })),
    [i18n.language],
  );

  const keyword = query.trim().toLowerCase();
  const visibleCategories = categories
    .filter((cat) => category === 'all' || cat.key === category)
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => {
        if (!keyword) return true;
        const base = `customerSupport.faq.categories.${cat.key}.items.${item.key}`;
        return `${t(`${base}.question`)} ${t(`${base}.answer`)}`.toLowerCase().includes(keyword);
      }),
    }))
    .filter((cat) => cat.items.length > 0);

  const channelCard = 'flex flex-col rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm md:p-5';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="hidden md:block">
        <MainHeader user={user} />
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-14 pt-6 sm:px-6 md:pt-12">
        <header className="text-center">
          <h1 className="text-2xl font-extrabold text-gray-900 md:text-4xl">{t('customerSupport.title')}</h1>
          <p className="mx-auto mt-2 max-w-xl break-keep text-sm text-gray-600 md:text-base">{t('customerSupport.subtitle')}</p>
        </header>

        {/* 문의 창구 */}
        <section className="mt-6 grid grid-cols-2 gap-3 md:mt-8 md:grid-cols-3 md:gap-4">
          <div className={`${channelCard} col-span-2 ring-1 ring-blue-200 md:col-span-1`}>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white">
                <i className="ri-chat-smile-3-line text-lg" />
              </span>
              <h2 className="text-base font-bold text-gray-900">{t('customerSupport.channels.chat.title')}</h2>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                {t('customerSupport.channels.chat.badge')}
              </span>
            </div>
            <p className="mt-2 flex-1 break-keep text-sm text-gray-600">{t('customerSupport.channels.chat.description')}</p>
            <button
              type="button"
              onClick={openChatWidget}
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <i className="ri-chat-3-line" />
              {t('customerSupport.channels.chat.button')}
            </button>
          </div>

          <div className={channelCard}>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <i className="ri-question-answer-line text-lg" />
              </span>
              <h2 className="text-base font-bold text-gray-900">{t('customerSupport.channels.inquiry.title')}</h2>
            </div>
            <p className="mt-2 hidden flex-1 break-keep text-sm text-gray-600 md:block">{t('customerSupport.channels.inquiry.description')}</p>
            <button
              type="button"
              onClick={() => selectTab('contact', true)}
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <i className="ri-edit-line" />
              {t('customerSupport.channels.inquiry.button')}
            </button>
          </div>

          <div className={channelCard}>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <i className="ri-mail-line text-lg" />
              </span>
              <h2 className="text-base font-bold text-gray-900">{t('customerSupport.channels.email.title')}</h2>
            </div>
            <p className="mt-2 hidden flex-1 break-all text-sm text-gray-600 md:block">{SUPPORT_EMAIL}</p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <i className="ri-send-plane-line" />
              {t('customerSupport.channels.email.button')}
            </a>
          </div>
        </section>
        <p className="mt-3 flex items-center justify-center gap-1.5 break-keep text-center text-xs text-gray-500">
          <i className="ri-time-line" />
          {t('customerSupport.channels.hours')}
        </p>

        {/* 탭 */}
        <div id="support-tabs" className="mt-8 scroll-mt-[180px] md:mt-10 md:scroll-mt-[140px]">
          <div role="tablist" className="mx-auto grid max-w-sm grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1">
            {(['faq', 'contact'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => selectTab(tab)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors md:text-base ${
                  activeTab === tab ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t(`customerSupport.tabs.${tab}`)}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'faq' ? (
          <section className="mx-auto mt-6 max-w-3xl">
            <div className="relative">
              <i className="ri-search-line pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('customerSupport.faq.searchPlaceholder')}
                className="h-12 w-full rounded-full border border-gray-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ key: 'all', icon: 'ri-apps-line' }, ...categories].map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategory(cat.key)}
                  aria-pressed={category === cat.key}
                  className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                    category === cat.key ? 'bg-ink text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <i className={cat.icon} />
                  {cat.key === 'all' ? t('customerSupport.faq.all') : t(`customerSupport.faq.categories.${cat.key}.name`)}
                </button>
              ))}
            </div>

            {visibleCategories.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-gray-100 bg-white px-6 py-10 text-center shadow-sm">
                <p className="break-keep text-sm text-gray-600">{t('customerSupport.faq.noResults')}</p>
                <button
                  type="button"
                  onClick={() => selectTab('contact')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {t('customerSupport.faq.askButton')}
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                {visibleCategories.map((cat) => (
                  <div key={cat.key}>
                    <h2 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-bold text-gray-900">
                      <i className={`${cat.icon} text-blue-600`} />
                      {t(`customerSupport.faq.categories.${cat.key}.name`)}
                    </h2>
                    <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                      {cat.items.map((item) => {
                        const id = `${cat.key}.${item.key}`;
                        const base = `customerSupport.faq.categories.${cat.key}.items.${item.key}`;
                        // 검색 중에는 결과를 모두 펼쳐 보여 준다
                        const open = Boolean(keyword) || openKey === id;
                        return (
                          <div key={id}>
                            <button
                              type="button"
                              onClick={() => setOpenKey(open && !keyword ? null : id)}
                              aria-expanded={open}
                              className="flex w-full items-start gap-3 px-4 py-4 text-left md:px-5"
                            >
                              <span className="mt-px text-sm font-extrabold text-blue-600">Q</span>
                              <span className="flex-1 break-keep text-sm font-semibold text-gray-900 md:text-[15px]">
                                {t(`${base}.question`)}
                              </span>
                              <i className={`ri-arrow-down-s-line text-lg text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                            </button>
                            {open && (
                              <div className="-mt-1 px-4 pb-4 pl-10 md:px-5 md:pl-11">
                                <p className="break-keep text-sm leading-relaxed text-gray-600">{t(`${base}.answer`)}</p>
                                {item.link && (
                                  <LocaleLink
                                    href={item.link}
                                    className="mt-2 inline-flex items-center text-sm font-semibold text-blue-700 hover:underline"
                                  >
                                    {t(`${base}.link`)}
                                    <i className="ri-arrow-right-s-line text-base" />
                                  </LocaleLink>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-6 text-center text-sm text-gray-500">
              <LocaleLink href="/guide" className="font-semibold text-gray-700 underline underline-offset-2 hover:text-gray-900">
                {t('footer.guide')}
              </LocaleLink>
              <span className="mx-2 text-gray-300">·</span>
              <LocaleLink href="/policy/refund" className="font-semibold text-gray-700 underline underline-offset-2 hover:text-gray-900">
                {t('footer.refundPolicy')}
              </LocaleLink>
            </p>
          </section>
        ) : (
          <section className="mx-auto mt-6 max-w-2xl rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-7">
            <h2 className="text-lg font-bold text-gray-900 md:text-xl">{t('customerSupport.contact.title')}</h2>
            <p className="mb-5 mt-1 break-keep text-sm text-gray-600">{t('customerSupport.contact.description')}</p>
            <InquiryForm user={user} />
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
