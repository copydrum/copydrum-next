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

const THUMBNAIL_DOWNLOAD_TIMEOUT_MS = 10000;
const THUMBNAIL_MAX_FILE_SIZE = 10 * 1024 * 1024;

function isExternalUrl(url: string): boolean {
  if (!url || !url.startsWith('http')) return false;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseDomain = supabaseUrl.replace('https://', '').replace('http://', '');
  return !url.includes(supabaseDomain);
}

function getThumbnailContentType(
  contentType: string | null,
  url: string
): { mime: string; ext: string } {
  if (contentType?.includes('image/png')) return { mime: 'image/png', ext: 'png' };
  if (contentType?.includes('image/webp')) return { mime: 'image/webp', ext: 'webp' };
  const urlLower = url.toLowerCase();
  if (urlLower.includes('.png')) return { mime: 'image/png', ext: 'png' };
  if (urlLower.includes('.webp')) return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}

async function downloadAndUploadThumbnail(
  supabase: ReturnType<typeof createClient>,
  imageUrl: string,
  identifier: string
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), THUMBNAIL_DOWNLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CopyDrumBot/1.0)', 'Accept': 'image/*' },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type');
    if (ct && !ct.startsWith('image/')) return null;
    const buf = await resp.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > THUMBNAIL_MAX_FILE_SIZE) return null;
    const { mime, ext } = getThumbnailContentType(ct, imageUrl);
    const filePath = `thumbnails/thumb_${identifier}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('drum-sheets').upload(filePath, buf, { contentType: mime, upsert: true });
    if (error) { console.error('[bulk-preorder] thumbnail upload error:', error.message); return null; }
    const { data } = supabase.storage.from('drum-sheets').getPublicUrl(filePath);
    return data.publicUrl;
  } catch (e: any) {
    console.warn('[bulk-preorder] thumbnail download failed:', e.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
        
        // 디버깅: 정규화 결과 로깅 (중요한 케이스만)
        if (artist.includes('(') || title.includes('(') || artist.includes('(') || title.includes('(')) {
          console.log(`[bulk-preorder] 📝 [${i + 1}/${items.length}] 정규화: "${artist}" + "${title}" -> "${normalizedKey}"`);
        }
        
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
    // 3단계: 배치 내 중복 제거 (같은 normalized_key가 여러 번 나오는 경우)
    // ============================================================
    const seenKeysInBatch = new Set<string>();
    const uniqueProcessedItems: ProcessedItem[] = [];
    const batchDuplicates: string[] = [];

    for (const item of processedItems) {
      if (seenKeysInBatch.has(item.normalized_key)) {
        batchDuplicates.push(`${item.artist} - ${item.title}`);
        console.log(`[bulk-preorder] ⚠️ 배치 내 중복 발견: ${item.artist} - ${item.title} (normalized_key: ${item.normalized_key})`);
        continue;
      }
      seenKeysInBatch.add(item.normalized_key);
      uniqueProcessedItems.push(item);
    }

    if (batchDuplicates.length > 0) {
      console.log(`[bulk-preorder] ⚠️ 배치 내 중복 항목 ${batchDuplicates.length}개 제거됨`);
    }

    // ============================================================
    // 4단계: 기존 악보 조회 및 정규화 비교 (강화된 중복 검사)
    // ============================================================
    // 문제: DB에 있는 기존 normalized_key가 이전 버전의 정규화 함수로 생성되었을 수 있음
    // 해결: artist와 title을 직접 조회하여 현재 버전의 정규화 함수로 재정규화하여 비교
    const existingKeys = new Set<string>();
    const existingSheetsMap = new Map<string, { id: string; sales_type: string | null }>(); // normalized_key -> sheet info

    if (uniqueProcessedItems.length > 0) {
      console.log(`[bulk-preorder] 🔍 기존 항목 중복 검사 시작 (강화된 방식)...`);
      
      // 1단계: 빠른 경로 - normalized_key로 직접 조회 시도
      const normalizedKeys = uniqueProcessedItems.map(item => item.normalized_key);
      const quickCheckMap = new Map<string, { id: string; sales_type: string | null }>();
      
      const batchSize = 100;
      for (let i = 0; i < normalizedKeys.length; i += batchSize) {
        const batch = normalizedKeys.slice(i, i + batchSize);
        const { data: quickCheck } = await supabase
          .from('drum_sheets')
          .select('id, normalized_key, sales_type')
          .in('normalized_key', batch);
        
        quickCheck?.forEach(sheet => {
          if (sheet.normalized_key) {
            quickCheckMap.set(sheet.normalized_key, {
              id: sheet.id,
              sales_type: sheet.sales_type || null
            });
          }
        });
      }

      // 빠른 경로에서 찾지 못한 항목들만 정밀 검사
      const itemsNeedingPreciseCheck = uniqueProcessedItems.filter(
        item => !quickCheckMap.has(item.normalized_key)
      );

      console.log(`[bulk-preorder] 🔍 빠른 경로: ${quickCheckMap.size}개 발견, 정밀 검사 필요: ${itemsNeedingPreciseCheck.length}개`);

      // 빠른 경로에서 찾은 항목들을 결과에 추가
      quickCheckMap.forEach((sheetInfo, key) => {
        existingKeys.add(key);
        existingSheetsMap.set(key, sheetInfo);
      });

      // 2단계: 정밀 검사 - artist와 title로 재정규화하여 비교
      if (itemsNeedingPreciseCheck.length > 0) {
        console.log(`[bulk-preorder] 🔍 정밀 검사 대상: ${itemsNeedingPreciseCheck.map(i => `${i.artist} - ${i.title}`).join(', ')}`);
        
        // 모든 기존 악보를 조회 (artist, title 포함)
        // limit을 제거하고 모든 데이터를 가져오기 위해 페이지네이션 사용
        const allExistingSheets: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: batch, error: fetchError } = await supabase
            .from('drum_sheets')
            .select('id, artist, title, normalized_key, sales_type')
            .range(page * pageSize, (page + 1) * pageSize - 1)
            .order('created_at', { ascending: false });

          if (fetchError) {
            console.warn(`[bulk-preorder] ⚠️ 기존 악보 조회 오류 (페이지 ${page}):`, fetchError);
            hasMore = false;
            break;
          }

          if (!batch || batch.length === 0) {
            hasMore = false;
            break;
          }

          allExistingSheets.push(...batch);

          if (batch.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        }

        console.log(`[bulk-preorder] 🔍 총 ${allExistingSheets.length}개 기존 악보 조회 완료`);

        if (allExistingSheets.length > 0) {
          // 기존 악보들을 현재 버전 정규화 함수로 재정규화하여 맵 생성
          const renormalizedMap = new Map<string, { id: string; sales_type: string | null }>();
          
          allExistingSheets.forEach(sheet => {
            if (sheet.artist && sheet.title) {
              try {
                const renormalizedKey = generateNormalizedKey(sheet.artist, sheet.title);
                // 같은 키가 여러 개 있을 수 있으므로 첫 번째 것만 사용 (또는 더 최신 것)
                if (!renormalizedMap.has(renormalizedKey)) {
                  renormalizedMap.set(renormalizedKey, {
                    id: sheet.id,
                    sales_type: sheet.sales_type || null
                  });
                }
                // 디버깅: NMIXX나 TIC TIC 관련 로그
                if (sheet.artist.toUpperCase().includes('NMIXX') || sheet.title.toUpperCase().includes('TIC TIC')) {
                  console.log(`[bulk-preorder] 🔍 [디버깅] 기존 악보 정규화: "${sheet.artist}" + "${sheet.title}" -> "${renormalizedKey}"`);
                }
              } catch (error) {
                console.warn(`[bulk-preorder] ⚠️ 정규화 오류 (기존 악보): ${sheet.artist} - ${sheet.title}`, error);
              }
            }
          });

          console.log(`[bulk-preorder] 🔍 재정규화 맵 생성 완료: ${renormalizedMap.size}개 키`);

          // 정밀 검사가 필요한 항목들과 비교
          itemsNeedingPreciseCheck.forEach(item => {
            const itemKey = item.normalized_key;
            console.log(`[bulk-preorder] 🔍 정밀 검사: "${item.artist} - ${item.title}" -> normalized_key: "${itemKey}"`);
            
            if (renormalizedMap.has(itemKey)) {
              const sheetInfo = renormalizedMap.get(itemKey)!;
              existingKeys.add(itemKey);
              existingSheetsMap.set(itemKey, sheetInfo);
              console.log(`[bulk-preorder] ✅ 정밀 검사로 중복 발견: "${item.artist} - ${item.title}" (기존 ID: ${sheetInfo.id}, 재정규화 키: ${itemKey})`);
            } else {
              console.log(`[bulk-preorder] ❌ 정밀 검사 결과 중복 없음: "${item.artist} - ${item.title}" (키: ${itemKey})`);
            }
          });
        }
      }

      console.log(`[bulk-preorder] 🔍 중복 검사 완료: ${existingKeys.size}개 기존 항목 발견`);
    }

    // ============================================================
    // 5단계: 중복 항목 처리 (선주문 상품 업데이트 또는 스킵)
    // ============================================================
    const newItems: ProcessedItem[] = [];
    const itemsToUpdate: Array<{ sheetId: string; item: ProcessedItem }> = [];
    const skippedItems: ProcessedItem[] = [];

    for (const item of uniqueProcessedItems) {
      if (existingKeys.has(item.normalized_key)) {
        const existingSheet = existingSheetsMap.get(item.normalized_key);
        if (existingSheet) {
          // 기존 상품이 선주문 상품이면 업데이트 대상으로 추가
          if (existingSheet.sales_type === 'PREORDER') {
            itemsToUpdate.push({
              sheetId: existingSheet.id,
              item: item
            });
            console.log(`[bulk-preorder] 🔄 업데이트 대상: ${item.artist} - ${item.title} (기존 선주문 상품 ID: ${existingSheet.id})`);
          } else {
            // 일반 상품이면 스킵
            skippedItems.push(item);
            console.log(`[bulk-preorder] ⏭️ 스킵: ${item.artist} - ${item.title} (기존 일반 상품)`);
          }
        } else {
          skippedItems.push(item);
        }
      } else {
        // 새로운 항목
        newItems.push(item);
      }
    }

    const skippedCount = skippedItems.length + batchDuplicates.length;

    // ============================================================
    // 6단계: 기존 선주문 상품 업데이트
    // ============================================================
    let updatedCount = 0;
    if (itemsToUpdate.length > 0) {
      console.log(`[bulk-preorder] 🔄 ${itemsToUpdate.length}개 기존 선주문 상품 업데이트 시작...`);
      
      for (const { sheetId, item } of itemsToUpdate) {
        try {
          // 업데이트할 데이터 준비
          const updateData: any = {
            price: Number(item.price) || 0,
            category_id: item.category_id,
            thumbnail_url: item.album_image_url,
            album_name: item.album_name,
            youtube_url: item.youtube_url,
            updated_at: new Date().toISOString(),
          };

          // description이 있으면 업데이트 (SEO용 다국어 설명)
          if (item.description) {
            updateData.description = item.description;
          } else {
            // description이 없으면 자동 생성
            const artist = item.artist?.trim() || '알 수 없음';
            const title = item.title?.trim() || '알 수 없음';
            updateData.description = JSON.stringify(generateSeoDescriptions(artist, title));
          }

          // 썸네일이 없으면 유튜브에서 추출 시도
          if (!updateData.thumbnail_url && item.youtube_url) {
            const videoId = extractVideoId(item.youtube_url);
            if (videoId) {
              try {
                updateData.thumbnail_url = await getYoutubeThumbnailUrl(videoId);
              } catch (error) {
                console.warn(`[bulk-preorder] ⚠️ 썸네일 추출 실패: ${item.artist} - ${item.title}`, error);
              }
            }
          }

          const { error: updateError } = await supabase
            .from('drum_sheets')
            .update(updateData)
            .eq('id', sheetId);

          if (updateError) {
            console.error(`[bulk-preorder] ❌ 업데이트 실패: ${item.artist} - ${item.title}`, updateError);
          } else {
            updatedCount++;
            console.log(`[bulk-preorder] ✅ 업데이트 완료: ${item.artist} - ${item.title}`);
          }
        } catch (error) {
          console.error(`[bulk-preorder] ❌ 업데이트 중 오류: ${item.artist} - ${item.title}`, error);
        }
      }

      console.log(`[bulk-preorder] 🔄 업데이트 완료: ${updatedCount}/${itemsToUpdate.length}개`);
    }

    if (newItems.length === 0 && itemsToUpdate.length === 0) {
      console.log(`[bulk-preorder] ℹ️ 모든 항목이 이미 존재합니다. (건너뜀: ${skippedCount}개)`);
      return NextResponse.json({
        success: true,
        total: items.length,
        success: 0,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    // ============================================================
    // 7단계: 새로운 항목만 DB에 삽입 (slug 자동 생성 포함)
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

      // 외부 썸네일 URL → Supabase Storage 업로드
      if (thumbnailUrl && isExternalUrl(thumbnailUrl)) {
        const slugId = slug || `bulk_${Date.now()}_${i}`;
        const storageUrl = await downloadAndUploadThumbnail(supabase, thumbnailUrl, slugId);
        if (storageUrl) {
          console.log(`[bulk-preorder] ✅ [${i + 1}/${newItems.length}] 썸네일 Storage 업로드 완료: ${item.artist} - ${item.title}`);
          thumbnailUrl = storageUrl;
        } else {
          console.warn(`[bulk-preorder] ⚠️ [${i + 1}/${newItems.length}] 썸네일 Storage 업로드 실패, 원본 URL 유지: ${item.artist} - ${item.title}`);
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

    // 삽입 전 최종 중복 검사 (Race Condition 방지) - 강화된 방식
    // 문제: DB의 기존 normalized_key가 이전 버전 정규화 함수로 생성되었을 수 있음
    // 해결: artist와 title을 조회하여 현재 버전으로 재정규화하여 비교
    const finalExistingKeys = new Set<string>();
    
    if (insertDataWithSlugs.length > 0) {
      console.log(`[bulk-preorder] 🔍 삽입 직전 최종 중복 검사 시작 (강화된 방식)...`);
      
      // 모든 기존 악보를 조회하여 artist와 title로 재정규화 비교
      const { data: allExistingSheets } = await supabase
        .from('drum_sheets')
        .select('id, artist, title, normalized_key, sales_type')
        .limit(10000); // 충분히 큰 수로 제한

      if (allExistingSheets) {
        // 기존 악보들을 현재 버전 정규화 함수로 재정규화하여 맵 생성
        const renormalizedMap = new Map<string, { id: string; sales_type: string | null }>(); // renormalized_key -> sheet info
        
        allExistingSheets.forEach(sheet => {
          if (sheet.artist && sheet.title) {
            try {
              const renormalizedKey = generateNormalizedKey(sheet.artist, sheet.title);
              renormalizedMap.set(renormalizedKey, {
                id: sheet.id,
                sales_type: sheet.sales_type || null
              });
            } catch (error) {
              // 정규화 실패 시 무시
            }
          }
        });

        // 삽입할 항목들과 비교
        insertDataWithSlugs.forEach(item => {
          if (renormalizedMap.has(item.normalized_key)) {
            finalExistingKeys.add(item.normalized_key);
            const existingSheet = renormalizedMap.get(item.normalized_key);
            console.log(`[bulk-preorder] ⚠️ 삽입 직전 중복 발견: ${item.artist} - ${item.title} (기존 ID: ${existingSheet?.id})`);
          }
        });
      }
    }

    // 최종 중복 제거
    const finalNewItems = insertDataWithSlugs.filter(
      item => !finalExistingKeys.has(item.normalized_key)
    );

    if (finalNewItems.length < insertDataWithSlugs.length) {
      const finalSkipped = insertDataWithSlugs.length - finalNewItems.length;
      console.log(`[bulk-preorder] ⚠️ 삽입 직전 중복 ${finalSkipped}개 추가 발견 및 제거`);
    }

    if (finalNewItems.length === 0) {
      console.log(`[bulk-preorder] ℹ️ 삽입 직전 중복 검사 결과 모든 항목이 이미 존재합니다.`);
      return NextResponse.json({
        success: true,
        total: items.length,
        success: 0,
        updated: updatedCount,
        skipped: skippedCount + (insertDataWithSlugs.length - finalNewItems.length),
        errors: errors.length > 0 ? errors : undefined,
      });
    }

    const { data: insertedData, error: insertError } = await supabase
      .from('drum_sheets')
      .insert(finalNewItems)
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

    console.log(`[bulk-preorder] ✅ 처리 완료: 총 ${items.length}개, 신규 등록 ${newlyInserted}개, 업데이트 ${updatedCount}개, 건너뜀 (중복) ${skippedCount}개, 오류 ${errors.length}개`);

    // ============================================================
    // 7단계: 결과 반환
    // ============================================================
    return NextResponse.json({
      success: true,
      total: items.length,
      success: newlyInserted,
      updated: updatedCount,
      skipped: skippedCount,
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
