'use client';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

import { useState, useEffect, useMemo } from 'react';
import { useParams} from 'next/navigation';
import { supabase } from '../../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { ArrowLeft, Star, ShoppingCart, Music, X } from 'lucide-react';
import { useCart } from '../../hooks/useCart';
import MainHeader from '../../components/common/MainHeader';
import Footer from '../../components/common/Footer';
import { isFavorite, toggleFavorite } from '../../lib/favorites';
import { hasPurchasedSheet } from '../../lib/purchaseCheck';
import { BankTransferInfoModal, PaymentMethodSelector, PayPalPaymentModal } from '../../components/payments';
import { VirtualAccountInfoModal } from '../../components/payments/VirtualAccountInfoModal';
import type { PaymentMethod, PaymentMethodOption } from '../../components/payments';
import { startSheetPurchase, buySheetNow } from '../../lib/payments';
import type { VirtualAccountInfo } from '../../lib/payments';
import { useTranslation } from 'react-i18next';
import { getSiteCurrency, convertFromKrw, formatCurrency as formatCurrencyUtil } from '../../lib/currency';
import { useSiteLanguage } from '../../hooks/useSiteLanguage';
import { useBuyNow } from '../../hooks/useBuyNow';
import { useUserCredits } from '../../hooks/useUserCredits';
import Seo from '../../components/Seo';
import { buildDetailSeoStrings } from '../../lib/seo';
import { languageDomainMap } from '../../config/languageDomainMap';
import { logFreeSheetDownload } from '../../lib/logFreeSheetDownload';

interface DrumSheet {
  id: string;
  title: string;
  artist: string;
  category_id: string;
  difficulty: string;
  price: number;
  pdf_url: string;
  preview_image_url: string;
  thumbnail_url: string;
  youtube_url: string;
  album_name?: string;
  page_count?: number;
  tempo?: number;
  is_featured: boolean;
  created_at: string;
  categories?: { name: string } | null;
}

