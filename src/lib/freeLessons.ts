/**
 * 무료 드럼 레슨 코너 공통 정의 (공개 페이지 · 관리자 · API 공용)
 */

export const FREE_LESSON_PDF_BUCKET = 'free-lessons';

export const FREE_LESSON_CATEGORIES = [
  { value: 'basics', labelKo: '기초·입문', icon: 'ri-seedling-line' },
  { value: 'groove', labelKo: '리듬·그루브', icon: 'ri-music-2-line' },
  { value: 'fill', labelKo: '필인', icon: 'ri-flashlight-line' },
  { value: 'rudiment', labelKo: '루디먼트', icon: 'ri-repeat-line' },
  { value: 'technique', labelKo: '테크닉', icon: 'ri-focus-3-line' },
  { value: 'song', labelKo: '곡 레슨', icon: 'ri-album-line' },
  { value: 'reading', labelKo: '악보 읽기', icon: 'ri-file-music-line' },
] as const;

export type FreeLessonCategory = (typeof FREE_LESSON_CATEGORIES)[number]['value'];

export const FREE_LESSON_LEVELS = [
  { value: 'beginner', labelKo: '초급', badgeClass: 'bg-emerald-100 text-emerald-700' },
  { value: 'intermediate', labelKo: '중급', badgeClass: 'bg-amber-100 text-amber-700' },
  { value: 'advanced', labelKo: '고급', badgeClass: 'bg-rose-100 text-rose-700' },
] as const;

export type FreeLessonLevel = (typeof FREE_LESSON_LEVELS)[number]['value'];

/** 공개 페이지에서 읽는 컬럼 (pdf_path 같은 내부 값은 제외) */
export const FREE_LESSON_PUBLIC_COLUMNS =
  'id, slug, title, title_en, summary, summary_en, description, description_en, youtube_url, youtube_video_id, thumbnail_url, category, level, bpm, pdf_page_count, pdf_preview_url, related_sheet_ids, is_featured, sort_order, download_count, view_count, published_at, created_at, has_pdf:pdf_path';

/** 목록 카드에 필요한 컬럼 */
export const FREE_LESSON_CARD_COLUMNS =
  'id, slug, title, title_en, summary, summary_en, youtube_video_id, thumbnail_url, category, level, bpm, pdf_page_count, is_featured, sort_order, download_count, view_count, published_at, created_at';

export interface FreeLessonCardData {
  id: string;
  slug: string;
  title: string;
  title_en: string | null;
  summary: string | null;
  summary_en: string | null;
  youtube_video_id: string;
  thumbnail_url: string | null;
  category: string;
  level: string;
  bpm: string | null;
  pdf_page_count: number | null;
  is_featured: boolean;
  sort_order: number;
  download_count: number;
  view_count: number;
  published_at: string | null;
  created_at: string;
}

export interface FreeLessonDetailData extends FreeLessonCardData {
  description: string | null;
  description_en: string | null;
  youtube_url: string;
  pdf_preview_url: string | null;
  related_sheet_ids: string[] | null;
  /** 서버에서 pdf_path 존재 여부만 남긴 값 */
  has_pdf: boolean;
}

export interface FreeLessonRelatedSheet {
  id: string;
  title: string;
  artist: string;
  slug: string | null;
  thumbnail_url: string | null;
  price: number | null;
}

export function extractYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/(?:embed|v|shorts|live)\/([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function youtubeThumbnailUrl(videoId: string, quality: 'hq' | 'max' = 'hq'): string {
  return `https://i.ytimg.com/vi/${videoId}/${quality === 'max' ? 'maxresdefault' : 'hqdefault'}.jpg`;
}

export function lessonThumbnail(lesson: Pick<FreeLessonCardData, 'thumbnail_url' | 'youtube_video_id'>): string {
  return lesson.thumbnail_url || youtubeThumbnailUrl(lesson.youtube_video_id);
}

/** 한국어 사이트는 한글, 그 외에는 영문 값이 있으면 영문 */
export function localizedLessonText(ko: string | null | undefined, en: string | null | undefined, locale: string): string {
  if (locale !== 'ko' && en?.trim()) return en.trim();
  return (ko ?? '').trim();
}

export function levelBadgeClass(level: string): string {
  return FREE_LESSON_LEVELS.find((item) => item.value === level)?.badgeClass ?? 'bg-gray-100 text-gray-600';
}

export function categoryIcon(category: string): string {
  return FREE_LESSON_CATEGORIES.find((item) => item.value === category)?.icon ?? 'ri-music-line';
}

/** 최근 14일 안에 공개된 레슨 */
export function isNewLesson(lesson: Pick<FreeLessonCardData, 'published_at' | 'created_at'>): boolean {
  const base = lesson.published_at || lesson.created_at;
  if (!base) return false;
  return Date.now() - new Date(base).getTime() < 14 * 24 * 60 * 60 * 1000;
}

export function sortLessonsDefault<T extends FreeLessonCardData>(lessons: T[]): T[] {
  return [...lessons].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    if (a.sort_order !== b.sort_order) return b.sort_order - a.sort_order;
    const aTime = new Date(a.published_at || a.created_at).getTime();
    const bTime = new Date(b.published_at || b.created_at).getTime();
    return bTime - aTime;
  });
}

export function sanitizePdfFileName(name: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'copydrum-lesson';
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

/** 로그인 후 돌아와 자동 다운로드할 때 쓰는 쿼리 */
export const FREE_LESSON_AUTO_DOWNLOAD_PARAM = 'download';
