'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { ArrowLeft, Star, ShoppingCart, Music, X } from 'lucide-react';
import { useCart } from '@/hooks/useCart';
import MainHeader from '@/components/common/MainHeader';
import Footer from '@/components/common/Footer';
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
  const router = useRouter();
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

  return (
    <div className="min-h-screen bg-white">
      <MainHeader user={user} />

      <div>
        {/* Back Button */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-4">
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                router.back();
              } else {
                router.push('/categories');
              }
            }}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('sheetDetail.backToCategories')}</span>
          </button>

          {/* Breadcrumb (Home > 장르/레슨 > 곡) */}
          <nav aria-label="Breadcrumb" className="mt-2">
            <ol className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500 flex-wrap">
              <li>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="hover:text-gray-800 transition-colors"
                >
                  {t('common.breadcrumb.home')}
                </button>
              </li>
              <li aria-hidden="true" className="text-gray-300">/</li>
              <li>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      isSheetBook
                        ? '/sheet-books'
                        : isLessonBook
                          ? '/free-sheets'
                          : `/categories${sheet.category_id ? `?category=${sheet.category_id}` : ''}`,
                    )
                  }
                  className="hover:text-gray-800 transition-colors"
                >
                  {isSheetBook
                    ? t('sheetBooks.title')
                    : isLessonBook
                      ? t('sidebar.nav.drumLesson')
                      : getCategoryName(sheet.categories?.name)}
                </button>
              </li>
              <li aria-hidden="true" className="text-gray-300">/</li>
              <li className="text-gray-700 font-medium break-words" aria-current="page">
                {displaySheetTitle}
              </li>
            </ol>
          </nav>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
            {/* 왼쪽: 앨범 썸네일 + 모바일 곡 정보 */}
            <div className="space-y-6">
              {/* 1. 썸네일 (드럼솔로/드럼커버: 16:9, 드럼레슨 교재: 3:4, 일반: 정사각형) */}
              <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
                <div
                  className={`${
                    isYouTubeCategory
                      ? 'aspect-video'
                      : isBookProduct
                        ? 'aspect-[3/4]'
                        : 'aspect-square'
                  } bg-gray-50 relative group`}
                >
                  <img
                    src={
                      isYouTubeCategory
                        ? (sheet.thumbnail_url || (sheet.youtube_url ? `https://i.ytimg.com/vi/${extractVideoId(sheet.youtube_url)}/hq720.jpg` : generateDefaultThumbnail(1280, 720)))
                        : (sheet.thumbnail_url || generateDefaultThumbnail(600, isBookProduct ? 800 : 600))
                    }
                    alt={`${displaySheetTitle} - ${sheet.artist}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.src = isYouTubeCategory
                        ? generateDefaultThumbnail(1280, 720)
                        : isBookProduct
                          ? generateDefaultThumbnail(600, 800)
                          : generateDefaultThumbnail(600, 600);
                    }}
                  />
                  {isYouTubeCategory && sheet.youtube_url && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <a
                        href={sheet.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-red-600 shadow-lg transition-transform hover:scale-110"
                      >
                        <svg className="w-8 h-8 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </a>
                    </div>
                  )}
                </div>
                {/* 앨범 정보 바 (데스크톱 전용) */}
                <div className="hidden lg:block px-5 py-4 bg-gradient-to-r from-gray-50 to-white border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-900 truncate">{displaySheetTitle}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{sheet.artist}{sheet.album_name ? ` · ${sheet.album_name}` : ''}</p>
                </div>
              </div>

              {/* 2. 모바일: 제목, 가수, 가격, 난이도, 페이지, BPM, 장르 */}
              <div className="lg:hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <h1 className="text-xl font-bold text-gray-900 leading-tight break-words">{displaySheetTitle}</h1>
                      {sheet.is_featured && (
                        <Star className="w-5 h-5 mt-0.5 text-yellow-500 fill-current flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-base text-gray-600 mb-1">{sheet.artist}</p>
                    {sheet.album_name && (
                      <p className="text-sm text-gray-500 mb-2">{t('sheetDetail.album')}: {sheet.album_name}</p>
                    )}
                    <p className="text-sm text-gray-500 mb-2">{t('sheetDetail.instrumentPart')}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDifficultyBadgeColor(sheet.difficulty)}`}>
                        {getDifficultyDisplayText(sheet.difficulty)}
                      </span>
                      {sheet.page_count && (
                        <span className="text-xs text-gray-500">{sheet.page_count}{t('sheetDetail.pages')}</span>
                      )}
                      {sheet.tempo && (
                        <span className="text-xs text-gray-500">{sheet.tempo} BPM</span>
                      )}
                      <Music className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-xs text-gray-500">{getCategoryName(sheet.categories?.name)}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 flex flex-col items-end gap-2">
                    <span className="text-2xl font-bold text-blue-600">
                      {formatCurrency(displayPrice)}
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleFavorite}
                      disabled={favoriteProcessing}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                        isFavoriteSheet
                          ? 'border-red-200 bg-red-50 text-red-500'
                          : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
                      } ${favoriteProcessing ? 'opacity-60 cursor-not-allowed' : ''}`}
                      aria-label={isFavoriteSheet ? t('sheetDetail.removeFromFavorites') : t('sheetDetail.addToFavorites')}
                    >
                      <i className={`ri-heart-${isFavoriteSheet ? 'fill' : 'line'} text-lg`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. 모바일: 악보 미리보기 */}
              {sheet.preview_image_url && (
                <div className="lg:hidden bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <i className="ri-file-music-line text-lg text-blue-600"></i>
                      {t('sheetDetail.sheetMusicPreview')}
                    </h3>
                  </div>
                  <div className="p-4">
                    <div className="relative">
                      <img
                        src={getPreviewImageUrl(sheet)}
                        alt={`${displaySheetTitle} ${t('sheetDetail.sheetMusicPreview')}`}
                        className="w-full h-auto rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => setShowPreviewModal(true)}
                        onError={handlePreviewImageError}
                      />
                      <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-white/95 via-white/70 to-transparent rounded-b-lg"></div>
                      <div className="absolute bottom-3 left-3 right-3 text-center">
                        <p className="text-xs text-gray-700 font-medium bg-white/80 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm">
                          {t('sheetDetail.fullSheetAfterPurchase')}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPreviewModal(true)}
                      className="mt-3 w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer font-medium text-sm"
                    >
                      <i className="ri-zoom-in-line mr-1.5"></i>
                      {t('sheetDetail.enlargePreview')}
                    </button>
                  </div>
                </div>
              )}

              {/* 4. 모바일: 구매 전 확인사항 */}
              <div className="lg:hidden bg-gray-50 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-4">{t('sheetDetail.includes')}</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.highQualityPdf')}</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.printableFormat')}</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.instantDownloadFeature')}</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.lifetimeAccess')}</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.noLyrics')}</span>
                  </li>
                </ul>
              </div>

              {/* 5. 모바일: 상세 설명 */}
              {displayDescription && (
                <div className="lg:hidden bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-3">{t('sheetDetail.description', '상세 설명')}</h3>
                  <div className="text-gray-700 leading-relaxed">
                    <LessonBookDetailBody raw={displayDescription} />
                  </div>
                </div>
              )}

              {/* 유튜브 링크 버튼 */}
              {sheet.youtube_url && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-red-800">{t('sheetDetail.watchOnYouTube')}</h4>
                        <p className="text-sm text-red-700">{t('sheetDetail.checkPerformanceVideo')}</p>
                      </div>
                    </div>
                    <a
                      href={sheet.youtube_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 whitespace-nowrap cursor-pointer flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                      <span>{t('sheetDetail.watchOnYouTubeShort')}</span>
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* 오른쪽: 곡 정보 + 구매 */}
            <div className="space-y-8 hidden lg:block">
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  <h1 className="text-3xl font-bold text-gray-900">{displaySheetTitle}</h1>
                  {sheet.is_featured && (
                    <Star className="w-6 h-6 text-yellow-500 fill-current" />
                  )}
                </div>
                <p className="text-xl text-gray-600 mb-2">{sheet.artist}</p>
                {sheet.album_name && (
                  <p className="text-lg text-gray-500 mb-2">{t('sheetDetail.album')}: {sheet.album_name}</p>
                )}
                <p className="text-lg text-gray-500 mb-2">{t('sheetDetail.instrumentPart')}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span className="flex items-center space-x-1">
                    <Music className="w-4 h-4" />
                    <span>{getCategoryName(sheet.categories?.name)}</span>
                  </span>
                </div>
              </div>

              {/* Difficulty Badge & Additional Info */}
              <div className="flex items-center space-x-4 mb-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getDifficultyBadgeColor(sheet.difficulty)}`}>
                  {getDifficultyDisplayText(sheet.difficulty)}
                </span>
                {sheet.page_count && (
                  <span className="text-sm text-gray-600">
                    <i className="ri-file-line mr-1"></i>
                    {sheet.page_count}{t('sheetDetail.pages')}
                  </span>
                )}
                {sheet.tempo && (
                  <span className="text-sm text-gray-600">
                    <i className="ri-speed-line mr-1"></i>
                    {sheet.tempo} BPM
                  </span>
                )}
              </div>

              {/* Price */}
              <div className={`rounded-lg p-6 ${isFreeSheet ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-col">
                      {isFreeSheet ? (
                        <span className="text-3xl font-bold text-blue-600">
                          FREE
                        </span>
                      ) : (
                        <span className="text-3xl font-bold text-blue-600">
                          {formatCurrency(displayPrice)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 mb-2">{t('sheetDetail.instantDownload')}</p>
                    <p className="text-sm text-gray-500">{t('sheetDetail.pdfFormat')}</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    disabled={favoriteProcessing}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
                      isFavoriteSheet
                        ? 'border-red-200 bg-red-50 text-red-500'
                        : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
                    } ${favoriteProcessing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    aria-label={isFavoriteSheet ? t('sheetDetail.removeFromFavorites') : t('sheetDetail.addToFavorites')}
                  >
                    <i className={`ri-heart-${isFavoriteSheet ? 'fill' : 'line'} text-xl`} />
                  </button>
                </div>

                {isFreeSheet ? (
                  /* 무료 악보: 바로 다운로드 버튼 */
                  <div className="mt-4">
                    <button
                      onClick={handleFreeDownload}
                      disabled={downloadingFree}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-base font-bold hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] transition-all disabled:opacity-60 shadow-lg shadow-blue-500/25"
                    >
                      {downloadingFree ? (
                        <i className="ri-loader-4-line text-xl animate-spin"></i>
                      ) : (
                        <i className="ri-download-line text-xl"></i>
                      )}
                      <span>{downloadingFree ? '...' : (t('freeSheets.actions.viewFreeSheet') || '무료 다운로드')}</span>
                    </button>
                  </div>
                ) : (
                  /* 유료 악보: 장바구니 + 구매 버튼 */
                  <div className="space-y-3">
                    <div className="flex justify-end gap-2 sm:gap-3">
                      <button
                        onClick={handleAddToCart}
                        disabled={isInCart(sheet.id)}
                        className={`sheet-action-btn btn-cart px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base w-1/2 sm:w-auto h-auto min-w-0 sm:min-w-[120px] ${
                          isInCart(sheet.id) ? 'opacity-60' : ''
                        }`}
                      >
                        <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5" />
                        <span>
                          {isInCart(sheet.id)
                            ? t('categoriesPage.alreadyPurchasedGeneric') || t('categories.alreadyInCart')
                            : t('categoriesPage.addToCart')}
                        </span>
                      </button>

                      <button
                        onClick={handleBuyNow}
                        disabled={buyingNow}
                        className="sheet-action-btn btn-buy px-4 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base w-1/2 sm:w-auto h-auto min-w-0 sm:min-w-[120px]"
                      >
                        <span>
                          {buyingNow
                            ? t('sheetDetail.purchaseProcessing') || t('sheet.buyNowProcessing') || '처리 중...'
                            : t('categoriesPage.buyNow')}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 신뢰·결제 배지 (구매 전환) */}
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-gray-700">
                    <i className="ri-shield-check-line text-lg text-emerald-600"></i>
                    <span className="text-sm font-medium">{t('home.trust.securePayment')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <i className="ri-download-cloud-2-line text-lg text-blue-600"></i>
                    <span className="text-sm font-medium">{t('home.trust.instantDownload')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <i className="ri-bank-card-line text-lg text-indigo-600"></i>
                    <span className="text-sm font-medium">{t('home.trust.paymentMethods')}</span>
                  </div>
                </div>
              </div>

              {/* 데스크톱 전용: 상세 설명 */}
              {displayDescription && (
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="font-semibold text-gray-900 mb-3">{t('sheetDetail.description', '상세 설명')}</h3>
                  <div className="text-gray-700 leading-relaxed">
                    <LessonBookDetailBody raw={displayDescription} />
                  </div>
                </div>
              )}

              {/* Features */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="font-semibold text-gray-900 mb-4">{t('sheetDetail.includes')}</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.highQualityPdf')}</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.printableFormat')}</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.instantDownloadFeature')}</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.lifetimeAccess')}</span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                    <span>{t('sheetDetail.noLyrics')}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* ===== 악보 미리보기 섹션 (데스크톱 본문 영역) ===== */}
          {sheet.preview_image_url && (
            <div className="hidden lg:block bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mt-10">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <i className="ri-file-music-line text-xl text-blue-600"></i>
                  {t('sheetDetail.sheetMusicPreview')}
                </h3>
              </div>
              <div className="p-4 sm:p-6">
                <div className="relative max-w-2xl mx-auto">
                  <img
                    src={getPreviewImageUrl(sheet)}
                    alt={`${displaySheetTitle} ${t('sheetDetail.sheetMusicPreview')}`}
                    className="w-full h-auto rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                    onClick={() => setShowPreviewModal(true)}
                    onError={handlePreviewImageError}
                  />
                  {/* 하단 흐림 효과 */}
                  <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-white/95 via-white/70 to-transparent rounded-b-lg"></div>
                  {/* 미리보기 안내 */}
                  <div className="absolute bottom-4 left-4 right-4 text-center">
                    <p className="text-sm text-gray-700 font-medium bg-white/80 backdrop-blur-sm rounded-lg px-4 py-2.5 shadow-sm">
                      {t('sheetDetail.fullSheetAfterPurchase')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPreviewModal(true)}
                  className="mt-4 w-full max-w-2xl mx-auto block bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer font-medium text-sm"
                >
                  <i className="ri-zoom-in-line mr-1.5"></i>
                  {t('sheetDetail.enlargePreview')}
                </button>
              </div>
            </div>
          )}

          {/* 드럼레슨 교재 상세(목차) — 한국어/그 외 언어별 본문 */}
          {isBookProduct && lessonDetailToShow.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mt-8">
              <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <i className="ri-list-ordered-2 text-orange-600 text-xl"></i>
                  <span>{t('sheetDetail.tableOfContents')}</span>
                </h3>
              </div>
              <div className="p-6">
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4 sm:p-5">
                  <LessonBookDetailBody raw={lessonDetailToShow} />
                </div>
              </div>
            </div>
          )}

          {/* 유튜브 영상 섹션 (교재인 경우 "샘플 영상"으로 표기) */}
          {sheet.youtube_url && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden mt-8">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  <span>{isBookProduct ? t('freeSheets.actions.viewYoutubeLesson') : t('sheetDetail.performanceVideo')}</span>
                </h3>
              </div>
              <div className="p-4 sm:p-6">
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                  <iframe
                    src={`https://www.youtube.com/embed/${extractVideoId(sheet.youtube_url)}`}
                    title={`${displaySheetTitle} - ${sheet.artist} ${t('sheetDetail.performanceVideo')}`}
                    className="w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-gray-600">{t('sheetDetail.checkPerformanceVideo')}</p>
                  <a
                    href={sheet.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 whitespace-nowrap cursor-pointer flex items-center space-x-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                    </svg>
                    <span>{t('sheetDetail.watchOnYouTube')}</span>
                  </a>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 미리보기 확대 모달 */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-semibold">{t('sheetDetail.sheetMusicPreview')}</h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative">
                <img
                  src={getPreviewImageUrl(sheet)}
                  alt={`${displaySheetTitle} ${t('sheetDetail.sheetMusicPreview')}`}
                  className="w-full h-auto rounded"
                  onError={handlePreviewImageError}
                />
                <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-white/95 via-white/70 to-transparent"></div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-gray-600 mb-4">{t('sheetDetail.purchaseToViewFull')}</p>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 whitespace-nowrap cursor-pointer"
                >
                  {t('sheetDetail.purchase')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 리뷰/평점 */}
      <ReviewSection sheetId={sheet.id} user={user} />

      {/* 추천 악보 (같은 아티스트 → 같은 카테고리) */}
      <RelatedSheets
        currentSheetId={sheet.id}
        artist={sheet.artist}
        categoryId={sheet.category_id}
      />

      {/* 주문제작 CTA — 원하는 곡/버전이 없을 때 요청 유도 */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 text-center sm:p-8">
          <h3 className="text-lg font-bold text-gray-900 sm:text-xl">
            {t('sheetDetail.customOrderCta')}
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            {t('sheetDetail.customOrderCtaDesc')}
          </p>
          <button
            onClick={() => router.push('/custom-order')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <i className="ri-edit-line" />
            {t('sheetDetail.customOrderCtaButton')}
          </button>
        </div>
      </section>

      {/* 모바일: 푸터 숨김 (고정 구매 바가 있으므로 불필요), 데스크톱: 푸터 표시 */}
      <div className="hidden lg:block mt-16">
        <Footer />
      </div>
      {/* 모바일: 하단 고정 구매 바 높이만큼 여백 추가 (2단 레이아웃으로 높이 증가) */}
      <div className="h-32 lg:hidden" />

      {/* === Mobile: 하단 고정 구매 바 (2단 레이아웃) === */}
      {sheet && (
        <div data-mobile-purchase-bar className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col">
            {/* 신뢰 배지 (구매 바 상단) */}
            <div className="flex items-center justify-center gap-3 border-b border-gray-100 px-4 py-1.5 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><i className="ri-shield-check-line text-emerald-600"></i>{t('home.trust.securePayment')}</span>
              <span className="flex items-center gap-1"><i className="ri-download-cloud-2-line text-blue-600"></i>{t('home.trust.instantDownload')}</span>
            </div>
            {isFreeSheet ? (
              /* 무료 악보: 바로 다운로드 버튼 */
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-shrink-0">
                  <span className="text-lg font-bold text-blue-600">FREE</span>
                  <p className="text-[10px] text-gray-400">{t('sheetDetail.instantDownload')}</p>
                </div>
                <button
                  onClick={handleFreeDownload}
                  disabled={downloadingFree}
                  className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold active:scale-95 transition-all disabled:opacity-60"
                >
                  {downloadingFree ? (
                    <i className="ri-loader-4-line text-base animate-spin"></i>
                  ) : (
                    <i className="ri-download-line text-base"></i>
                  )}
                  <span className="truncate">{downloadingFree ? '...' : (t('freeSheets.actions.viewFreeSheet') || '무료 다운로드')}</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                {/* 가격 */}
                <div className="flex-shrink-0 min-w-0">
                  <span className="text-lg font-bold text-blue-600 leading-tight">{formatCurrency(displayPrice)}</span>
                </div>
                {/* 장바구니 아이콘 버튼 */}
                <button
                  onClick={handleAddToCart}
                  disabled={isInCart(sheet.id)}
                  className={`flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl transition-all active:scale-95 ${
                    isInCart(sheet.id)
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-900 text-white hover:bg-gray-800 active:bg-black'
                  }`}
                  aria-label={isInCart(sheet.id) ? t('categories.alreadyInCart') : t('categoriesPage.addToCart')}
                >
                  <ShoppingCart className="w-5 h-5" />
                </button>
                {/* 바로구매 버튼 */}
                <button
                  onClick={handleBuyNow}
                  disabled={buyingNow}
                  className="flex-1 flex items-center justify-center py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all disabled:opacity-60"
                >
                  <span className="truncate">
                    {buyingNow
                      ? (t('sheetDetail.purchaseProcessing') || '...')
                      : t('categoriesPage.buyNow')}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 옛날 결제 모달 제거 - 이제 /payments/[orderId] 페이지에서 처리 */}
    </div>
  );
}