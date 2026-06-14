'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isGlobalSiteHost } from '../../config/hostType';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export default function Footer() {
  const router = useLocaleRouter();
  const { t, i18n } = useTranslation();
  const currentYear = new Date().getFullYear();
  const pathname = usePathname();
  const [isGlobalSite, setIsGlobalSite] = useState<boolean>(false);

  // 호스트 타입을 컴포넌트 마운트 시 한 번만 계산
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsGlobalSite(isGlobalSiteHost(window.location.host));
    }
  }, []);

  const isKoreanLanguage =
    i18n.language === 'ko' || i18n.language.startsWith('ko-');

  // 카테고리 링크 (i18n 사용)
  const categoryLinks: FooterLink[] = [
    { label: t('category.kpop'), href: '/categories?search=가요' },
    { label: t('category.pop'), href: '/categories?search=팝' },
    { label: t('category.rock'), href: '/categories?search=락' },
    { label: t('category.jazz'), href: '/categories?search=재즈' },
    { label: t('category.jpop'), href: '/categories?search=J-POP' },
    { label: t('category.ost'), href: '/categories?search=OST' },
  ];

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

  const handleInternalNavigation = useCallback(
    (href: string) => () => {
      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        window.location.href = href;
        return;
      }

      router.push(href);
    },
    [router],
  );

  const renderLink = (link: FooterLink) => {
    if (link.external || link.href.startsWith('http') || link.href.startsWith('mailto:')) {
      return (
        <a
          key={link.label}
          href={link.href}
          className="text-gray-400 hover:text-white transition-colors cursor-pointer"
          target="_blank"
          rel="noopener noreferrer"
        >
          {link.label}
        </a>
      );
    }

    return (
      <button
        key={link.label}
        type="button"
        onClick={handleInternalNavigation(link.href)}
        className="text-left text-gray-400 hover:text-white transition-colors cursor-pointer"
      >
        {link.label}
      </button>
    );
  };

  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            {!isGlobalSite && (
              <div
                className="text-2xl font-bold mb-4 cursor-pointer"
                style={{ fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif' }}
                onClick={handleInternalNavigation('/')}
              >
                {t('site.name')}
              </div>
            )}
            <p className="text-gray-400 mb-6 leading-relaxed">
              {t('footer.description')}
            </p>
            <div className="flex space-x-4">
              <a
                href="https://www.youtube.com/@COPYDRUM"
                className="text-gray-400 hover:text-white cursor-pointer transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="ri-youtube-fill text-2xl"></i>
              </a>
            </div>
          </div>

          <div>
            <h5 className="font-semibold mb-4">{t('footer.scoreCategoryTitle')}</h5>
            <ul className="space-y-2">
              {categoryLinks.map((link) => (
                <li key={link.label}>{renderLink(link)}</li>
              ))}
            </ul>
          </div>

          <div>
            <h5 className="font-semibold mb-4">{t('footer.support')}</h5>
            <ul className="space-y-2">
              {supportLinks.map((link) => (
                <li key={link.label}>{renderLink(link)}</li>
              ))}
            </ul>
          </div>

          <div>
            <h5 className="font-semibold mb-4">{t('footer.company')}</h5>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
                <li key={link.label}>{renderLink(link)}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="text-sm text-gray-400 space-y-2 flex-1">
              <p>{t('footer.companyInfo')}</p>
              <p>{t('footer.telecomLicense')}</p>
              <p>{t('footer.address')}</p>
              {isKoreanLanguage ? (
                <>
                  <p>{t('footer.contactInfo')}</p>
                  <p>{t('footer.email')}</p>
                </>
              ) : (
                <>
                  <p>{t('footer.contactInfoGlobal')}</p>
                  <p>{t('footer.email')}</p>
                </>
              )}
              <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400 text-sm">
                <p>{t('footer.copyright', { year: new Date().getFullYear() })}</p>
                {isGlobalSite && (
                  <p className="mt-2 text-xs text-gray-500">
                    {t('footer.globalService')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex-shrink-0">
              <img src="/komca.jpg" alt="KOMCA" className="h-16 w-auto" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
