'use client';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isGlobalSiteHost } from '../../config/hostType';
import { buildGenreNavItems, useGenreCategories } from '@/hooks/useGenreCategories';
import { openChatWidget } from '@/lib/chat/openChat';
import BrandLogo from './BrandLogo';
import LocaleLink from './LocaleLink';

interface FooterLink {
  label: string;
  href: string;
}

const YOUTUBE_URL = 'https://www.youtube.com/@COPYDRUM';
const EMAIL = 'copydrum@hanmail.net';
const BIZ_CHECK_URL = 'https://www.ftc.go.kr/bizCommPop.do?wrkr_no=3070786155';

export default function Footer() {
  const { t, i18n } = useTranslation();
  const currentYear = new Date().getFullYear();
  const [isGlobalSite, setIsGlobalSite] = useState<boolean>(false);
  const [businessOpen, setBusinessOpen] = useState(false);
  const categories = useGenreCategories();

  // 호스트 타입을 컴포넌트 마운트 시 한 번만 계산
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsGlobalSite(isGlobalSiteHost(window.location.host));
    }
  }, []);

  const genreLinks = useMemo(
    () => buildGenreNavItems(categories, i18n.language, t),
    [categories, i18n.language, t],
  );

  const supportLinks: FooterLink[] = [
    { label: t('footer.guide'), href: '/guide' },
    { label: t('footer.faq'), href: '/customer-support' },
    { label: t('footer.contact'), href: '/customer-support?tab=contact' },
    { label: t('footer.refundPolicy'), href: '/policy/refund' },
  ];

  const companyLinks: FooterLink[] = [
    { label: t('footer.about'), href: '/company/about' },
    { label: t('footer.businessInfo'), href: '/company/business-info' },
    { label: t('footer.terms'), href: '/policy/terms' },
    { label: t('footer.privacy'), href: '/policy/privacy' },
    { label: t('footer.partnership'), href: '/company/partnership' },
  ];

  const linkClass = 'text-white/70 transition-colors hover:text-white';
  // 개인정보처리방침은 다른 고지와 구분되게 강조한다
  const linkClassFor = (href: string) =>
    href === '/policy/privacy' ? 'font-bold text-white transition-colors hover:text-white/80' : linkClass;

  const youtubeButton = (
    <a
      href={YOUTUBE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="YouTube"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
    >
      <i className="ri-youtube-fill text-lg" />
    </a>
  );

  const businessToggleButton = (
    <button
      type="button"
      onClick={() => setBusinessOpen((open) => !open)}
      aria-expanded={businessOpen}
      className="flex items-center gap-1 text-xs font-semibold text-white/70 transition-colors hover:text-white"
    >
      {t('footer.businessToggle')}
      <i className={`ri-arrow-down-s-line text-base transition-transform ${businessOpen ? 'rotate-180' : ''}`} />
    </button>
  );

  const businessExtraDetails = (
    <>
      <p>
        {t('footer.telecomLicense')}
        <a
          href={BIZ_CHECK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 inline-flex items-center gap-0.5 rounded border border-white/20 px-1.5 text-[11px] leading-5 text-white/80 transition-colors hover:border-white/40 hover:text-white"
        >
          {t('footer.bizCheck')}
          <i className="ri-arrow-right-up-line" />
        </a>
      </p>
      <p>{t('footer.address')}</p>
      <p>{t('footer.hosting')}</p>
      <p>
        {t('footer.contactLabel')}:{' '}
        <button
          type="button"
          onClick={openChatWidget}
          className="inline-flex items-center gap-1 font-semibold text-white underline-offset-2 hover:underline"
        >
          <i className="ri-chat-3-line" />
          {t('footer.contactChat')}
        </button>
        <span className="mx-2 text-white/25">|</span>
        <a href={`mailto:${EMAIL}`} className="hover:text-white">
          {t('footer.email')}
        </a>
      </p>
    </>
  );

  return (
    <footer className="bg-ink text-white">
      {/* 모바일: 핵심 링크 + 접히는 사업자 정보. 하단 여백은 떠 있는 채팅 버튼 자리 */}
      <div className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-10 md:hidden">
        <div className="mb-6 flex items-center justify-between">
          <LocaleLink href="/" aria-label={t('site.name')}>
            <BrandLogo size={28} />
          </LocaleLink>
          {youtubeButton}
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-2.5 text-[13px]">
          {[...supportLinks, ...companyLinks].map((link) => (
            <li key={link.href}>
              <LocaleLink href={link.href} className={linkClassFor(link.href)}>
                {link.label}
              </LocaleLink>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-white/10 pt-4">
          {businessToggleButton}
          {/* 접혀 있어도 검색엔진·법정 고지를 위해 DOM에는 남겨 둔다 */}
          <div className={`mt-3 space-y-1 text-xs leading-relaxed text-white/60 ${businessOpen ? '' : 'hidden'}`}>
            <p>{t('footer.companyInfo')}</p>
            {businessExtraDetails}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-xs text-white/50">{t('footer.copyright', { year: currentYear })}</p>
          <img src="/komca.jpg" alt="KOMCA" width={40} height={40} className="h-10 w-10 rounded" />
        </div>
      </div>

      <div className="mx-auto hidden max-w-7xl px-4 pb-8 pt-14 sm:px-6 md:block lg:px-8">
        <div className="grid grid-cols-[1.4fr_1.2fr_1fr_1fr] gap-10">
          <div>
            <LocaleLink href="/" aria-label={t('site.name')} className="inline-block">
              <BrandLogo size={34} />
            </LocaleLink>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">{t('footer.description')}</p>
            <div className="mt-5 flex gap-2">{youtubeButton}</div>
          </div>

          <nav aria-label={t('footer.scoreCategoryTitle')}>
            <h2 className="mb-4 text-sm font-bold">{t('footer.scoreCategoryTitle')}</h2>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              {genreLinks.map((genre) => (
                <li key={genre.id}>
                  <LocaleLink href={genre.href} className={linkClass}>
                    {genre.label}
                  </LocaleLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t('footer.support')}>
            <h2 className="mb-4 text-sm font-bold">{t('footer.support')}</h2>
            <ul className="space-y-2.5 text-sm">
              {supportLinks.map((link) => (
                <li key={link.href}>
                  <LocaleLink href={link.href} className={linkClass}>
                    {link.label}
                  </LocaleLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t('footer.company')}>
            <h2 className="mb-4 text-sm font-bold">{t('footer.company')}</h2>
            <ul className="space-y-2.5 text-sm">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <LocaleLink href={link.href} className={linkClassFor(link.href)}>
                    {link.label}
                  </LocaleLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex items-start justify-between gap-8 border-t border-white/10 pt-8">
          <div className="space-y-1.5 text-[13px] leading-relaxed text-white/60">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <p>{t('footer.companyInfo')}</p>
              {businessToggleButton}
            </div>
            <div className={`space-y-1.5 ${businessOpen ? '' : 'hidden'}`}>{businessExtraDetails}</div>
          </div>
          <img src="/komca.jpg" alt="KOMCA" width={50} height={50} className="h-[50px] w-[50px] flex-shrink-0 rounded" />
        </div>

        <div className="mt-8 flex items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-white/50">
          <div>
            <p>{t('footer.copyright', { year: currentYear })}</p>
            {isGlobalSite && <p className="mt-1">{t('footer.globalService')}</p>}
          </div>
          <div className="flex items-center gap-4">
            <LocaleLink href="/policy/terms" className={linkClass}>
              {t('footer.terms')}
            </LocaleLink>
            <LocaleLink href="/policy/privacy" className={linkClassFor('/policy/privacy')}>
              {t('footer.privacy')}
            </LocaleLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
