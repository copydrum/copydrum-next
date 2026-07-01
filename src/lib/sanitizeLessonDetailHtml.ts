import DOMPurify from 'dompurify';

/**
 * 어드민이 입력한 상세 HTML(드럼레슨 교재 / 악보 상세설명)을 안전하게 정제합니다.
 *
 * ⚠️ [중요] 과거에는 `isomorphic-dompurify` 를 사용했는데, 이 패키지는 서버(SSR)에서
 *    모듈 로드 시 `jsdom` 으로 window 를 생성한다. 이 초기화가 서버리스 런타임(예: Vercel)에서
 *    실패하면, 이 모듈을 import 하는 클라이언트 컴포넌트(SheetDetailClient)의 SSR 이 통째로
 *    throw 하여 /drum-sheet/[slug] 상세 페이지 전체가 HTTP 500 (noindex) 이 된다.
 *    → 로컬(Node)에서는 재현되지 않고 배포 환경에서만 500 이 발생하는 원인이었다.
 *
 *    이를 근본적으로 막기 위해 브라우저 전용 `dompurify` 로 교체한다.
 *    - 브라우저: DOMPurify 로 완전 정제 (기존과 동일한 화이트리스트).
 *    - 서버(SSR): window 가 없어 DOMPurify 를 쓸 수 없으므로 경량 정규식 폴백으로
 *      최소 방어(script/style/이벤트 핸들러/위험 프로토콜 제거)만 수행한다.
 *      어드민이 작성한 준신뢰 콘텐츠이며, 클라이언트 하이드레이션 시 DOMPurify 로 재정제된다.
 */
const ALLOWED_IFRAME_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
]);

let hooksRegistered = false;

function ensureHooks() {
  if (hooksRegistered) return;

  // 허용 호스트가 아닌 iframe 은 제거한다.
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'iframe') return;
    const el = node as unknown as Element;
    const src = el.getAttribute?.('src') || '';
    let allowed = false;
    try {
      allowed = ALLOWED_IFRAME_HOSTS.has(new URL(src).hostname);
    } catch {
      allowed = false;
    }
    if (!allowed) {
      node.parentNode?.removeChild(node);
    }
  });

  // 외부 링크는 새 탭 + 안전 rel 강제.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as unknown as Element;
    if (el.tagName === 'A' && el.getAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });

  hooksRegistered = true;
}

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark',
  'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre',
  'span', 'div',
  'img', 'figure', 'figcaption',
  'iframe', 'hr',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel',
  'src', 'alt', 'title', 'class',
  'width', 'height',
  'allow', 'allowfullscreen', 'frameborder', 'loading',
  'colspan', 'rowspan',
];

/**
 * 서버(SSR) 전용 경량 폴백 정제.
 * jsdom 없이 동작하도록 정규식만 사용한다. (완전한 XSS 방어가 아니라, 어드민 콘텐츠에 대한 최소 방어)
 */
function serverFallbackSanitize(html: string): string {
  return html
    // <script>...</script>, <style>...</style> 및 여는 태그 제거
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style)[^>]*>/gi, '')
    // on* 이벤트 핸들러 속성 제거
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // javascript: 프로토콜 무력화
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=$2#$2');
}

export function sanitizeLessonDetailHtml(html: string): string {
  if (!html) return '';

  // 서버(SSR): window 가 없으면 DOMPurify(브라우저 API 의존)를 사용할 수 없다.
  if (typeof window === 'undefined' || typeof (DOMPurify as { sanitize?: unknown }).sanitize !== 'function') {
    return serverFallbackSanitize(html);
  }

  ensureHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/** 의미가 명확한 별칭 (악보 상세설명 등에서 사용) */
export const sanitizeRichHtml = sanitizeLessonDetailHtml;
