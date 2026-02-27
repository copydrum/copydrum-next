import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateNormalizedKey } from '@/lib/utils/normalizedKey';
import { generateSheetSlug } from '@/lib/slugify';
import { searchTrackAndGetCover } from '@/lib/spotify';

/**
 * 유튜브 URL에서 영상 ID 추출 (기존 admin 페이지 로직과 동일)
 */
function extractVideoId(url: string): string | null {
  if (!url) return null;

  // 다양한 유튜브 URL 형식 지원
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * 유튜브 썸네일 URL 생성 (기존 admin 페이지 로직과 동일)
 * maxresdefault.jpg를 먼저 시도하고, 없으면 0.jpg를 사용
 */
async function getYoutubeThumbnailUrl(videoId: string): Promise<string> {
  // 먼저 maxresdefault.jpg 시도
  const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  try {
    // 이미지 존재 여부 확인
    const response = await fetch(maxResUrl, { method: 'HEAD' });
    if (response.ok) {
      return maxResUrl;
    }
  } catch (error) {
    console.log(`[bulk-preorder] maxresdefault.jpg 로드 실패, 0.jpg로 폴백 (videoId: ${videoId})`);
  }

  // 폴백: 0.jpg 사용
  return `https://img.youtube.com/vi/${videoId}/0.jpg`;
}

/**
 * SEO용 상세 설명 자동 생성 함수 (17개 언어 일괄 생성)
 * 엑셀에 description이 없을 경우 모든 언어의 설명을 자동으로 생성
 */
function generateSeoDescriptions(artist: string, title: string): Record<string, string> {
  return {
    ko: `이 페이지는 카피드럼에서 제공하는 ${artist}의 ${title} 드럼 악보 선주문 전용 페이지입니다. 본 악보는 아직 PDF로 제작되지 않았으나, 결제해 주시면 카피드럼 마스터가 1:1 우선순위로 즉시 채보 작업에 착수합니다. 세상에서 가장 빠르고 정확한 ${artist} - ${title} 고품질 드럼 악보를 누구보다 먼저 소장해 보세요. 작업이 완료되면 고객님의 이메일로 즉시 안내해 드립니다.`,
    en: `This page is a pre-order exclusive page for ${artist}'s ${title} drum sheet music provided by CopyDrum. This sheet music has not yet been produced as a PDF, but when you complete payment, CopyDrum masters will immediately begin transcription work with 1:1 priority. Be the first to own the world's fastest and most accurate high-quality drum sheet music for ${artist} - ${title}. Once the work is completed, we will notify you immediately via email.`,
    ja: `このページは、CopyDrumが提供する${artist}の${title}ドラム楽譜の予約注文専用ページです。この楽譜はまだPDFとして制作されていませんが、お支払いいただければ、CopyDrumマスターが1対1の優先順位で即座に採譜作業に着手します。世界で最も速く、正確な${artist} - ${title}の高品質ドラム楽譜を誰よりも早くお手元に。作業が完了次第、お客様のメールに即座にお知らせいたします。`,
    'zh-CN': `此页面是CopyDrum提供的${artist}的${title}鼓谱预购专用页面。此乐谱尚未制作成PDF，但完成付款后，CopyDrum大师将立即以1对1的优先级开始制谱工作。抢先拥有世界上最快速、最准确的${artist} - ${title}高品质鼓谱。工作完成后，我们将立即通过电子邮件通知您。`,
    'zh-TW': `此頁面是CopyDrum提供的${artist}的${title}鼓譜預購專用頁面。此樂譜尚未製作成PDF，但完成付款後，CopyDrum大師將立即以1對1的優先級開始製譜工作。搶先擁有世界上最快速、最準確的${artist} - ${title}高品質鼓譜。工作完成後，我們將立即通過電子郵件通知您。`,
    es: `Esta página es una página exclusiva de pre-pedido para la partitura de batería ${title} de ${artist} proporcionada por CopyDrum. Esta partitura aún no ha sido producida como PDF, pero cuando complete el pago, los maestros de CopyDrum comenzarán inmediatamente el trabajo de transcripción con prioridad 1:1. Sea el primero en poseer la partitura de batería de alta calidad más rápida y precisa del mundo para ${artist} - ${title}. Una vez completado el trabajo, le notificaremos inmediatamente por correo electrónico.`,
    fr: `Cette page est une page exclusive de précommande pour la partition de batterie ${title} de ${artist} fournie par CopyDrum. Cette partition n'a pas encore été produite en PDF, mais lorsque vous complétez le paiement, les maîtres de CopyDrum commenceront immédiatement le travail de transcription avec une priorité 1:1. Soyez le premier à posséder la partition de batterie de haute qualité la plus rapide et la plus précise au monde pour ${artist} - ${title}. Une fois le travail terminé, nous vous en informerons immédiatement par e-mail.`,
    de: `Diese Seite ist eine exklusive Vorbestellungsseite für ${artist}'s ${title} Schlagzeug-Noten, die von CopyDrum bereitgestellt werden. Diese Noten wurden noch nicht als PDF produziert, aber wenn Sie die Zahlung abschließen, beginnen CopyDrum-Meister sofort mit der Transkriptionsarbeit mit 1:1-Priorität. Seien Sie der Erste, der die schnellste und genaueste hochwertige Schlagzeug-Noten der Welt für ${artist} - ${title} besitzt. Sobald die Arbeit abgeschlossen ist, werden wir Sie sofort per E-Mail benachrichtigen.`,
    it: `Questa pagina è una pagina esclusiva di pre-ordine per lo spartito per batteria ${title} di ${artist} fornito da CopyDrum. Questo spartito non è ancora stato prodotto come PDF, ma quando completi il pagamento, i maestri di CopyDrum inizieranno immediatamente il lavoro di trascrizione con priorità 1:1. Sii il primo a possedere lo spartito per batteria di alta qualità più veloce e preciso al mondo per ${artist} - ${title}. Una volta completato il lavoro, ti avviseremo immediatamente via e-mail.`,
    pt: `Esta página é uma página exclusiva de pré-encomenda para a partitura de bateria ${title} de ${artist} fornecida pela CopyDrum. Esta partitura ainda não foi produzida como PDF, mas quando você completar o pagamento, os mestres da CopyDrum começarão imediatamente o trabalho de transcrição com prioridade 1:1. Seja o primeiro a possuir a partitura de bateria de alta qualidade mais rápida e precisa do mundo para ${artist} - ${title}. Assim que o trabalho for concluído, notificaremos você imediatamente por e-mail.`,
    ru: `Эта страница является эксклюзивной страницей предзаказа для нот для ударных ${title} от ${artist}, предоставляемых CopyDrum. Эти ноты еще не были произведены в формате PDF, но когда вы завершите оплату, мастера CopyDrum немедленно начнут работу по транскрипции с приоритетом 1:1. Станьте первым, кто получит самые быстрые и точные высококачественные ноты для ударных для ${artist} - ${title}. После завершения работы мы немедленно уведомим вас по электронной почте.`,
    th: `หน้านี้เป็นหน้าสำหรับสั่งซื้อล่วงหน้าเฉพาะสำหรับโน้ตกลอง ${title} ของ ${artist} ที่ให้บริการโดย CopyDrum โน้ตนี้ยังไม่ได้ผลิตเป็น PDF แต่เมื่อคุณชำระเงินเสร็จสิ้น ปรมาจารย์ของ CopyDrum จะเริ่มงานถอดโน้ตทันทีด้วยลำดับความสำคัญ 1:1 เป็นคนแรกที่ครอบครองโน้ตกลองคุณภาพสูงที่เร็วและแม่นยำที่สุดในโลกสำหรับ ${artist} - ${title} เมื่องานเสร็จสมบูรณ์ เราจะแจ้งให้คุณทราบทันทีทางอีเมล`,
    vi: `Trang này là trang đặt trước độc quyền cho bản nhạc trống ${title} của ${artist} do CopyDrum cung cấp. Bản nhạc này chưa được sản xuất dưới dạng PDF, nhưng khi bạn hoàn tất thanh toán, các bậc thầy của CopyDrum sẽ ngay lập tức bắt đầu công việc phiên âm với mức độ ưu tiên 1:1. Hãy là người đầu tiên sở hữu bản nhạc trống chất lượng cao nhanh nhất và chính xác nhất thế giới cho ${artist} - ${title}. Khi công việc hoàn tất, chúng tôi sẽ thông báo cho bạn ngay lập tức qua email.`,
    hi: `यह पृष्ठ CopyDrum द्वारा प्रदान किए गए ${artist} के ${title} ड्रम शीट संगीत के लिए एक विशेष पूर्व-आदेश पृष्ठ है। यह शीट संगीत अभी तक PDF के रूप में निर्मित नहीं किया गया है, लेकिन जब आप भुगतान पूरा करते हैं, तो CopyDrum मास्टर्स 1:1 प्राथमिकता के साथ तुरंत ट्रांसक्रिप्शन कार्य शुरू करेंगे। ${artist} - ${title} के लिए दुनिया के सबसे तेज़ और सटीक उच्च-गुणवत्ता वाले ड्रम शीट संगीत के मालिक बनने वाले पहले व्यक्ति बनें। कार्य पूरा होने के बाद, हम आपको तुरंत ईमेल के माध्यम से सूचित करेंगे।`,
    id: `Halaman ini adalah halaman pra-pesanan eksklusif untuk lembaran musik drum ${title} oleh ${artist} yang disediakan oleh CopyDrum. Lembaran musik ini belum diproduksi sebagai PDF, tetapi ketika Anda menyelesaikan pembayaran, master CopyDrum akan segera memulai pekerjaan transkripsi dengan prioritas 1:1. Jadilah yang pertama memiliki lembaran musik drum berkualitas tinggi tercepat dan paling akurat di dunia untuk ${artist} - ${title}. Setelah pekerjaan selesai, kami akan memberi tahu Anda segera melalui email.`,
    tr: `Bu sayfa, CopyDrum tarafından sağlanan ${artist}'nin ${title} davul notası için özel bir ön sipariş sayfasıdır. Bu nota henüz PDF olarak üretilmemiştir, ancak ödemeyi tamamladığınızda, CopyDrum ustaları 1:1 öncelikle hemen transkripsiyon çalışmasına başlayacaktır. ${artist} - ${title} için dünyanın en hızlı ve en doğru yüksek kaliteli davul notasının sahibi olan ilk kişi olun. İş tamamlandığında, size e-posta yoluyla hemen bildireceğiz.`,
    uk: `Ця сторінка є ексклюзивною сторінкою попереднього замовлення для нот для ударних ${title} від ${artist}, наданих CopyDrum. Ці ноти ще не були виготовлені у форматі PDF, але коли ви завершите оплату, майстри CopyDrum негайно почнуть роботу з транскрипції з пріоритетом 1:1. Станьте першим, хто отримає найшвидші та найточніші високоякісні ноти для ударних для ${artist} - ${title}. Після завершення роботи ми негайно повідомимо вас електронною поштою.`,
  };
}

/**
 * slug 생성 함수 (기존 admin 페이지 로직과 동일한 방식)
 * slugify 라이브러리와 호환되도록 구현
 */
function generateSlug(artist: string, title: string): string {
  // generateSheetSlug는 title-artist 순서이지만, 기존 admin은 artist-title 순서
  // 일관성을 위해 artist-title 순서로 생성
  const artistSlug = artist
    .toLowerCase()
    .trim()
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  const titleSlug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const baseSlug = `${artistSlug}-${titleSlug}`.substring(0, 100);
  return baseSlug || `sheet-${Date.now()}`;
}

// ✅ Service Role Key가 있으면 Admin 권한으로 RLS 우회
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    console.log('[bulk-preorder] ✅ Service Role Key 사용 (Admin 권한, RLS 우회)');
    return createClient(url, serviceRoleKey);
  }

  console.warn('[bulk-preorder] ⚠️ Service Role Key 없음 → Anon Key 사용 (RLS 적용됨)');
  return createClient(url, anonKey);
}

