/**
 * 어드민이 입력한 드럼레슨 교재 상세 HTML에서 위험한 태그/이벤트만 제거합니다.
 */
export function sanitizeLessonDetailHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\/(?:script|style)[^>]*>/gi, '')
    .replace(/<(script|style)[\s\S]*?>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed)[^>]*>/gi, '')
    .replace(/\s(?:on\w+|javascript:)\s*=/gi, ' data-blocked=');
}
