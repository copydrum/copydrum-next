'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { useCart } from '@/hooks/useCart';
import MainHeader from '@/components/common/MainHeader';
import Footer from '@/components/common/Footer';
import LocaleLink from '@/components/common/LocaleLink';
import { isFavorite, toggleFavorite } from '@/lib/favorites';
import { hasPurchasedSheet } from '@/lib/purchaseCheck';
// 옛날 결제 시스템 import 제거 - 이제 /payments/[orderId] 페이지 사용
import type { VirtualAccountInfo } from '@/lib/payments';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '@/lib/currency';
import { useSiteLanguage } from '@/hooks/useSiteLanguage';
import { useBuyNow } from '@/hooks/useBuyNow';
import { useUserCredits } from '@/hooks/useUserCredits';
import { sanitizeLessonDetailHtml } from '@/lib/sanitizeLessonDetailHtml';
import RelatedSheets from './RelatedSheets';
import ReviewSection from './ReviewSection';
import { generateDefaultThumbnail } from '@/lib/defaultThumbnail';
import { useEventSales } from '@/hooks/useEventSales';
import EventSaleDetailBanner from '@/components/event-sale/EventSaleDetailBanner';
import SalePrice from '@/components/event-sale/SalePrice';
import AddToMyBookButton from '@/components/myBook/AddToMyBookButton';

interface DrumSheet {
  id: string;
  title: string;
  artist: string;
  category_id?: string;
  difficulty: string;
  price: number;
  pdf_url?: string;
  preview_image_url: string | null;
  thumbnail_url: string | null;
  youtube_url: string | null;
  album_name?: string;
  page_count?: number;
  tempo?: number;
  is_featured?: boolean;
  created_at?: string;
  slug?: string;
  categories?: { name: string } | null;
  sales_type?: 'INSTANT' | 'PREORDER';
  description?: string | null;
  table_of_contents?: string | null;
  title_translations?: Record<string, string> | null;
  table_of_contents_translations?: Record<string, string> | null;
}

function lessonDetailLooksLikeHtml(raw: string): boolean {
  return /<[a-z][\s\S]*>/i.test(raw.trim());
}

function LessonBookDetailBody({ raw }: { raw: string }) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (lessonDetailLooksLikeHtml(trimmed)) {
    return (
      <div
        className="prose prose-sm sm:prose-base max-w-none text-gray-800 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg"
        dangerouslySetInnerHTML={{ __html: sanitizeLessonDetailHtml(trimmed) }}
      />
    );
  }
  return (
    <pre className="font-sans text-sm sm:text-[15px] leading-7 text-gray-800 whitespace-pre-wrap break-words m-0">
      {trimmed}
    </pre>
  );
}