export default function SheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useLocaleRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sheet, setSheet] = useState<DrumSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const { addToCart, isInCart } = useCart();
  const [isFavoriteSheet, setIsFavoriteSheet] = useState(false);
  const [favoriteProcessing, setFavoriteProcessing] = useState(false);
  const [showPaymentSelector, setShowPaymentSelector] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [bankTransferInfo, setBankTransferInfo] = useState<VirtualAccountInfo | null>(null);
  const [showBankTransferModal, setShowBankTransferModal] = useState(false);
  const [virtualAccountInfo, setVirtualAccountInfo] = useState<VirtualAccountInfo | null>(null);
  const [showVirtualAccountModal, setShowVirtualAccountModal] = useState(false);
  const { i18n, t } = useTranslation();
  const { isKoreanSite } = useSiteLanguage();

  // Phase 4: 통합 통화 로직 적용 (locale 기반)
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname, i18n.language);

  const displayPrice = sheet ? sheet.price : 0;

  const formatCurrency = (value: number) => {
    const convertedAmount = convertFromKrw(value, currency, i18n.language);
    return formatCurrencyUtil(convertedAmount, currency);
  };

  // 카테고리 이름을 번역하는 함수
  // ✅ 모든 언어 지원: ko/en/ja는 기존 로직 유지, 나머지 언어는 categoriesPage.categories.* 키 사용
  const getCategoryName = (categoryName: string | null | undefined): string => {
    if (!categoryName) return '';

    // ✅ 한국어 사이트: 원본 한국어 반환
    if (i18n.language === 'ko') {
      return categoryName;
    }

    // ✅ 영어 사이트: 기존 로직 유지
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

    // ✅ 일본어 사이트: 기존 로직 유지
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

    // ✅ 나머지 모든 언어: categoriesPage.categories.* 키 사용
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
    
    // 번역 키가 있으면 사용, 없으면 원본 반환
    return categoryMap[categoryName] || categoryName;
  };

  useEffect(() => {
    checkAuth();
    if (id) {
      loadSheetDetail(id);
    }
  }, [id]);

  // 모바일에서 악보 상세페이지 진입 시 항상 화면 맨 위로 스크롤
  useEffect(() => {
    // 모바일 체크 (< 768px)
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      // 페이지 진입 시 항상 최상단으로
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: 'auto', // 'smooth' 말고 'auto'로 즉시 이동
      });
    }
  }, [id]); // id가 변경될 때마다 (즉, 다른 악보로 이동할 때마다) 실행

  useEffect(() => {
    // 인증 상태 변화 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const loadFavoriteState = async () => {
      if (!user || !id) {
        setIsFavoriteSheet(false);
        return;
      }

      try {
        const favorite = await isFavorite(id, user.id);
        setIsFavoriteSheet(favorite);
      } catch (error) {
        console.error('찜 상태 로드 오류:', error);
      }
    };

    loadFavoriteState();
  }, [user, id]);

  const checkAuth = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  };

  const loadSheetDetail = async (sheetId: string) => {
    try {
      const { data, error } = await supabase
        .from('drum_sheets')
        .select('id, title, artist, difficulty, price, category_id, pdf_url, preview_image_url, thumbnail_url, youtube_url, album_name, page_count, tempo, is_featured, created_at, sales_type, categories (name)')
        .eq('id', sheetId)
        .single();

      if (error) throw error;

      const normalizedCategory =
        Array.isArray((data as any)?.categories) && (data as any)?.categories.length > 0
          ? (data as any)?.categories[0]
          : (data as any)?.categories ?? null;

      const normalizedSheet = {
        ...(data as unknown as Partial<DrumSheet>),
        categories: normalizedCategory ? { name: normalizedCategory.name ?? '' } : null,
      } as DrumSheet;

      setSheet(normalizedSheet);
    } catch (error) {
      console.error('악보 상세 정보 로딩 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

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

    // ✅ 한국어 사이트: 원본 한글 값 그대로 반환
    if (i18n.language === 'ko') {
      return difficulty;
    }

    // ✅ 영어 사이트: 기존 로직 유지
    if (i18n.language === 'en') {
      const difficultyMapEn: Record<string, string> = {
        '초급': 'Beginner',
        '중급': 'Intermediate',
        '고급': 'Advanced',
      };

      // 한글 값이면 영어로 변환
      if (difficultyMapEn[difficulty]) {
        return difficultyMapEn[difficulty];
      }
    }

    // ✅ 일본어 사이트: 기존 로직 유지
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

    // ✅ 나머지 모든 언어: i18n 키 사용
    // 한글 난이도 값을 영어 키로 매핑
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
      // i18n 키로 번역 시도
      const translated = t(`sheetDetail.difficulty.${mappedKey}`);
      // 번역이 키와 다르면 번역된 값, 같으면 fallback
      if (translated !== `sheetDetail.difficulty.${mappedKey}`) {
        return translated;
      }
    }

    // 영어 값인 경우 직접 번역
    switch (normalizedDifficulty) {
      case 'beginner':
        return t('sheetDetail.difficulty.beginner');
      case 'intermediate':
        return t('sheetDetail.difficulty.intermediate');
      case 'advanced':
        return t('sheetDetail.difficulty.advanced');
      default:
        // fallback: 원본 값 반환
        return difficulty;
    }
  };

  const getSheetPrice = () => {
    if (!sheet) return 0;
    return Math.max(0, sheet.price ?? 0);
  };

  const completeOnlinePurchase = async (
    method: 'card' | 'bank_transfer' | 'paypal',
    options?: { depositorName?: string },
  ) => {
    if (!user || !sheet) return;

    const price = getSheetPrice();

    const result = await startSheetPurchase({
      userId: user.id,
      items: [{ sheetId: sheet.id, sheetTitle: sheet.title, price }],
      amount: price,
      paymentMethod: method,
      description: t('sheetDetail.purchaseDescription', { title: sheet.title }),
      buyerName: user.email ?? null,
      buyerEmail: user.email ?? null,
      // returnUrl은 productPurchase에서 자동으로 Edge Function URL 사용
      depositorName: options?.depositorName,
    });

    if (method === 'bank_transfer') {
      setBankTransferInfo(result.virtualAccountInfo ?? null);
      alert(t('sheetDetail.bankTransferCreated'));
    } else if (method === 'paypal') {
      setBankTransferInfo(null);
      // PayPal은 리다이렉트되므로 알림 불필요
    } else {
      setBankTransferInfo(null);
      alert(t('sheetDetail.paymentWindowOpen'));
    }
  };



  const handlePayPalInitiate = async (elementId: string) => {
    if (!user || !sheet) return;

    const price = getSheetPrice();

    await startSheetPurchase({
      userId: user.id,
      items: [{ sheetId: sheet.id, sheetTitle: sheet.title, price }],
      amount: price,
      paymentMethod: 'paypal',
      description: t('sheetDetail.purchaseDescription', { title: sheet.title }),
      buyerName: user.email ?? null,
      buyerEmail: user.email ?? null,
      elementId, // PayPal SPB 렌더링을 위한 컨테이너 ID 전달
    });
  };

  const handlePaymentMethodSelect = async (method: PaymentMethod, option?: PaymentMethodOption) => {
    if (!user || !sheet) return;

    setShowPaymentSelector(false);

    const price = getSheetPrice();

    // 무통장입금 (수동) - 기존 로직 유지
    if (method === 'bank_transfer') {
      setShowBankTransferModal(true);
      return;
    }

    // PayPal - 기존 로직 유지
    if (method === 'paypal') {
      setShowPayPalModal(true);
      return;
    }

    setPurchasing(true);
    setPaymentProcessing(true);

    try {
      // 카카오페이 - 기존 로직 유지
      if (method === 'kakaopay') {
        try {
          const orderResult = await startSheetPurchase({
            userId: user.id,
            items: [{ sheetId: sheet.id, sheetTitle: sheet.title, price }],
            amount: price,
            paymentMethod: 'kakaopay',
            description: t('sheetDetail.purchaseDescription', { title: sheet.title }),
            buyerName: user.email ?? null,
            buyerEmail: user.email ?? null,
          });

          const { requestKakaoPayPayment } = await import('../../lib/payments/portone');
          const paymentResult = await requestKakaoPayPayment({
            userId: user.id,
            amount: price,
            orderId: orderResult.orderId,
            buyerEmail: user.email ?? undefined,
            buyerName: user.email ?? undefined,
            description: t('sheetDetail.purchaseDescription', { title: sheet.title }),
            onSuccess: (response) => {
              console.log('[sheet-detail] KakaoPay 결제 성공', response);
            },
            onError: (error) => {
              console.error('[sheet-detail] KakaoPay 결제 실패', error);
              alert(t('sheetDetail.purchaseError'));
              setPurchasing(false);
              setPaymentProcessing(false);
            },
          });

          if (!paymentResult.success) {
            throw new Error(paymentResult.error_msg || 'KakaoPay 결제가 실패했습니다.');
          }
        } catch (error) {
          console.error('KakaoPay 결제 오류:', error);
          alert(error instanceof Error ? error.message : t('sheetDetail.purchaseError'));
        } finally {
          setPurchasing(false);
          setPaymentProcessing(false);
        }
        return;
      }

      // 신용카드, 무통장입금(가상계좌), 실시간 계좌이체 - KG이니시스
      if (method === 'card' || method === 'virtual_account' || method === 'transfer') {
        if (!option || !option.payMethod) {
          alert('결제 수단 정보가 올바르지 않습니다.');
          setPurchasing(false);
          setPaymentProcessing(false);
          return;
        }

        try {
          const result = await startSheetPurchase({
            userId: user.id,
            items: [{ sheetId: sheet.id, sheetTitle: sheet.title, price }],
            amount: price,
            paymentMethod: 'inicis',
            inicisPayMethod: option.payMethod as 'CARD' | 'VIRTUAL_ACCOUNT' | 'TRANSFER',
            description: t('sheetDetail.purchaseDescription', { title: sheet.title }),
            buyerName: user.email ?? null,
            buyerEmail: user.email ?? null,
            onSuccess: (response) => {
              console.log('[sheet-detail] KG이니시스 결제 성공', response);
              
              // 가상계좌인 경우 안내 모달 표시
              if (option.payMethod === 'VIRTUAL_ACCOUNT' && response.virtualAccountInfo) {
                setVirtualAccountInfo({
                  bankName: response.virtualAccountInfo.bankName,
                  accountNumber: response.virtualAccountInfo.accountNumber,
                  accountHolder: response.virtualAccountInfo.accountHolder,
                  depositor: response.virtualAccountInfo.accountHolder,
                  amount: price,
                  expiresAt: response.virtualAccountInfo.expiresAt,
                });
                setShowVirtualAccountModal(true);
              }
              
              setPurchasing(false);
              setPaymentProcessing(false);
              // 가상계좌가 아닌 경우는 결제 완료 처리
              if (option.payMethod !== 'VIRTUAL_ACCOUNT') {
                alert(t('sheetDetail.paymentWindowOpen') || '결제창이 열렸습니다.');
              }
            },
            onError: (error) => {
              console.error('[sheet-detail] KG이니시스 결제 실패', error);
              setPurchasing(false);
              setPaymentProcessing(false);
              alert(error instanceof Error ? error.message : t('sheetDetail.purchaseError'));
            },
          });
        } catch (error) {
          console.error('KG이니시스 결제 오류:', error);
          alert(error instanceof Error ? error.message : t('sheetDetail.purchaseError'));
          setPurchasing(false);
          setPaymentProcessing(false);
        }
        return;
      }

      // 캐시 잔액 결제는 useBuyNow 훅에서 처리하므로 여기서는 처리하지 않음
    } catch (error) {
      console.error('구매 오류:', error);
      alert(error instanceof Error ? error.message : t('sheetDetail.purchaseError'));
    } finally {
      setPurchasing(false);
      setPaymentProcessing(false);
    }
  };

  const handleBankTransferConfirm = async (depositorName: string) => {
    if (!user || !sheet) {
      alert('로그인이 필요합니다.');
      return;
    }

    // 필수값 검증
    const trimmedDepositorName = depositorName?.trim();
    if (!trimmedDepositorName) {
      alert('입금자명을 입력해 주세요.');
      return;
    }

    const price = getSheetPrice();
    if (!price || price <= 0) {
      alert('결제 금액이 올바르지 않습니다.');
      return;
    }

    setPaymentProcessing(true);
    setPurchasing(true);

    try {
      await completeOnlinePurchase('bank_transfer', { depositorName: trimmedDepositorName });
      
      // 성공 메시지는 completeOnlinePurchase 내부에서 처리됨
      // 주문 생성 후 모달 닫기
      setShowBankTransferModal(false);
    } catch (error) {
      console.error('[SheetDetail] 무통장입금 구매 오류:', error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : t('sheetDetail.purchaseError') || '주문 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      
      alert(errorMessage);
    } finally {
      setPurchasing(false);
      setPaymentProcessing(false);
    }
  };

  const [buyingNow, setBuyingNow] = useState(false);

  // ✅ 공유 useBuyNow 훅 사용
  const buyNow = useBuyNow(user);
  const { credits } = useUserCredits(user);

  const handleBuyNow = async () => {
    if (!sheet) return;
    await buyNow.handleBuyNow({
      id: sheet.id,
      title: sheet.title,
      price: getSheetPrice(),
    });
  };

  const handleAddToCart = async () => {
    if (!user) {
      const redirectPath = window.location.pathname + window.location.search;
      router.push(`/auth/login?redirect=${encodeURIComponent(redirectPath)}`);
      return;
    }

    if (!sheet) return;

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
    if (!id) {
      return;
    }

    if (!user) {
      alert(t('sheetDetail.loginRequired'));
      return;
    }

    setFavoriteProcessing(true);
    try {
      const favorite = await toggleFavorite(id, user.id);
      setIsFavoriteSheet(favorite);
    } catch (error) {
      console.error('찜하기 처리 오류:', error);
      alert(t('sheetDetail.favoriteError'));
    } finally {
      setFavoriteProcessing(false);
    }
  };

  const downloadPdf = async () => {
    if (!sheet?.pdf_url) return;

    try {
      // 무료 악보인 경우 다운로드 로그 기록
      if (sheet.price === 0) {
        logFreeSheetDownload({
          sheetId: sheet.id,
          userId: user?.id,
          downloadSource: 'sheet-detail',
        });
      }
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
      console.error('다운로드 오류:', error);
      alert(t('sheetDetail.downloadError'));
    }
  };

  // 미리보기 이미지 생성 함수
  const getPreviewImageUrl = (sheet: DrumSheet) => {
    if (sheet.preview_image_url) {
      return sheet.preview_image_url;
    }

    // 더 안정적인 이미지 생성 프롬프트
    const prompt = `Professional drum sheet music notation page with clear black musical notes on white paper background, drum symbols and rhythmic patterns, clean layout, high quality music manuscript paper, readable notation symbols, minimalist design, no text overlays, studio lighting`;

    return `https://readdy.ai/api/search-image?query=$%7BencodeURIComponent%28prompt%29%7D&width=600&height=800&seq=preview-${sheet.id}&orientation=portrait`;
  };

  // 이미지 로드 실패 시 대체 이미지
  const handlePreviewImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.target as HTMLImageElement;
    // 더 간단한 대체 이미지
    const fallbackPrompt = `Clean white paper with black musical notes, drum notation symbols, simple music sheet design, high contrast, professional quality`;
    img.src = `https://readdy.ai/api/search-image?query=$%7BencodeURIComponent%28fallbackPrompt%29%7D&width=600&height=800&seq=fallback-${Date.now()}&orientation=portrait`;
  };

  // 유튜브 URL에서 비디오 ID 추출 함수
  const extractVideoId = (url: string): string => {
    const regex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([\w-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('sheetDetail.loading')}</p>
        </div>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('sheetDetail.sheetNotFound')}</h1>
          <button
            onClick={() => router.push('/categories')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 whitespace-nowrap cursor-pointer"
          >
            {t('sheetDetail.backToCategories')}
          </button>
        </div>
      </div>
    );
  }

  // Build SEO strings
  const seoStrings = sheet ? buildDetailSeoStrings(sheet, t) : null;
  
  // Build canonical URL
  const baseUrl = languageDomainMap[i18n.language as keyof typeof languageDomainMap] || window.location.origin;
  const canonicalUrl = sheet ? `${baseUrl}/drum-sheet/${sheet.slug}` : baseUrl;
  
  // Get thumbnail URL for OG image
  const ogImageUrl = sheet
    ? (sheet.preview_image_url || sheet.thumbnail_url || null)
    : null;

  return (
    <div className="min-h-screen bg-white">
      {/* SEO Meta Tags */}
      {seoStrings && sheet && (
        <Seo
          title={seoStrings.title}
          description={seoStrings.description}
          keywords={seoStrings.keywords}
          ogTitle={seoStrings.title}
          ogDescription={seoStrings.description}
          ogImageUrl={ogImageUrl || undefined}
          canonicalUrl={canonicalUrl}
          locale={i18n.language}
        />
      )}
      
      {/* Main Header */}
      <MainHeader user={user} />

      {/* Main Content */}
      <div>
        {/* Back Button */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {bankTransferInfo ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-700 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-blue-900">{t('sheetDetail.bankTransferInfo')}</h3>
                <button
                  type="button"
                  onClick={() => setBankTransferInfo(null)}
                  className="text-blue-600 hover:text-blue-800 text-xs"
                >
                  {t('sheetDetail.close')}
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <span className="font-medium text-gray-900">{t('sheetDetail.bank')}</span> {bankTransferInfo.bankName}
                </div>
                <div>
                  <span className="font-medium text-gray-900">{t('sheetDetail.accountNumber')}</span> {bankTransferInfo.accountNumber}
                </div>
                <div>
                  <span className="font-medium text-gray-900">{t('sheetDetail.accountHolder')}</span> {bankTransferInfo.depositor}
                </div>
                <div>
                  <span className="font-medium text-gray-900">{t('sheetDetail.amount')}</span>{' '}
                  {formatCurrency(bankTransferInfo.amount ?? getSheetPrice())}
                </div>
                {bankTransferInfo.expectedDepositor ? (
                  <div className="sm:col-span-2">
                    <span className="font-medium text-gray-900">{t('sheetDetail.depositorName')}</span>{' '}
                    <span className="text-blue-600 font-semibold">{bankTransferInfo.expectedDepositor}</span>
                  </div>
                ) : null}
              </div>
              {bankTransferInfo.message ? (
                <p className="mt-3 text-xs text-gray-600">{bankTransferInfo.message}</p>
              ) : null}
            </div>
          ) : null}


          {/* === Mobile: 상품 핵심 정보 (제목/아티스트/가격) - 이미지 위에 표시 === */}
          <div className="lg:hidden mb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-bold text-gray-900 leading-tight truncate">{sheet.title}</h1>
                  {sheet.is_featured && (
                    <Star className="w-5 h-5 text-yellow-500 fill-current flex-shrink-0" />
                  )}
                </div>
                <p className="text-base text-gray-600 mb-2">{sheet.artist}</p>
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
                  className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${isFavoriteSheet
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
            {/* Sheet Preview */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="relative">
                  <div className="aspect-square lg:aspect-[3/4] bg-gray-50 rounded-lg overflow-hidden relative">
                    <img
                      src={getPreviewImageUrl(sheet)}
                      alt={`${sheet.title} ${t('sheetDetail.sheetMusicPreview')}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setShowPreviewModal(true)}
                      onError={handlePreviewImageError}
                    />

                    {/* 하단 흐림 효과 */}
                    <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-white/90 via-white/60 to-transparent"></div>

                    {/* 미리보기 안내 */}
                    <div className="absolute bottom-4 left-4 right-4 text-center">
                      <p className="text-sm text-gray-700 font-medium bg-white/80 rounded px-3 py-2">
                        {t('sheetDetail.fullSheetAfterPurchase')}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowPreviewModal(true)}
                    className="mt-4 w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {t('sheetDetail.enlargePreview')}
                  </button>
                </div>
              </div>

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

              {/* 모바일 전용: 구매 전 확인사항 */}
              <div className="lg:hidden bg-gray-50 rounded-lg p-6 mt-6">
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

              {/* 모바일 전용: 환불 규정 */}
              <div className="lg:hidden bg-gray-50 rounded-lg p-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('sheetDetail.refundPolicy')}</h3>
                <p className="text-sm text-gray-700 mb-2">
                  {t('sheetDetail.refundPolicyDescription')}
                </p>
                <p className="text-sm text-gray-700">
                  {t('sheetDetail.refundPolicyLinkText')}{' '}
                  <a href="/policy/refund" className="text-blue-600 hover:text-blue-800 underline">
                    {t('sheetDetail.refundPolicyLink')}
                  </a>
                  {t('sheetDetail.refundPolicyLinkSuffix')}
                </p>
              </div>
            </div>

            {/* Sheet Info */}
            <div className="space-y-6 lg:space-y-8">
              {/* 제목/아티스트 - 데스크톱만 표시 (모바일은 이미지 위에 이미 표시됨) */}
              <div className="hidden lg:block">
                <div className="flex items-center space-x-3 mb-4">
                  <h1 className="text-3xl font-bold text-gray-900">{sheet.title}</h1>
                  {sheet.is_featured && (
                    <Star className="w-6 h-6 text-yellow-500 fill-current" />
                  )}
                </div>
                <p className="text-xl text-gray-600 mb-2">{sheet.artist}</p>
                {sheet.album_name && (
                  <p className="text-lg text-gray-500 mb-2">{t('sheetDetail.album')}: {sheet.album_name}</p>
                )}
                <div className="flex items-center space-x-4 text-sm text-gray-500">
                  <span className="flex items-center space-x-1">
                    <Music className="w-4 h-4" />
                    <span>{getCategoryName(sheet.categories?.name)}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <span>{t('sheetDetail.instrumentPart')}</span>
                  </span>
                </div>
              </div>

              {/* 앨범명 - 모바일에서도 표시 (중복 아님) */}
              {sheet.album_name && (
                <p className="text-sm text-gray-500 lg:hidden">{t('sheetDetail.album')}: {sheet.album_name}</p>
              )}

              {/* Difficulty Badge & Additional Info - 데스크톱만 */}
              <div className="hidden lg:flex items-center space-x-4 mb-4">
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

              {/* Price - 데스크톱만 (모바일은 이미지 위 + 하단 고정 바에 표시) */}
              <div className="hidden lg:block bg-gray-50 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-col">
                      <span className="text-3xl font-bold text-blue-600">
                        {formatCurrency(displayPrice)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500 mb-2">{t('sheetDetail.instantDownload')}</p>
                    <p className="text-sm text-gray-500">{t('sheetDetail.pdfFormat')}</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons - 데스크톱만 (모바일은 하단 고정 바 사용) */}
              <div className="hidden lg:block space-y-4">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    disabled={favoriteProcessing}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${isFavoriteSheet
                      ? 'border-red-200 bg-red-50 text-red-500'
                      : 'border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500'
                      } ${favoriteProcessing ? 'opacity-60 cursor-not-allowed' : ''}`}
                    aria-label={isFavoriteSheet ? t('sheetDetail.removeFromFavorites') : t('sheetDetail.addToFavorites')}
                  >
                    <i className={`ri-heart-${isFavoriteSheet ? 'fill' : 'line'} text-xl`} />
                  </button>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={handleAddToCart}
                    disabled={isInCart(sheet.id)}
                    className={`sheet-action-btn btn-cart px-6 py-3 text-base min-w-[120px] ${isInCart(sheet.id) ? 'opacity-60' : ''}`}
                  >
                    <ShoppingCart className="w-5 h-5 mr-1.5" />
                    <span>{isInCart(sheet.id) ? t('categoriesPage.alreadyPurchasedGeneric') || t('categories.alreadyInCart') : t('categoriesPage.addToCart')}</span>
                  </button>

                  <button
                    onClick={handleBuyNow}
                    disabled={buyingNow}
                    className="sheet-action-btn btn-buy px-6 py-3 text-base min-w-[120px]"
                  >
                    <span>{buyingNow ? (t('sheetDetail.purchaseProcessing') || t('sheet.buyNowProcessing') || '처리 중...') : t('categoriesPage.buyNow')}</span>
                  </button>
                </div>

              </div>

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

          {/* 유튜브 영상 섹션 (유튜브 URL이 있는 경우) */}
          {sheet.youtube_url && (
            <div className="bg-white rounded-lg shadow-lg p-6 mb-8 mt-12">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
                <span>{t('sheetDetail.performanceVideo')}</span>
              </h3>
              <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${extractVideoId(sheet.youtube_url)}`}
                  title={`${sheet.title} - ${sheet.artist} ${t('sheetDetail.performanceVideo')}`}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-gray-600">{t('sheetDetail.checkPerformanceVideo')}</p>
                <a
                  href={sheet.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 whitespace-nowrap cursor-pointer flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  <span>{t('sheetDetail.watchOnYouTube')}</span>
                </a>
              </div>
            </div>
          )}


          {/* 환불 규정 안내 블록 - 데스크톱 전용 */}
          <div className="hidden lg:block bg-gray-50 rounded-lg p-6 mt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">{t('sheetDetail.refundPolicy')}</h3>
            <p className="text-sm text-gray-700 mb-2">
              {t('sheetDetail.refundPolicyDescription')}
            </p>
            <p className="text-sm text-gray-700">
              {t('sheetDetail.refundPolicyLinkText')}{' '}
              <a href="/policy/refund" className="text-blue-600 hover:text-blue-800 underline">
                {t('sheetDetail.refundPolicyLink')}
              </a>
              {t('sheetDetail.refundPolicyLinkSuffix')}
            </p>
          </div>
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
                  alt={`${sheet.title} ${t('sheetDetail.sheetMusicPreview')}`}
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

      {/* 모바일: 하단 고정 바 높이만큼 여백 추가 */}
      <div className="mt-16 pb-24 lg:pb-0">
        <Footer />
      </div>

      {/* === Mobile: 하단 고정 구매 바 === */}
      {sheet && (
        <div className="lg:hidden fixed bottom-14 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-shrink-0">
              <span className="text-lg font-bold text-blue-600">{formatCurrency(displayPrice)}</span>
              <p className="text-[10px] text-gray-400">{t('sheetDetail.instantDownload')}</p>
            </div>
            <div className="flex-1 flex gap-2">
              <button
                onClick={handleAddToCart}
                disabled={isInCart(sheet.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 ${
                  isInCart(sheet.id)
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
                }`}
              >
                <ShoppingCart className="w-4 h-4" />
                <span className="truncate">{isInCart(sheet.id) ? t('categoriesPage.alreadyPurchasedGeneric') || t('categories.alreadyInCart') : t('categoriesPage.addToCart')}</span>
              </button>
              <button
                onClick={handleBuyNow}
                disabled={buyingNow}
                className="flex-1 flex items-center justify-center py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all disabled:opacity-60"
              >
                <span>{buyingNow ? (t('sheetDetail.purchaseProcessing') || '...') : t('categoriesPage.buyNow')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 공유 useBuyNow 훅의 모달들 */}
      <PaymentMethodSelector
        open={buyNow.showPaymentSelector}
        amount={buyNow.pendingSheet ? buyNow.pendingSheet.price : 0}
        onSelect={buyNow.handlePaymentMethodSelect}
        onClose={buyNow.closePaymentSelector}
        context="buyNow"
        userCredits={credits}
      />

      <BankTransferInfoModal
        open={buyNow.showBankTransferModal}
        amount={buyNow.pendingSheet ? buyNow.pendingSheet.price : (sheet ? getSheetPrice() : 0)}
        userName={(user?.user_metadata?.name as string | undefined) ?? user?.email ?? undefined}
        onConfirm={buyNow.handleBankTransferConfirm}
        onClose={buyNow.closeBankTransferModal}
        processing={buyNow.paymentProcessing}
        orderCreated={!!buyNow.bankTransferInfo}
        successMessage={t('sheetDetail.bankTransferCreated') || '무통장입금 계좌가 생성되었습니다. 입금을 완료해주세요.'}
      />

      {buyNow.showPayPalModal && buyNow.pendingSheet && (
        <PayPalPaymentModal
          open={buyNow.showPayPalModal}
          amount={buyNow.pendingSheet.price}
          orderTitle={buyNow.pendingSheet.title}
          onClose={buyNow.closePayPalModal}
          onSuccess={(response) => {
            buyNow.closePayPalModal();
            // PayPal은 리다이렉트되므로 여기서 추가 처리 불필요할 수 있음
          }}
          onError={(error) => {
            console.error('PayPal 결제 오류:', error);
            alert(t('sheetDetail.purchaseError'));
          }}
          initiatePayment={buyNow.handlePayPalInitiate}
        />
      )}


      <VirtualAccountInfoModal
        open={showVirtualAccountModal || buyNow.showVirtualAccountModal}
        amount={sheet ? sheet.price : 0}
        virtualAccountInfo={virtualAccountInfo || buyNow.virtualAccountInfo}
        onClose={() => {
          setShowVirtualAccountModal(false);
          setVirtualAccountInfo(null);
          buyNow.closeVirtualAccountModal();
        }}
      />

      {showPaymentSelector && (
        <PaymentMethodSelector
          open={showPaymentSelector}
          amount={getSheetPrice()}
          onClose={() => setShowPaymentSelector(false)}
          onSelect={handlePaymentMethodSelect}
          context="buyNow"
        />
      )}

    </div>
  );
}