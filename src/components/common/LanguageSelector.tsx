'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
import { languages, getLanguageByCode, getLanguageFromPath } from '../../i18n/languages';

interface LanguageSelectorProps {
  variant?: 'desktop' | 'mobile';
  className?: string;
}

const buttonClassesByVariant: Record<'desktop' | 'mobile', string> = {
  desktop:
    'flex items-center space-x-2 px-4 py-2 text-blue-700 bg-white rounded-full border border-blue-100 shadow-sm hover:bg-blue-50 transition-colors duration-200',
  mobile:
    'flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-700 bg-white rounded-full border border-blue-100 shadow-sm',
};

const menuAlignmentByVariant: Record<'desktop' | 'mobile', string> = {
  desktop: 'right-0',
  mobile: 'left-0',
};

export default function LanguageSelector({ variant = 'desktop', className = '' }: LanguageSelectorProps) {
  const { i18n } = useTranslation();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // URL 경로에서 현재 언어를 감지 (가장 신뢰할 수 있는 소스)
  const currentLangCode = useMemo(() => {
    const pathLang = getLanguageFromPath(pathname);
    if (pathLang) return pathLang;
    return i18n.language || 'en';
  }, [pathname, i18n.language]);

  // URL 언어와 i18n 언어가 불일치하면 동기화
  useEffect(() => {
    if (currentLangCode && i18n.language !== currentLangCode) {
      i18n.changeLanguage(currentLangCode);
    }
  }, [currentLangCode, i18n]);

  const currentLanguage = useMemo(
    () => getLanguageByCode(currentLangCode) || languages[0],
    [currentLangCode],
  );

  const renderFlag = (flagCode: string, flagEmoji: string, size: 24 | 20 = 24) => {
    if (!flagCode) {
      return (
        <span className="text-xl" aria-hidden="true">
          {flagEmoji}
        </span>
      );
    }

    const dimension = size === 24 ? 'w24' : 'w20';
    return (
      <img
        src={`https://flagcdn.com/${dimension}/${flagCode}.png`}
        alt=""
        width={size}
        height={Math.round((size * 3) / 4)}
        className="rounded-sm object-cover"
        loading="lazy"
        suppressHydrationWarning
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  };

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLanguageChange = (langCode: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    // Language code to URL path segment mapping
    const localeToPath: Record<string, string> = {
      'en': 'en',       // English now has /en prefix
      'ko': 'ko',
      'ja': 'ja',
      'de': 'de',
      'es': 'es',
      'fr': 'fr',
      'hi': 'hi',
      'id': 'id',
      'it': 'it',
      'pt': 'pt',
      'ru': 'ru',
      'th': 'th',
      'tr': 'tr',
      'uk': 'uk',
      'vi': 'vi',
      'zh-CN': 'zh-cn',
      'zh-TW': 'zh-tw',
    };

    // Get current path without locale prefix
    let pathWithoutLocale = pathname;
    const pathSegments = pathname.split('/').filter(Boolean);

    // Remove current locale prefix if exists
    if (pathSegments.length > 0) {
      const firstSegment = pathSegments[0].toLowerCase();
      const possibleLocales = ['en', 'ko', 'ja', 'de', 'es', 'fr', 'hi', 'id', 'it', 'pt', 'ru', 'th', 'tr', 'uk', 'vi', 'zh-cn', 'zh-tw'];

      if (possibleLocales.includes(firstSegment)) {
        pathWithoutLocale = '/' + pathSegments.slice(1).join('/');
      }
    }

    // Build new path with selected locale
    const newLocalePath = localeToPath[langCode];
    const newPath = `/${newLocalePath}${pathWithoutLocale}`;

    // Preserve query parameters
    const search = window.location.search;

    // Navigate to new locale path
    window.location.href = newPath + search;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef} suppressHydrationWarning>
      {/* 언어 선택 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClassesByVariant[variant]}
        aria-label="언어 선택"
        suppressHydrationWarning
      >
        <span className="flex items-center gap-2" suppressHydrationWarning>
          {renderFlag(currentLanguage.flagCode, currentLanguage.flagEmoji)}
        </span>
        <span className="font-medium" suppressHydrationWarning>{currentLanguage.nativeName}</span>
        <span className="text-xs uppercase text-gray-500" suppressHydrationWarning>{currentLanguage.code}</span>
        <i className={`ri-arrow-${isOpen ? 'up' : 'down'}-s-line text-lg`}></i>
      </button>

      {/* 드롭다운 메뉴 */}
      {isOpen && (
        <div
          className={`absolute ${menuAlignmentByVariant[variant]} mt-3 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 max-h-96 overflow-y-auto`}
        >
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`w-full flex items-center space-x-3 px-4 py-2 hover:bg-blue-50 transition-colors duration-150 ${currentLanguage.code === lang.code ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
                }`}
            >
              <span className="flex items-center gap-2">
                {renderFlag(lang.flagCode, lang.flagEmoji, 20)}
              </span>
              <div className="flex-1 text-left">
                <div className="font-medium">{lang.nativeName}</div>
                <div className="text-xs text-gray-500">{lang.name}</div>
              </div>
              {currentLanguage.code === lang.code && (
                <i className="ri-check-line text-blue-600"></i>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

