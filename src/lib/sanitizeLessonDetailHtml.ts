import DOMPurify from 'isomorphic-dompurify';

/**
 * 어드민이 입력한 상세 HTML(드럼레슨 교재 / 악보 상세설명)을 안전하게 정제합니다.
 * - DOMPurify 기반(서버/클라이언트 동작) → 정규식 방식보다 XSS 방어가 견고.
 * - 서식/이미지/링크 허용 + YouTube·Vimeo iframe 만 화이트리스트로 허용.
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

export function sanitizeLessonDetailHtml(html: string): string {
  if (!html) return '';
  ensureHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark',
      'h1', 'h2', 'h3', 'h4',
      'ul', 'ol', 'li',
      'a', 'blockquote', 'code', 'pre',
      'span', 'div',
      'img', 'figure', 'figcaption',
      'iframe', 'hr',
      'table', 'thead', 'tbody', 'tr', 'td', 'th',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'title', 'class',
      'width', 'height',
      'allow', 'allowfullscreen', 'frameborder', 'loading',
      'colspan', 'rowspan',
    ],
    ALLOW_DATA_ATTR: false,
  });
}

/** 의미가 명확한 별칭 (악보 상세설명 등에서 사용) */
export const sanitizeRichHtml = sanitizeLessonDetailHtml;