export default function SheetDetailClient({ sheet }: { sheet: DrumSheet }) {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const { addToCart, isInCart } = useCart();
  const [isFavoriteSheet, setIsFavoriteSheet] = useState(false);
  const [favoriteProcessing, setFavoriteProcessing] = useState(false);
  // 옛날 결제 시스템 state 제거 - 이제 /payments/[orderId] 페이지 사용
  const { i18n, t } = useTranslation();
  const { isKoreanSite } = useSiteLanguage();
  
  // description 파싱 및 언어별 추출
  const getDescriptionForCurrentLanguage = (): string | null => {
    if (!sheet.description) return null;
    
    try {
      // JSON 문자열인 경우 파싱
      let descriptionObj: Record<string, string> | string = sheet.description;
      if (typeof sheet.description === 'string' && sheet.description.trim().startsWith('{')) {
        descriptionObj = JSON.parse(sheet.description);
      }
      
      // 객체인 경우 현재 언어에 맞는 description 추출
      if (typeof descriptionObj === 'object' && descriptionObj !== null) {
        const currentLang = i18n.language || 'ko';
        // 언어 코드 매핑 (zh-cn -> zh-CN 등)
        const langMap: Record<string, string> = {
          'zh-cn': 'zh-CN',
          'zh-tw': 'zh-TW',
        };
        const normalizedLang = langMap[currentLang] || currentLang;
        
        return descriptionObj[normalizedLang] || descriptionObj[currentLang] || descriptionObj.ko || descriptionObj.en || Object.values(descriptionObj)[0] || null;
      }
      
      // 문자열인 경우 그대로 반환
      return typeof descriptionObj === 'string' ? descriptionObj : null;
    } catch (e) {
      // 파싱 실패 시 원본 문자열 반환
      return typeof sheet.description === 'string' ? sheet.description : null;
    }
  };
  
  const displayDescription = getDescriptionForCurrentLanguage();

  const isYouTubeCategory = sheet.categories?.name === '드럼솔로' || sheet.categories?.name === '드럼커버';

  const isSheetBook = sheet.categories?.name === '악보집';

  // 드럼레슨 교재(=드럼레슨 카테고리) 여부 판정 (목차 표시 등 UI 분기용)
  const isLessonBook =
    sheet.categories?.name === '드럼레슨' ||
    (!isSheetBook &&
      typeof sheet.table_of_contents === 'string' &&
      sheet.table_of_contents.trim().length > 0) ||
    (!isSheetBook &&
      typeof sheet.table_of_contents_translations?.en === 'string' &&
      sheet.table_of_contents_translations.en.trim().length > 0);

  const isBookProduct = isLessonBook || isSheetBook;

  const displaySheetTitle =
    isBookProduct && i18n.language !== 'ko'
      ? (sheet.title_translations?.en?.trim() || sheet.title)
      : sheet.title;

  const lessonDetailKo = sheet.table_of_contents?.trim() ?? '';
  const lessonDetailEn = sheet.table_of_contents_translations?.en?.trim() ?? '';
  const lessonDetailToShow =
    i18n.language === 'ko' ? lessonDetailKo : lessonDetailEn || lessonDetailKo;

  // 통화 로직
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);
  const displayPrice = sheet.price;

  const formatCurrency = (value: number) => {
    const convertedAmount = convertFromKrw(value, currency, i18n.language);
    return formatCurrencyUtil(convertedAmount, currency);
  };

  // 카테고리 이름 번역
  const getCategoryName = (categoryName: string | null | undefined): string => {
    if (!categoryName) return '';
    if (i18n.language === 'ko') return categoryName;

    if (categoryName === '악보집') return t('sheetBooks.title');
    if (categoryName === '드럼레슨') return t('freeSheets.categories.drumLesson');

    if (i18n.language === 'en') {
      const categoryMap: Record<string, string> = {
        '가요': t('categoriesPage.categories.kpop'),
        '팝': t('categoriesPage.categories.pop'),
        '락': t('categoriesPage.categories.rock'),
        'CCM': t('categoriesPage.categories.ccm'),
        '트로트/성인가요': t('categoriesPage.categories.trot'),
        '재즈': t('categoriesPage.categories.jazz'),
        'J-POP': t('categoriesPage.categories.jpop'),
        'OST': t('categoriesPage.categories.ost'),
        '드럼솔로': t('categoriesPage.categories.drumSolo'),
        '드럼커버': t('categoriesPage.categories.drumCover'),
        '기타': t('categoriesPage.categories.other'),
      };
      return categoryMap[categoryName] || categoryName;
    }

    if (i18n.language === 'ja') {
      const categoryMapJa: Record<string, string> = {
        '가요': t('category.kpop'),
        '팝': t('category.pop'),
        '락': t('category.rock'),
        'CCM': t('category.ccm'),
        '트로트/성인가요': t('category.trot'),
        '재즈': t('category.jazz'),
        'J-POP': t('category.jpop'),
        'OST': t('category.ost'),
        '드럼솔로': t('category.drumSolo'),
        '드럼커버': t('category.drumCover'),
        '기타': t('category.other'),
      };
      return categoryMapJa[categoryName] || categoryName;
    }

    const categoryMap: Record<string, string> = {
      '가요': t('categoriesPage.categories.kpop'),
      '팝': t('categoriesPage.categories.pop'),
      '락': t('categoriesPage.categories.rock'),
      'CCM': t('categoriesPage.categories.ccm'),
      '트로트/성인가요': t('categoriesPage.categories.trot'),
      '재즈': t('categoriesPage.categories.jazz'),
      'J-POP': t('categoriesPage.categories.jpop'),
      'OST': t('categoriesPage.categories.ost'),
      '드럼솔로': t('categoriesPage.categories.drumSolo'),
      '드럼커버': t('categoriesPage.categories.drumCover'),
      '기타': t('categoriesPage.categories.other'),
    };
    return categoryMap[categoryName] || categoryName;
  };

  // 모바일 스크롤 처리
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }, [sheet.id]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const loadFavoriteState = async () => {
      if (!user || !sheet.id) {
        setIsFavoriteSheet(false);
        return;
      }
      try {
        const favorite = await isFavorite(sheet.id, user.id);
        setIsFavoriteSheet(favorite);
      } catch (error) {
        console.error('찜 상태 로드 오류:', error);
      }
    };
    loadFavoriteState();
  }, [user, sheet.id]);

  const getDifficultyBadgeColor = (difficulty: string) => {
    const normalizedDifficulty = (difficulty || '').toLowerCase().trim();
    switch (normalizedDifficulty) {
      case 'beginner':
      case '초급':
        return 'bg-green-100 text-green-800';
      case 'intermediate':
      case '중급':
        return 'bg-yellow-100 text-yellow-800';
      case 'advanced':
      case '고급':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getDifficultyDisplayText = (difficulty: string) => {
    if (!difficulty) return t('sheetDetail.difficulty.notSet');
    const normalizedDifficulty = (difficulty || '').toLowerCase().trim();

    if (i18n.language === 'ko') return difficulty;

    if (i18n.language === 'en') {
      const difficultyMapEn: Record<string, string> = {
        '초급': 'Beginner',
        '중급': 'Intermediate',
        '고급': 'Advanced',
      };
      if (difficultyMapEn[difficulty]) return difficultyMapEn[difficulty];
    }

    if (i18n.language === 'ja') {
      const difficultyMapJa: Record<string, string> = {
        '초급': t('sheetDetail.difficulty.beginner'),
        '중급': t('sheetDetail.difficulty.intermediate'),
        '고급': t('sheetDetail.difficulty.advanced'),
        'beginner': t('sheetDetail.difficulty.beginner'),
        'intermediate': t('sheetDetail.difficulty.intermediate'),
        'advanced': t('sheetDetail.difficulty.advanced'),
      };
      if (difficultyMapJa[normalizedDifficulty] || difficultyMapJa[difficulty]) {
        return difficultyMapJa[normalizedDifficulty] || difficultyMapJa[difficulty];
      }
    }

    const difficultyMap: Record<string, string> = {
      '초급': 'beginner',
      '중급': 'intermediate',
      '고급': 'advanced',
      'beginner': 'beginner',
      'intermediate': 'intermediate',
      'advanced': 'advanced',
    };

    const mappedKey = difficultyMap[normalizedDifficulty] || difficultyMap[difficulty];
    if (mappedKey) {
      const translated = t(`sheetDetail.difficulty.${mappedKey}`);
      if (translated !== `sheetDetail.difficulty.${mappedKey}`) return translated;
    }

    switch (normalizedDifficulty) {
      case 'beginner':
        return t('sheetDetail.difficulty.beginner');
      case 'intermediate':
        return t('sheetDetail.difficulty.intermediate');
      case 'advanced':
        return t('sheetDetail.difficulty.advanced');
      default:
        return difficulty;
    }
  };

  const getSheetPrice = () => {
    return Math.max(0, sheet.price ?? 0);
  };

  const isFreeSheet = getSheetPrice() === 0;

  const eventSales = useEventSales();
  const activeEvent = isFreeSheet ? null : eventSales.getActiveEvent(sheet.id);
  const scheduledEvent = isFreeSheet || activeEvent ? null : eventSales.getScheduledEvent(sheet.id);

  // 무료 악보 직접 다운로드
  const [downloadingFree, setDownloadingFree] = useState(false);
  const handleFreeDownload = async () => {
    if (!sheet.pdf_url) {
      alert(t('freeSheets.errors.pdfNotReady'));
      return;
    }
    setDownloadingFree(true);
    try {
      const response = await fetch(sheet.pdf_url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${sheet.title} - ${sheet.artist}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download error:', error);
      alert(t('freeSheets.errors.pdfNotReady'));
    } finally {
      setDownloadingFree(false);
    }
  };

  // 옛날 결제 처리 함수들 제거 - 이제 /payments/[orderId] 페이지에서 처리

  const [buyingNow, setBuyingNow] = useState(false);
  const buyNow = useBuyNow(user);
  const { credits } = useUserCredits(user);

  const handleBuyNow = async () => {
    if (!sheet) return;
    if (isFreeSheet) {
      await handleFreeDownload();
      return;
    }
    await buyNow.handleBuyNow({
      id: sheet.id,
      title: displaySheetTitle,
      price: getSheetPrice(),
    });
  };

  const handleAddToCart = async () => {
    if (!sheet) return;

    // 비회원은 로그인 없이 게스트 장바구니(localStorage)에 담는다.
    if (!user) {
      await addToCart(sheet.id);
      return;
    }

    try {
      const alreadyPurchased = await hasPurchasedSheet(user.id, sheet.id);
      if (alreadyPurchased) {
        alert(t('sheetDetail.alreadyPurchased'));
        return;
      }
    } catch (error) {
      console.error('장바구니 담기 전 구매 이력 확인 오류:', error);
      alert(t('sheetDetail.purchaseCheckError'));
      return;
    }

    await addToCart(sheet.id);
  };

  const handleToggleFavorite = async () => {
    if (!sheet.id) return;

    if (!user) {
      alert(t('sheetDetail.loginRequired'));
      return;
    }

    setFavoriteProcessing(true);
    try {
      const favorite = await toggleFavorite(sheet.id, user.id);
      setIsFavoriteSheet(favorite);
    } catch (error) {
      console.error('찜하기 처리 오류:', error);
      alert(t('sheetDetail.favoriteError'));
    } finally {
      setFavoriteProcessing(false);
    }
  };

  const getPreviewImageUrl = (sheet: DrumSheet) => {
    if (sheet.preview_image_url) {
      return sheet.preview_image_url;
    }
    // 외부 서비스(readdy.ai) 의존 제거 → 로컬 SVG 플레이스홀더
    return generateDefaultThumbnail(600, 800);
  };

  const handlePreviewImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.target as HTMLImageElement;
    img.src = generateDefaultThumbnail(600, 800);
  };

  const extractVideoId = (url: string): string => {
    const regex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : '';
  };

  // 이미 산 악보면 구매 버튼 대신 구매내역 안내를 보여 준다
  const [purchased, setPurchased] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!user || isFreeSheet) {
      setPurchased(false);
      return;
    }
    hasPurchasedSheet(user.id, sheet.id)
      .then((value) => {
        if (!cancelled) setPurchased(value);
      })
      .catch(() => {
        if (!cancelled) setPurchased(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, sheet.id, isFreeSheet]);

  useEffect(() => {
    if (!showPreviewModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowPreviewModal(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPreviewModal]);

  const inCart = isInCart(sheet.id);
  const isPreorder = sheet.sales_type === 'PREORDER';
  const videoId = sheet.youtube_url ? extractVideoId(sheet.youtube_url) : '';
  const categoryHref = isSheetBook
    ? '/sheet-books'
    : isLessonBook
      ? '/free-sheets'
      : `/categories${sheet.category_id ? `?category=${sheet.category_id}` : ''}`;
  const categoryLabel = isSheetBook
    ? t('sheetBooks.title')
    : isLessonBook
      ? t('sidebar.nav.drumLesson')
      : getCategoryName(sheet.categories?.name);
  const imageSrc = isYouTubeCategory
    ? sheet.thumbnail_url || (videoId ? `https://i.ytimg.com/vi/${videoId}/hq720.jpg` : generateDefaultThumbnail(1280, 720))
    : sheet.thumbnail_url || generateDefaultThumbnail(600, isBookProduct ? 800 : 600);
  const imageFallback = (e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.target as HTMLImageElement).src = isYouTubeCategory
      ? generateDefaultThumbnail(1280, 720)
      : generateDefaultThumbnail(600, isBookProduct ? 800 : 600);
  };
  const buyLabel = buyingNow
    ? t('sheetDetail.purchaseProcessing') || t('sheet.buyNowProcessing') || '...'
    : activeEvent
      ? t('eventSale.actions.buyNow')
      : t('categoriesPage.buyNow');

  const includes = [
    t('sheetDetail.highQualityPdf'),
    t('sheetDetail.printableFormat'),
    t('sheetDetail.instantDownloadFeature'),
    t('sheetDetail.lifetimeAccess'),
    t('sheetDetail.noLyrics'),
  ];

  const includesCard = (
    <div className="rounded-2xl border border-gray-100 p-4 lg:p-5">
      <p className="mb-2.5 text-sm font-bold text-gray-900">{t('sheetDetail.includes')}</p>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {includes.map((item) => (
          <li key={item} className="flex items-center gap-1.5 text-sm text-gray-600">
            <i className="ri-check-line text-base text-blue-600" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );

  const favoriteButton = (size: 'md' | 'lg') => (
    <button
      type="button"
      onClick={handleToggleFavorite}
      disabled={favoriteProcessing}
      aria-label={isFavoriteSheet ? t('sheetDetail.removeFromFavorites') : t('sheetDetail.addToFavorites')}
      className={`flex flex-shrink-0 items-center justify-center rounded-xl border transition-colors ${size === 'lg' ? 'h-12 w-12' : 'h-10 w-10'} ${
        isFavoriteSheet ? 'border-rose-200 bg-rose-50 text-rose-500' : 'border-gray-200 text-gray-400 hover:border-rose-200 hover:text-rose-500'
      } ${favoriteProcessing ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <i className={`ri-heart-${isFavoriteSheet ? 'fill' : 'line'} text-xl`} />
    </button>
  );

  const purchasedNotice = (
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold text-blue-800">
        <i className="ri-checkbox-circle-fill text-base" />
        {t('sheetDetail.purchasedTitle')}
      </p>
      <p className="mt-0.5 break-keep text-xs text-blue-900/70">{t('sheetDetail.purchasedDesc')}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <MainHeader user={user} />

      <main className="mx-auto max-w-6xl px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pt-8">
        {/* 경로 */}
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500 sm:text-sm">
            <li>
              <LocaleLink href="/" className="hover:text-gray-800">
                {t('common.breadcrumb.home')}
              </LocaleLink>
            </li>
            <li aria-hidden="true" className="text-gray-300">/</li>
            <li>
              <LocaleLink href={categoryHref} className="hover:text-gray-800">
                {categoryLabel}
              </LocaleLink>
            </li>
            <li aria-hidden="true" className="text-gray-300">/</li>
            <li className="min-w-0 truncate font-medium text-gray-700" aria-current="page">
              {displaySheetTitle}
            </li>
          </ol>
        </nav>

        <div className="mt-4 grid grid-cols-1 gap-6 lg:mt-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
          {/* 정보·구매 (모바일에서는 맨 위, PC에서는 오른쪽) */}
          <div className="flex flex-col gap-5 lg:order-2">
            <div className="flex items-start gap-4">
              {!isYouTubeCategory && (
                <img
                  src={imageSrc}
                  alt=""
                  className={`${isBookProduct ? 'w-20 aspect-[3/4]' : 'h-24 w-24'} flex-shrink-0 rounded-xl border border-gray-100 object-cover lg:hidden`}
                  onError={imageFallback}
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="break-words text-xl font-extrabold leading-tight text-gray-900 lg:text-3xl">{displaySheetTitle}</h1>
                <p className="mt-1 text-base text-gray-600 lg:text-lg">{sheet.artist}</p>
                {sheet.album_name && sheet.album_name !== displaySheetTitle && (
                  <p className="mt-0.5 text-sm text-gray-500">
                    {t('sheetDetail.album')} · {sheet.album_name}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {isPreorder && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">{t('sheetDetail.preorderBadge')}</span>
                  )}
                  {sheet.difficulty && (
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${getDifficultyBadgeColor(sheet.difficulty)}`}>
                      {getDifficultyDisplayText(sheet.difficulty)}
                    </span>
                  )}
                  {categoryLabel && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{categoryLabel}</span>
                  )}
                  {sheet.page_count ? (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      {sheet.page_count}
                      {t('sheetDetail.pages')}
                    </span>
                  ) : null}
                  {sheet.tempo ? (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{sheet.tempo} BPM</span>
                  ) : null}
                </div>
              </div>
              {!purchased && <div className="lg:hidden">{favoriteButton('md')}</div>}
            </div>

            {(activeEvent || scheduledEvent) && (
              <EventSaleDetailBanner
                event={(activeEvent || scheduledEvent)!}
                mode={activeEvent ? 'active' : 'scheduled'}
                price={displayPrice}
                showPrice={false}
              />
            )}

            {purchased && purchasedNotice}

            {isPreorder && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-900">{t('sheetDetail.preorderNotice.title')}</p>
                <p className="mt-1 break-keep text-xs leading-relaxed text-amber-900/80">{t('sheetDetail.preorderNotice.description')}</p>
              </div>
            )}

            {/* PC 구매 영역 (모바일은 하단 고정 바) */}
            <div className="hidden space-y-3 rounded-2xl border border-gray-100 bg-gray-50/70 p-5 lg:block">
              {isFreeSheet ? (
                <>
                  <p className="text-3xl font-extrabold text-blue-600">FREE</p>
                  <button
                    type="button"
                    onClick={handleFreeDownload}
                    disabled={downloadingFree}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    <i className={`${downloadingFree ? 'ri-loader-4-line animate-spin' : 'ri-download-line'} text-xl`} />
                    {downloadingFree ? '...' : t('freeSheets.actions.viewFreeSheet') || '무료 다운로드'}
                  </button>
                </>
              ) : (
                <>
                  <SalePrice
                    price={displayPrice}
                    event={activeEvent}
                    size="lg"
                    regularClassName="text-3xl font-extrabold text-gray-900"
                  />
                  {purchased ? (
                    <div className="flex gap-2">
                      <LocaleLink
                        href="/purchases"
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white hover:bg-blue-700"
                      >
                        <i className="ri-download-2-line" />
                        {t('sheetDetail.purchasedCta')}
                      </LocaleLink>
                      {favoriteButton('lg')}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {favoriteButton('lg')}
                      <button
                        type="button"
                        onClick={handleAddToCart}
                        disabled={inCart}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3.5 text-base font-bold transition ${
                          inCart ? 'bg-blue-50 text-blue-600' : 'bg-ink text-white hover:bg-ink-light'
                        }`}
                      >
                        <i className={inCart ? 'ri-check-line' : 'ri-shopping-cart-2-line'} />
                        {inCart ? t('sheetDetail.inCart') : t('categoriesPage.addToCart')}
                      </button>
                      <button
                        type="button"
                        onClick={handleBuyNow}
                        disabled={buyingNow}
                        className={`flex flex-1 items-center justify-center rounded-xl py-3.5 text-base font-bold text-white transition disabled:opacity-60 ${
                          activeEvent ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {buyLabel}
                      </button>
                    </div>
                  )}
                  <AddToMyBookButton sheet={sheet} />
                </>
              )}
              <p className="flex items-start gap-1.5 break-keep text-xs leading-relaxed text-gray-500">
                <i className="ri-shield-check-line mt-px text-sm text-blue-600" />
                {t('sheetDetail.paymentInfo')}
              </p>
            </div>

            <div className="hidden lg:block">{includesCard}</div>
          </div>

          {/* 이미지·미리보기 (PC 왼쪽) */}
          <div className="flex flex-col gap-5 lg:order-1">
            <div className={`overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 ${isYouTubeCategory ? '' : 'hidden lg:block'}`}>
              <div className={`relative ${isYouTubeCategory ? 'aspect-video' : isBookProduct ? 'aspect-[3/4]' : 'aspect-square'}`}>
                <img src={imageSrc} alt={`${displaySheetTitle} - ${sheet.artist}`} className="h-full w-full object-cover" onError={imageFallback} />
                {isYouTubeCategory && videoId && (
                  <a
                    href="#video"
                    aria-label={t('sheetDetail.performanceVideo')}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-rose-600 shadow-lg transition-transform hover:scale-110">
                      <i className="ri-play-fill text-3xl" />
                    </span>
                  </a>
                )}
              </div>
            </div>

            {sheet.preview_image_url && (
              <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold text-gray-900 lg:text-base">
                    <i className="ri-file-music-line text-lg text-blue-600" />
                    {t('sheetDetail.sheetMusicPreview')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 lg:text-sm"
                  >
                    <i className="ri-zoom-in-line text-base" />
                    {t('sheetDetail.enlargePreview')}
                  </button>
                </div>
                <button type="button" onClick={() => setShowPreviewModal(true)} className="relative block w-full p-3">
                  <img
                    src={getPreviewImageUrl(sheet)}
                    alt={`${displaySheetTitle} ${t('sheetDetail.sheetMusicPreview')}`}
                    className="max-h-[520px] w-full rounded-lg object-cover object-top"
                    onError={handlePreviewImageError}
                  />
                  <span className="pointer-events-none absolute inset-x-3 bottom-3 h-1/3 rounded-b-lg bg-gradient-to-t from-white via-white/80 to-transparent" />
                  <span className="absolute inset-x-6 bottom-6 rounded-lg bg-white/90 px-3 py-2 text-center text-xs font-medium text-gray-700 shadow-sm lg:text-sm">
                    {t('sheetDetail.fullSheetAfterPurchase')}
                  </span>
                </button>
              </section>
            )}
          </div>
        </div>

        {/* 상세 설명 · 목차 · 영상 */}
        <div className="mt-6 space-y-6 lg:mt-12">
          {/* 모바일은 미리보기를 먼저 보여 주고 확인사항은 그 아래에 둔다 */}
          <div className="lg:hidden">{includesCard}</div>
          {displayDescription && (
            <section className="rounded-2xl border border-gray-100 p-5 lg:p-6">
              <h2 className="mb-3 text-base font-bold text-gray-900 lg:text-lg">{t('sheetDetail.description', '상세 설명')}</h2>
              <div className="leading-relaxed text-gray-700">
                <LessonBookDetailBody raw={displayDescription} />
              </div>
            </section>
          )}

          {isBookProduct && lessonDetailToShow.length > 0 && (
            <section className="rounded-2xl border border-gray-100 p-5 lg:p-6">
              <h2 className="mb-3 flex items-center gap-1.5 text-base font-bold text-gray-900 lg:text-lg">
                <i className="ri-list-ordered-2 text-blue-600" />
                {t('sheetDetail.tableOfContents')}
              </h2>
              <div className="rounded-xl bg-gray-50 p-4 sm:p-5">
                <LessonBookDetailBody raw={lessonDetailToShow} />
              </div>
            </section>
          )}

          {sheet.youtube_url && videoId && (
            <section id="video" className="scroll-mt-[180px] rounded-2xl border border-gray-100 p-4 lg:scroll-mt-[140px] lg:p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-1.5 text-base font-bold text-gray-900 lg:text-lg">
                  <i className="ri-youtube-fill text-xl text-rose-600" />
                  {isBookProduct ? t('freeSheets.actions.viewYoutubeLesson') : t('sheetDetail.performanceVideo')}
                </h2>
                <a
                  href={sheet.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 lg:text-sm"
                >
                  {t('sheetDetail.watchOnYouTubeShort')}
                  <i className="ri-external-link-line" />
                </a>
              </div>
              <div className="aspect-video overflow-hidden rounded-xl bg-gray-100">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title={`${displaySheetTitle} - ${sheet.artist} ${t('sheetDetail.performanceVideo')}`}
                  className="h-full w-full"
                  frameBorder="0"
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* 미리보기 확대 */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4" onClick={() => setShowPreviewModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('sheetDetail.sheetMusicPreview')}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h2 className="text-base font-bold text-gray-900">{t('sheetDetail.sheetMusicPreview')}</h2>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                aria-label={t('sheetDetail.close')}
                className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
              <img
                src={getPreviewImageUrl(sheet)}
                alt={`${displaySheetTitle} ${t('sheetDetail.sheetMusicPreview')}`}
                className="h-auto w-full rounded-lg"
                onError={handlePreviewImageError}
              />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3">
              <p className="break-keep text-xs text-gray-600 sm:text-sm">{t('sheetDetail.purchaseToViewFull')}</p>
              {purchased ? (
                <LocaleLink
                  href="/purchases"
                  className="flex-shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {t('sheetDetail.purchasedCta')}
                </LocaleLink>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowPreviewModal(false);
                    void handleBuyNow();
                  }}
                  disabled={buyingNow}
                  className="flex-shrink-0 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {isFreeSheet ? t('freeSheets.actions.viewFreeSheet') || '무료 다운로드' : buyLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 리뷰/평점 */}
      <ReviewSection sheetId={sheet.id} user={user} />

      {/* 추천 악보 (같은 아티스트 → 같은 카테고리) */}
      <RelatedSheets currentSheetId={sheet.id} artist={sheet.artist} categoryId={sheet.category_id} />

      {/* 주문제작 CTA — 원하는 곡/버전이 없을 때 요청 유도 */}
      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl bg-gray-50 p-6 text-center sm:flex-row sm:text-left lg:p-8">
          <div>
            <h2 className="text-base font-bold text-gray-900 sm:text-lg">{t('sheetDetail.customOrderCta')}</h2>
            <p className="mt-1 break-keep text-sm text-gray-600">{t('sheetDetail.customOrderCtaDesc')}</p>
          </div>
          <LocaleLink
            href="/custom-order"
            className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <i className="ri-edit-line" />
            {t('sheetDetail.customOrderCtaButton')}
          </LocaleLink>
        </div>
      </section>

      <Footer />
      {/* 모바일: 하단 고정 구매 바에 가리지 않도록 그 높이만큼 푸터 색으로 이어 준다 */}
      <div className="h-[108px] bg-ink lg:hidden" />

      {/* === Mobile: 하단 고정 구매 바 === */}
      <div
        data-mobile-purchase-bar
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.08)] lg:hidden"
      >
        <p className="flex items-center justify-center gap-1.5 border-b border-gray-100 px-4 py-1.5 text-[11px] text-gray-500">
          <i className="ri-shield-check-line text-blue-600" />
          {t('home.trust.securePayment')} · {t('home.trust.instantDownload')}
        </p>
        {isFreeSheet ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-lg font-extrabold text-blue-600">FREE</span>
            <button
              type="button"
              onClick={handleFreeDownload}
              disabled={downloadingFree}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-60"
            >
              <i className={`${downloadingFree ? 'ri-loader-4-line animate-spin' : 'ri-download-line'} text-base`} />
              <span className="truncate">{downloadingFree ? '...' : t('freeSheets.actions.viewFreeSheet') || '무료 다운로드'}</span>
            </button>
          </div>
        ) : purchased ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <LocaleLink
              href="/purchases"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white active:bg-blue-700"
            >
              <i className="ri-download-2-line text-base" />
              {t('sheetDetail.purchasedCta')}
            </LocaleLink>
            {favoriteButton('lg')}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-shrink-0">
              <SalePrice
                price={displayPrice}
                event={activeEvent}
                size="md"
                stacked
                showPercent={false}
                regularClassName="text-lg font-extrabold leading-tight text-gray-900"
              />
            </div>
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={inCart}
              aria-label={inCart ? t('sheetDetail.inCart') : t('categoriesPage.addToCart')}
              className={`flex h-12 w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl transition active:scale-95 ${
                inCart ? 'bg-blue-50 text-blue-600' : 'bg-ink text-white'
              }`}
            >
              <i className={`${inCart ? 'ri-check-line' : 'ri-shopping-cart-2-line'} text-lg leading-none`} />
              <span className="text-[11px] font-semibold leading-none">{inCart ? t('sheetDetail.inCart') : t('categoriesPage.cartShort')}</span>
            </button>
            <AddToMyBookButton sheet={sheet} variant="compact" />
            <button
              type="button"
              onClick={handleBuyNow}
              disabled={buyingNow}
              className={`flex h-12 flex-1 items-center justify-center rounded-xl text-sm font-bold text-white transition active:scale-95 disabled:opacity-60 ${
                activeEvent ? 'bg-rose-600' : 'bg-blue-600'
              }`}
            >
              <span className="truncate">{buyLabel}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