interface BulkPreorderItem {
  artist: string;
  title: string;
  price: number;
  category: string; // 카테고리 이름 또는 ID
  album_image_url?: string | null; // 엑셀에서 직접 받아온 앨범 이미지 URL
  album_name?: string | null; // 엑셀에서 직접 받아온 앨범명
  youtube_url?: string | null; // 엑셀에서 직접 받아온 유튜브 링크
  description?: string | null; // 엑셀에서 직접 받아온 상세 설명 (선택사항)
}

interface ProcessedItem extends BulkPreorderItem {
  normalized_key: string;
  album_image_url: string | null;
  album_name: string | null;
  category_id: string | null;
  youtube_url: string | null;
}

/**
 * POST /api/admin/products/bulk-preorder
 * 
 * 엑셀에서 파싱된 선주문 상품 데이터를 대량으로 등록합니다.
 * 
 * 요청 본문:
 * {
 *   items: [
 *     { 
 *       artist: "BTS", 
 *       title: "Butter", 
 *       price: 3000, 
 *       category: "POP",
 *       album_image_url: "https://...", // 선택사항
 *       album_name: "Butter", // 선택사항
 *       youtube_url: "https://www.youtube.com/watch?v=...", // 선택사항 (있으면 썸네일 자동 추출)
 *       description: "상세 설명..." // 선택사항 (없으면 SEO용 설명 자동 생성)
 *     },
 *     ...
 *   ]
 * }
 * 
 * 응답:
 * {
 *   success: true,
 *   total: 100,
 *   success: 98,
 *   skipped: 2,
 *   errors: []
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { items } = await request.json();

    // ============================================================
    // 입력 검증
    // ============================================================
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'items 배열이 필요합니다.',
          total: 0,
          success: 0,
          skipped: 0
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // ============================================================
    // 1단계: 카테고리 이름 → ID 매핑 테이블 생성
    // ============================================================
    const { data: categories, error: categoriesError } = await supabase
      .from('categories')
      .select('id, name');

    if (categoriesError) {
      console.error('[bulk-preorder] ❌ 카테고리 조회 실패:', categoriesError);
      return NextResponse.json(
        {
          success: false,
          error: '카테고리 조회에 실패했습니다.',
          details: categoriesError.message,
          total: items.length,
          success: 0,
          skipped: 0
        },
        { status: 500 }
      );
    }

    // 카테고리 이름 → ID 매핑 (대소문자 무시)
    const categoryMap = new Map<string, string>();
    categories?.forEach(cat => {
      categoryMap.set(cat.name.toLowerCase(), cat.id);
    });

    // ============================================================
    // 2단계: 각 항목 처리 (normalized_key 생성, 엑셀 데이터 사용)
    // ============================================================
    const processedItems: ProcessedItem[] = [];
    const errors: Array<{ item: BulkPreorderItem; error: string }> = [];

    console.log(`[bulk-preorder] 📦 총 ${items.length}개 항목 처리 시작...`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        // 필수 필드 검증 (빈 문자열 및 공백만 있는 경우도 제외)
        const artist = item.artist?.trim() || '';
        const title = item.title?.trim() || '';
        
        if (!artist || !title || !item.price || artist.length === 0 || title.length === 0) {
          console.log(`[bulk-preorder] ⏭️ [${i + 1}/${items.length}] 필수 필드 누락으로 스킵: artist="${artist}", title="${title}", price=${item.price}`);
          continue; // 에러에 추가하지 않고 조용히 스킵
        }

        // normalized_key 생성
        const normalizedKey = generateNormalizedKey(artist, title);
        
        // normalized_key가 빈 문자열이면 스킵 (중복 키 에러 방지)
        if (!normalizedKey || normalizedKey.trim().length === 0) {
          console.log(`[bulk-preorder] ⏭️ [${i + 1}/${items.length}] normalized_key가 빈 문자열로 생성되어 스킵: artist="${artist}", title="${title}"`);
          continue;
        }

        // 카테고리 ID 찾기
        let categoryId: string | null = null;
        if (item.category) {
          const categoryName = item.category.toString().trim().toLowerCase();
          categoryId = categoryMap.get(categoryName) || null;
          
          if (!categoryId) {
            console.warn(`[bulk-preorder] ⚠️ 카테고리 "${item.category}"를 찾을 수 없습니다. null로 설정합니다.`);
          }
        }

        // 엑셀에서 직접 받아온 album_image_url과 album_name 사용
        // (Spotify API 호출하지 않음)
        const albumImageUrl = item.album_image_url?.trim() || null;
        const albumName = item.album_name?.trim() || null;
        const youtubeUrl = item.youtube_url?.trim() || null;
        const description = item.description?.trim() || null;

        processedItems.push({
          ...item,
          artist: artist, // trim된 값 사용
          title: title, // trim된 값 사용
          normalized_key: normalizedKey,
          album_image_url: albumImageUrl,
          album_name: albumName,
          category_id: categoryId,
          youtube_url: youtubeUrl,
          description: description,
        });

        // 진행 상황 로그 (100개마다)
        if ((i + 1) % 100 === 0) {
          console.log(`[bulk-preorder] 진행 중: ${i + 1}/${items.length} 처리 완료`);
        }
      } catch (error) {
        console.error(`[bulk-preorder] ❌ 항목 처리 오류 (${item.artist || 'Unknown'} - ${item.title || 'Unknown'}):`, error);
        errors.push({
          item,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    console.log(`[bulk-preorder] ✅ ${processedItems.length}개 항목 처리 완료`);

    // ============================================================
    // 3단계: 기존 normalized_key 조회 (중복 검사)
    // ============================================================
    const normalizedKeys = processedItems.map(item => item.normalized_key);
    const existingKeys = new Set<string>();

    if (normalizedKeys.length > 0) {
      console.log(`[bulk-preorder] 🔍 기존 항목 중복 검사 시작...`);
      
      // 배치로 조회 (Supabase의 in 쿼리 제한 고려, 최대 100개씩)
      const batchSize = 100;
      for (let i = 0; i < normalizedKeys.length; i += batchSize) {
        const batch = normalizedKeys.slice(i, i + batchSize);
        const { data: existing, error: checkError } = await supabase
          .from('drum_sheets')
          .select('normalized_key')
          .in('normalized_key', batch);
        
        if (checkError) {
          console.warn(`[bulk-preorder] ⚠️ 중복 검사 오류 (배치 ${i / batchSize + 1}):`, checkError);
        } else {
          existing?.forEach(item => {
            if (item.normalized_key) {
              existingKeys.add(item.normalized_key);
            }
          });
        }
      }

      console.log(`[bulk-preorder] 🔍 중복 검사 완료: ${existingKeys.size}개 기존 항목 발견`);
    }

    // ============================================================
    // 4단계: 새로운 항목만 필터링 및 중복 항목 카운트
    // ============================================================
    const newItems = processedItems.filter(
      item => !existingKeys.has(item.normalized_key)
    );

    // 중복으로 판정된 항목만 카운트 (정확한 집계)
    const duplicateItems = processedItems.filter(
      item => existingKeys.has(item.normalized_key)
    );
    const skippedCount = duplicateItems.length;

    if (newItems.length === 0) {
      console.log(`[bulk-preorder] ℹ️ 모든 항목이 이미 존재합니다. (건너뜀: ${skippedCount}개)`);
      return NextResponse.json({
        success: true,
        total: items.length,
        success: 0,
        skipped: skippedCount, // 중복 항목만 카운트 (에러는 별도 처리)
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    // ============================================================
    // 5단계: 새로운 항목만 DB에 삽입 (slug 자동 생성 포함)
    // ============================================================
    console.log(`[bulk-preorder] 💾 ${newItems.length}개 새 항목 DB 삽입 준비 시작...`);

    // 순차 처리로 변경 (Spotify API Rate Limit 방지를 위해)
    const insertDataWithSlugs = [];
    
    for (let i = 0; i < newItems.length; i++) {
      const item = newItems[i];
      
      // slug 자동 생성
      let baseSlug = generateSlug(item.artist.trim(), item.title.trim());
      if (!baseSlug) {
        baseSlug = `sheet-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      }

      // 중복 slug 확인 및 유니크 slug 생성
      let slug = baseSlug;
      let slugSuffix = 0;
      const maxSlugAttempts = 100;
      
      while (slugSuffix < maxSlugAttempts) {
        const { data: existingSlug } = await supabase
          .from('drum_sheets')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();

        if (!existingSlug) break; // 중복 없음 → 사용 가능
        
        slugSuffix++;
        slug = `${baseSlug}-${slugSuffix}`;
      }

      if (slugSuffix >= maxSlugAttempts) {
        // 최대 시도 횟수 초과 시 타임스탬프 기반 고유 slug 생성
        slug = `${baseSlug}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      }

      // price를 명시적으로 숫자로 변환
      const priceValue = Number(item.price);
      const finalPrice = isNaN(priceValue) ? 0 : Math.max(0, Math.round(priceValue));

      // ============================================================
      // SEO용 상세 설명 자동 생성 로직 (17개 언어 일괄 생성)
      // ============================================================
      // 엑셀에 description이 있든 없든 무조건 17개 언어 모두 자동 생성
      const artist = item.artist?.trim() || '알 수 없음';
      const title = item.title?.trim() || '알 수 없음';
      
      // 17개 언어 모두 자동 생성
      const finalDescription = generateSeoDescriptions(artist, title);
      console.log(`[bulk-preorder] 📝 [${i + 1}/${newItems.length}] SEO description 자동 생성 (17개 언어): ${artist} - ${title}`);

      // ============================================================
      // 스마트 폴백 썸네일 결정 로직
      // ============================================================
      let thumbnailUrl: string | null = null;
      let finalYoutubeUrl: string | null = null;
      let usedSpotifyApi = false; // Spotify API 호출 여부 추적

      // 1순위: youtube_url이 있으면 → 유튜브 썸네일 추출
      if (item.youtube_url && item.youtube_url.trim()) {
        const videoId = extractVideoId(item.youtube_url);
        if (videoId) {
          try {
            thumbnailUrl = await getYoutubeThumbnailUrl(videoId);
            finalYoutubeUrl = item.youtube_url;
            console.log(`[bulk-preorder] ✅ [${i + 1}/${newItems.length}] 유튜브 썸네일 추출 성공: ${item.artist} - ${item.title}`);
          } catch (error) {
            console.warn(`[bulk-preorder] ⚠️ [${i + 1}/${newItems.length}] 유튜브 썸네일 추출 실패: ${item.artist} - ${item.title}`, error);
            // 실패 시 다음 순위로 폴백
          }
        } else {
          console.warn(`[bulk-preorder] ⚠️ [${i + 1}/${newItems.length}] 유효하지 않은 유튜브 URL: ${item.youtube_url} (${item.artist} - ${item.title})`);
          // 유효하지 않은 URL이면 다음 순위로 폴백
        }
      }

      // 2순위: album_image_url이 있으면 → 엑셀 데이터 그대로 사용
      if (!thumbnailUrl && item.album_image_url && item.album_image_url.trim()) {
        thumbnailUrl = item.album_image_url;
        console.log(`[bulk-preorder] ✅ [${i + 1}/${newItems.length}] 엑셀 album_image_url 사용: ${item.artist} - ${item.title}`);
      }

      // 3순위 (Spotify 폴백): 위 두 값이 모두 없을 경우에만 Spotify API 호출
      if (!thumbnailUrl) {
        try {
          console.log(`[bulk-preorder] 🔍 [${i + 1}/${newItems.length}] Spotify API 호출 시작: ${item.artist} - ${item.title}`);
          const spotifyThumbnail = await searchTrackAndGetCover(item.artist.trim(), item.title.trim());
          
          if (spotifyThumbnail) {
            thumbnailUrl = spotifyThumbnail;
            usedSpotifyApi = true;
            console.log(`[bulk-preorder] ✅ [${i + 1}/${newItems.length}] Spotify 썸네일 추출 성공: ${item.artist} - ${item.title}`);
          } else {
            console.warn(`[bulk-preorder] ⚠️ [${i + 1}/${newItems.length}] Spotify에서 썸네일을 찾지 못함: ${item.artist} - ${item.title}`);
          }
        } catch (spotifyError) {
          console.error(`[bulk-preorder] ❌ [${i + 1}/${newItems.length}] Spotify API 호출 실패: ${item.artist} - ${item.title}`, spotifyError);
          // 에러 발생 시 null로 유지 (썸네일 없음)
        }

        // Spotify API 호출 후 Rate Limit 방지를 위한 딜레이 (300-500ms)
        if (usedSpotifyApi) {
          await new Promise(resolve => setTimeout(resolve, 400)); // 400ms 딜레이
        }
      }

      insertDataWithSlugs.push({
        artist: item.artist.trim(),
        title: item.title.trim(),
        price: finalPrice, // 숫자로 명시적 변환
        category_id: item.category_id,
        sales_type: 'PREORDER' as const, // 선주문 상품으로 강제 지정
        normalized_key: item.normalized_key,
        thumbnail_url: thumbnailUrl,
        album_name: item.album_name,
        youtube_url: finalYoutubeUrl,
        description: JSON.stringify(finalDescription), // SEO용 상세 설명 (17개 언어 다국어 객체를 JSON 문자열로 변환)
        slug: slug, // 필수 컬럼: slug 자동 생성
        // 엑셀에 없는 필드는 null 또는 기본값
        difficulty: null,
        tempo: null,
        page_count: null,
        pdf_url: null,
        preview_image_url: null,
        is_active: true, // 기본적으로 활성화
        is_featured: false,
        created_at: new Date().toISOString(),
      });

      // 진행 상황 로그 (50개마다)
      if ((i + 1) % 50 === 0) {
        console.log(`[bulk-preorder] 📊 진행 중: ${i + 1}/${newItems.length} 처리 완료`);
      }
    }

    // 삽입 전 최종 확인 (디버깅용)
    console.log(`[bulk-preorder] 📋 Insert Payload 샘플 (첫 번째 항목):`, JSON.stringify(insertDataWithSlugs[0], null, 2));
    console.log(`[bulk-preorder] 📋 총 ${insertDataWithSlugs.length}개 항목 준비 완료`);

    // 각 항목의 필수 필드 검증
    const validationErrors: string[] = [];
    insertDataWithSlugs.forEach((data, index) => {
      if (!data.artist || !data.title) {
        validationErrors.push(`항목 ${index + 1}: artist 또는 title이 비어있습니다.`);
      }
      if (!data.slug) {
        validationErrors.push(`항목 ${index + 1}: slug가 생성되지 않았습니다.`);
      }
      if (typeof data.price !== 'number' || isNaN(data.price)) {
        validationErrors.push(`항목 ${index + 1}: price가 유효한 숫자가 아닙니다. (값: ${data.price})`);
      }
    });

    if (validationErrors.length > 0) {
      console.error('[bulk-preorder] ❌ 데이터 검증 실패:', validationErrors);
      return NextResponse.json(
        {
          success: false,
          error: '데이터 검증에 실패했습니다.',
          details: validationErrors.join('; '),
          total: items.length,
          success: 0,
          skipped: 0 // 검증 실패 시 중복 카운트는 0
        },
        { status: 400 }
      );
    }

    console.log(`[bulk-preorder] 💾 DB 삽입 시작...`);

    const { data: insertedData, error: insertError } = await supabase
      .from('drum_sheets')
      .insert(insertDataWithSlugs)
      .select('id, normalized_key, slug');

    if (insertError) {
      // 상세한 에러 로깅
      console.error('[bulk-preorder] ❌ Supabase Insert Error:', {
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code,
        fullError: JSON.stringify(insertError, null, 2),
      });

      // 에러 원인 분석을 위한 추가 정보
      console.error('[bulk-preorder] ❌ 삽입 시도한 데이터 샘플 (첫 3개):');
      insertDataWithSlugs.slice(0, 3).forEach((data, idx) => {
        console.error(`  [${idx + 1}]`, {
          artist: data.artist,
          title: data.title,
          price: data.price,
          priceType: typeof data.price,
          slug: data.slug,
          category_id: data.category_id,
          sales_type: data.sales_type,
          normalized_key: data.normalized_key,
          hasThumbnail: !!data.thumbnail_url,
          hasAlbumName: !!data.album_name,
        });
      });

      return NextResponse.json(
        {
          success: false,
          error: 'DB 삽입에 실패했습니다.',
          details: insertError.message || '알 수 없는 오류',
          hint: insertError.hint || undefined,
          code: insertError.code || undefined,
          supabaseError: {
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            code: insertError.code,
          },
          total: items.length,
          success: 0,
          skipped: 0 // 검증 실패 시 중복 카운트는 0
        },
        { status: 500 }
      );
    }

    const newlyInserted = insertedData?.length || 0;

    console.log(`[bulk-preorder] ✅ 처리 완료: 총 ${items.length}개, 성공 ${newlyInserted}개, 건너뜀 (중복) ${skippedCount}개, 오류 ${errors.length}개`);

    // ============================================================
    // 6단계: 결과 반환
    // ============================================================
    return NextResponse.json({
      success: true,
      total: items.length,
      success: newlyInserted,
      skipped: skippedCount, // 중복 항목만 카운트 (정확한 집계)
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('[bulk-preorder] 🔥 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: '대량 등록 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
        total: 0,
        success: 0,
        skipped: 0
      },
      { status: 500 }
    );
  }
}
