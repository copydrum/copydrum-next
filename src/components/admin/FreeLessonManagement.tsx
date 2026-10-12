'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { pdfjsLib } from '../../lib/pdfClient';
import { slugify } from '../../lib/slugify';
import {
  FREE_LESSON_CATEGORIES,
  FREE_LESSON_LEVELS,
  FREE_LESSON_PDF_BUCKET,
  extractYoutubeVideoId,
  levelBadgeClass,
  youtubeThumbnailUrl,
} from '../../lib/freeLessons';
import RichTextEditor from './RichTextEditor';

const PUBLIC_ASSET_BUCKET = 'drum-sheets';
const MAX_RELATED_SHEETS = 8;

interface FreeLessonRow {
  id: string;
  slug: string;
  title: string;
  title_en: string | null;
  summary: string | null;
  summary_en: string | null;
  description: string | null;
  description_en: string | null;
  youtube_url: string;
  youtube_video_id: string;
  thumbnail_url: string | null;
  category: string;
  level: string;
  bpm: string | null;
  pdf_path: string | null;
  pdf_file_name: string | null;
  pdf_page_count: number | null;
  pdf_size_bytes: number | null;
  pdf_preview_url: string | null;
  related_sheet_ids: string[] | null;
  is_published: boolean;
  is_featured: boolean;
  sort_order: number;
  download_count: number;
  view_count: number;
  published_at: string | null;
  created_at: string;
}

interface LessonStats {
  total_downloads: number;
  unique_members: number;
  recent_downloads: number;
  new_members: number;
  buyers: number;
}

interface RelatedSheetOption {
  id: string;
  title: string;
  artist: string;
  thumbnail_url: string | null;
}

interface LessonForm {
  youtube_url: string;
  title: string;
  title_en: string;
  summary: string;
  summary_en: string;
  description: string;
  description_en: string;
  category: string;
  level: string;
  bpm: string;
  slug: string;
  thumbnail_url: string;
  pdf_path: string;
  pdf_file_name: string;
  pdf_page_count: number;
  pdf_size_bytes: number;
  pdf_preview_url: string;
  related_sheet_ids: string[];
  is_published: boolean;
  is_featured: boolean;
  sort_order: number;
}

const emptyForm = (): LessonForm => ({
  youtube_url: '',
  title: '',
  title_en: '',
  summary: '',
  summary_en: '',
  description: '',
  description_en: '',
  category: 'basics',
  level: 'beginner',
  bpm: '',
  slug: '',
  thumbnail_url: '',
  pdf_path: '',
  pdf_file_name: '',
  pdf_page_count: 0,
  pdf_size_bytes: 0,
  pdf_preview_url: '',
  related_sheet_ids: [],
  is_published: true,
  is_featured: false,
  sort_order: 0,
});

const rowToForm = (row: FreeLessonRow): LessonForm => ({
  youtube_url: row.youtube_url,
  title: row.title,
  title_en: row.title_en ?? '',
  summary: row.summary ?? '',
  summary_en: row.summary_en ?? '',
  description: row.description ?? '',
  description_en: row.description_en ?? '',
  category: row.category,
  level: row.level,
  bpm: row.bpm ?? '',
  slug: row.slug,
  thumbnail_url: row.thumbnail_url ?? '',
  pdf_path: row.pdf_path ?? '',
  pdf_file_name: row.pdf_file_name ?? '',
  pdf_page_count: row.pdf_page_count ?? 0,
  pdf_size_bytes: row.pdf_size_bytes ?? 0,
  pdf_preview_url: row.pdf_preview_url ?? '',
  related_sheet_ids: row.related_sheet_ids ?? [],
  is_published: row.is_published,
  is_featured: row.is_featured,
  sort_order: row.sort_order ?? 0,
});

const formatBytes = (bytes: number) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};

const randomKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const categoryLabel = (value: string) => FREE_LESSON_CATEGORIES.find((item) => item.value === value)?.labelKo ?? value;
const levelLabel = (value: string) => FREE_LESSON_LEVELS.find((item) => item.value === value)?.labelKo ?? value;

async function uploadPublicAsset(file: Blob, folder: string, ext: string, contentType: string): Promise<string> {
  const path = `free-lessons/${folder}/${randomKey()}.${ext}`;
  const { error } = await supabase.storage.from(PUBLIC_ASSET_BUCKET).upload(path, file, { contentType, upsert: false });
  if (error) throw error;
  return supabase.storage.from(PUBLIC_ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** PDF 첫 페이지를 JPEG 로 렌더해 공개 버킷에 올린다 (상세 페이지 미리보기용) */
async function createPdfPreview(buffer: ArrayBuffer): Promise<{ pageCount: number; previewUrl: string }> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pageCount = pdf.numPages;
  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return { pageCount, previewUrl: '' };
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return { pageCount, previewUrl: '' };
    const previewUrl = await uploadPublicAsset(blob, 'previews', 'jpg', 'image/jpeg');
    return { pageCount, previewUrl };
  } catch (error) {
    console.warn('PDF 미리보기 생성 실패:', error);
    return { pageCount, previewUrl: '' };
  }
}

export default function FreeLessonManagement() {
  const [lessons, setLessons] = useState<FreeLessonRow[]>([]);
  const [stats, setStats] = useState<Map<string, LessonStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [editing, setEditing] = useState<FreeLessonRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const loadLessons = useCallback(async () => {
    const { data, error } = await supabase
      .from('free_lessons')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('무료 레슨 조회 실패:', error);
      setLoadError(
        error.code === '42P01' || /free_lessons/.test(error.message)
          ? 'free_lessons 테이블이 없습니다. Supabase SQL Editor 에서 20261012170000_free_lessons.sql 을 먼저 실행해주세요.'
          : `레슨 목록을 불러오지 못했습니다: ${error.message}`,
      );
      setLessons([]);
    } else {
      setLoadError(null);
      setLessons((data ?? []) as FreeLessonRow[]);
    }

    const { data: statRows, error: statError } = await supabase.rpc('free_lesson_admin_stats', { p_days: 30 });
    if (statError) {
      console.warn('무료 레슨 통계 조회 실패:', statError);
    } else {
      const map = new Map<string, LessonStats>();
      for (const row of (statRows ?? []) as Array<LessonStats & { lesson_id: string }>) {
        map.set(row.lesson_id, {
          total_downloads: Number(row.total_downloads) || 0,
          unique_members: Number(row.unique_members) || 0,
          recent_downloads: Number(row.recent_downloads) || 0,
          new_members: Number(row.new_members) || 0,
          buyers: Number(row.buyers) || 0,
        });
      }
      setStats(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadLessons);
  }, [loadLessons]);

  const summary = useMemo(() => {
    let members = 0;
    let recent = 0;
    let newMembers = 0;
    let buyers = 0;
    for (const value of stats.values()) {
      members += value.unique_members;
      recent += value.recent_downloads;
      newMembers += value.new_members;
      buyers += value.buyers;
    }
    return {
      published: lessons.filter((lesson) => lesson.is_published).length,
      total: lessons.length,
      members,
      recent,
      newMembers,
      buyers,
    };
  }, [lessons, stats]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return lessons.filter((lesson) => {
      if (statusFilter === 'published' && !lesson.is_published) return false;
      if (statusFilter === 'draft' && lesson.is_published) return false;
      if (!term) return true;
      return `${lesson.title} ${lesson.title_en ?? ''} ${lesson.summary ?? ''}`.toLowerCase().includes(term);
    });
  }, [lessons, search, statusFilter]);

  const updateFlag = async (lesson: FreeLessonRow, patch: Partial<Pick<FreeLessonRow, 'is_published' | 'is_featured'>>) => {
    if (patch.is_published && !lesson.pdf_path && !confirm('PDF가 아직 없습니다. 그래도 공개할까요? (고객에게는 "PDF 준비 중"으로 보입니다)')) {
      return;
    }
    setLessons((prev) => prev.map((item) => (item.id === lesson.id ? { ...item, ...patch } : item)));
    const { error } = await supabase.from('free_lessons').update(patch).eq('id', lesson.id);
    if (error) {
      alert(`변경 실패: ${error.message}`);
      void loadLessons();
    }
  };

  const deleteLesson = async (lesson: FreeLessonRow) => {
    if (!confirm(`"${lesson.title}" 레슨을 삭제할까요?\n다운로드 기록도 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    const { error } = await supabase.from('free_lessons').delete().eq('id', lesson.id);
    if (error) {
      alert(`삭제 실패: ${error.message}`);
      return;
    }
    if (lesson.pdf_path) {
      await supabase.storage.from(FREE_LESSON_PDF_BUCKET).remove([lesson.pdf_path]);
    }
    setLessons((prev) => prev.filter((item) => item.id !== lesson.id));
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (lesson: FreeLessonRow) => {
    setEditing(lesson);
    setFormOpen(true);
  };

  const statCards = [
    { label: '공개 레슨', value: `${summary.published} / ${summary.total}`, icon: 'ri-play-list-2-line', color: 'text-blue-600 bg-blue-50' },
    { label: 'PDF 받은 회원 (누적)', value: summary.members.toLocaleString(), icon: 'ri-download-2-line', color: 'text-emerald-600 bg-emerald-50' },
    { label: '최근 30일 다운로드', value: summary.recent.toLocaleString(), icon: 'ri-line-chart-line', color: 'text-violet-600 bg-violet-50' },
    { label: '레슨 보고 가입한 회원', value: summary.newMembers.toLocaleString(), icon: 'ri-user-add-line', color: 'text-amber-600 bg-amber-50', hint: '가입 후 24시간 안에 PDF를 받은 회원' },
    { label: '이후 악보 구매 회원', value: summary.buyers.toLocaleString(), icon: 'ri-shopping-bag-3-line', color: 'text-rose-600 bg-rose-50', hint: 'PDF를 받은 뒤 악보를 결제한 회원' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4" title={card.hint}>
            <div className="flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.color}`}>
                <i className={card.icon} />
              </span>
              <span className="text-xs font-medium text-gray-500">{card.label}</span>
            </div>
            <p className="mt-2 text-xl font-bold text-gray-900">{card.value}</p>
            {card.hint && <p className="mt-0.5 text-[11px] text-gray-400">{card.hint}</p>}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="레슨 제목 검색"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 sm:max-w-xs"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">전체 상태</option>
              <option value="published">공개</option>
              <option value="draft">비공개</option>
            </select>
          </div>
          <div className="flex gap-2">
            <a
              href="/ko/free-lessons"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <i className="ri-external-link-line" />
              고객 화면
            </a>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <i className="ri-add-line" />
              새 레슨 등록
            </button>
          </div>
        </div>

        {loadError && <div className="m-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <i className="ri-loader-4-line mr-2 animate-spin" />
            불러오는 중...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            {lessons.length === 0 ? (
              <>
                <i className="ri-video-add-line mb-2 block text-4xl text-gray-300" />
                아직 등록된 레슨이 없습니다. 유튜브 링크와 PDF로 첫 레슨을 등록해 보세요.
              </>
            ) : (
              '조건에 맞는 레슨이 없습니다.'
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((lesson) => {
              const stat = stats.get(lesson.id);
              return (
                <li key={lesson.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <img
                      src={lesson.thumbnail_url || youtubeThumbnailUrl(lesson.youtube_video_id)}
                      alt=""
                      className="h-16 w-28 flex-shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${levelBadgeClass(lesson.level)}`}>
                          {levelLabel(lesson.level)}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{categoryLabel(lesson.category)}</span>
                        {lesson.pdf_path ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                            PDF {lesson.pdf_page_count ? `${lesson.pdf_page_count}쪽` : ''}
                          </span>
                        ) : (
                          <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">PDF 없음</span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-semibold text-gray-900">{lesson.title}</p>
                      <p className="text-xs text-gray-500">
                        조회 {lesson.view_count.toLocaleString()} · 받은 회원 {lesson.download_count.toLocaleString()}
                        {stat ? ` · 30일 ${stat.recent_downloads} · 가입 ${stat.new_members} · 구매 ${stat.buyers}` : ''}
                        {lesson.view_count > 0 && lesson.download_count > 0
                          ? ` · 전환율 ${Math.round((lesson.download_count / lesson.view_count) * 100)}%`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateFlag(lesson, { is_published: !lesson.is_published })}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        lesson.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                      }`}
                      title="클릭하면 공개/비공개 전환"
                    >
                      {lesson.is_published ? '공개 중' : '비공개'}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateFlag(lesson, { is_featured: !lesson.is_featured })}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        lesson.is_featured ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                      }`}
                      title="추천 레슨은 목록 맨 위에 크게 노출됩니다"
                    >
                      <i className={lesson.is_featured ? 'ri-star-fill' : 'ri-star-line'} /> 추천
                    </button>
                    <a
                      href={`/ko/free-lessons/${encodeURIComponent(lesson.slug)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      보기
                    </a>
                    <button
                      type="button"
                      onClick={() => openEdit(lesson)}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteLesson(lesson)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {formOpen && (
        <LessonFormModal
          lesson={editing}
          existingSlugs={lessons.filter((item) => item.id !== editing?.id).map((item) => item.slug)}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void loadLessons();
          }}
        />
      )}
    </div>
  );
}

interface LessonFormModalProps {
  lesson: FreeLessonRow | null;
  existingSlugs: string[];
  onClose: () => void;
  onSaved: () => void;
}

function LessonFormModal({ lesson, existingSlugs, onClose, onSaved }: LessonFormModalProps) {
  const isEdit = Boolean(lesson);
  const [form, setForm] = useState<LessonForm>(() => (lesson ? rowToForm(lesson) : emptyForm()));
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [showEnglish, setShowEnglish] = useState(Boolean(lesson?.title_en || lesson?.summary_en || lesson?.description_en));
  const [fetchingTitle, setFetchingTitle] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [saving, setSaving] = useState(false);
  const [relatedSheets, setRelatedSheets] = useState<RelatedSheetOption[]>([]);
  const [sheetQuery, setSheetQuery] = useState('');
  const [sheetResults, setSheetResults] = useState<RelatedSheetOption[]>([]);
  const lastFetchedVideoRef = useRef<string | null>(lesson?.youtube_video_id ?? null);
  const uploadedPdfPathRef = useRef<string | null>(null);

  const videoId = extractYoutubeVideoId(form.youtube_url);
  const set = <K extends keyof LessonForm>(key: K, value: LessonForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (slugTouched) return;
    const base = slugify(form.title_en || form.title);
    setForm((prev) => ({ ...prev, slug: base }));
  }, [form.title, form.title_en, slugTouched]);

  useEffect(() => {
    const ids = lesson?.related_sheet_ids ?? [];
    if (ids.length === 0) return;
    supabase
      .from('drum_sheets')
      .select('id, title, artist, thumbnail_url')
      .in('id', ids)
      .then(({ data }) => {
        const rows = (data ?? []) as RelatedSheetOption[];
        setRelatedSheets(ids.map((id) => rows.find((row) => row.id === id)).filter((row): row is RelatedSheetOption => Boolean(row)));
      });
  }, [lesson]);

  useEffect(() => {
    const term = sheetQuery.trim();
    if (term.length < 2) {
      setSheetResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const escaped = term.replace(/[%,()]/g, ' ');
      const { data } = await supabase
        .from('drum_sheets')
        .select('id, title, artist, thumbnail_url')
        .eq('is_active', true)
        .or(`title.ilike.%${escaped}%,artist.ilike.%${escaped}%`)
        .limit(10);
      setSheetResults((data ?? []) as RelatedSheetOption[]);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [sheetQuery]);

  const fetchYoutubeTitle = useCallback(async (url: string, force = false) => {
    const id = extractYoutubeVideoId(url);
    if (!id) return;
    if (!force && lastFetchedVideoRef.current === id) return;
    lastFetchedVideoRef.current = id;
    setFetchingTitle(true);
    try {
      const response = await fetch(`/api/admin/youtube-info?url=${encodeURIComponent(url)}`);
      const data = await response.json().catch(() => null);
      if (data?.title) {
        setForm((prev) => ({ ...prev, title: force || !prev.title.trim() ? data.title : prev.title }));
      }
    } finally {
      setFetchingTitle(false);
    }
  }, []);

  const handleYoutubeChange = (url: string) => {
    set('youtube_url', url);
    if (extractYoutubeVideoId(url)) void fetchYoutubeTitle(url);
  };

  const handlePdfUpload = async (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('PDF 파일만 올릴 수 있습니다.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert('PDF는 50MB 이하만 올릴 수 있습니다.');
      return;
    }
    setUploadingPdf(true);
    try {
      const buffer = await file.arrayBuffer();
      const path = `lessons/${randomKey()}.pdf`;
      const { error } = await supabase.storage
        .from(FREE_LESSON_PDF_BUCKET)
        .upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (error) throw error;
      if (uploadedPdfPathRef.current) {
        await supabase.storage.from(FREE_LESSON_PDF_BUCKET).remove([uploadedPdfPathRef.current]);
      }
      uploadedPdfPathRef.current = path;

      let pageCount = 0;
      let previewUrl = '';
      try {
        const preview = await createPdfPreview(buffer);
        pageCount = preview.pageCount;
        previewUrl = preview.previewUrl;
      } catch (previewError) {
        console.warn('PDF 분석 실패:', previewError);
      }

      const baseName = file.name.replace(/\.pdf$/i, '');
      setForm((prev) => ({
        ...prev,
        pdf_path: path,
        pdf_size_bytes: file.size,
        pdf_page_count: pageCount,
        pdf_preview_url: previewUrl,
        pdf_file_name: prev.pdf_file_name || `COPYDRUM - ${prev.title || baseName}`,
      }));
    } catch (error) {
      alert(`PDF 업로드 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleThumbUpload = async (file: File) => {
    setUploadingThumb(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const url = await uploadPublicAsset(file, 'thumbnails', ext, file.type || 'image/jpeg');
      set('thumbnail_url', url);
    } catch (error) {
      alert(`썸네일 업로드 실패: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUploadingThumb(false);
    }
  };

  const handleEditorImageUpload = async (file: File) => {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    return uploadPublicAsset(file, 'images', ext, file.type || 'image/jpeg');
  };

  const addRelatedSheet = (sheet: RelatedSheetOption) => {
    if (form.related_sheet_ids.includes(sheet.id)) return;
    if (form.related_sheet_ids.length >= MAX_RELATED_SHEETS) {
      alert(`관련 악보는 최대 ${MAX_RELATED_SHEETS}개까지 연결할 수 있습니다.`);
      return;
    }
    set('related_sheet_ids', [...form.related_sheet_ids, sheet.id]);
    setRelatedSheets((prev) => [...prev, sheet]);
    setSheetQuery('');
    setSheetResults([]);
  };

  const removeRelatedSheet = (id: string) => {
    set('related_sheet_ids', form.related_sheet_ids.filter((item) => item !== id));
    setRelatedSheets((prev) => prev.filter((item) => item.id !== id));
  };

  const uniqueSlug = (base: string) => {
    const taken = new Set(existingSlugs);
    const fallback = base || `lesson-${videoId ?? randomKey()}`;
    if (!taken.has(fallback)) return fallback;
    let index = 2;
    while (taken.has(`${fallback}-${index}`)) index += 1;
    return `${fallback}-${index}`;
  };

  const handleSave = async () => {
    if (!videoId) {
      alert('유튜브 링크를 확인해주세요.');
      return;
    }
    if (!form.title.trim()) {
      alert('레슨 제목을 입력해주세요.');
      return;
    }
    if (form.is_published && !form.pdf_path && !confirm('PDF 없이 공개하면 고객에게 "PDF 준비 중"으로 보입니다. 계속할까요?')) {
      return;
    }

    setSaving(true);
    const slug = uniqueSlug(slugify(form.slug || form.title_en || form.title));
    const payload = {
      slug,
      title: form.title.trim(),
      title_en: form.title_en.trim() || null,
      summary: form.summary.trim() || null,
      summary_en: form.summary_en.trim() || null,
      description: form.description.trim() && form.description !== '<p></p>' ? form.description : null,
      description_en: form.description_en.trim() && form.description_en !== '<p></p>' ? form.description_en : null,
      youtube_url: form.youtube_url.trim(),
      youtube_video_id: videoId,
      thumbnail_url: form.thumbnail_url.trim() || null,
      category: form.category,
      level: form.level,
      bpm: form.bpm.trim() || null,
      pdf_path: form.pdf_path || null,
      pdf_file_name: form.pdf_file_name.trim() || null,
      pdf_page_count: form.pdf_page_count || null,
      pdf_size_bytes: form.pdf_size_bytes || null,
      pdf_preview_url: form.pdf_preview_url || null,
      related_sheet_ids: form.related_sheet_ids,
      is_published: form.is_published,
      is_featured: form.is_featured,
      sort_order: Number(form.sort_order) || 0,
    };

    const { error } = lesson
      ? await supabase.from('free_lessons').update(payload).eq('id', lesson.id)
      : await supabase.from('free_lessons').insert(payload);

    setSaving(false);
    if (error) {
      alert(error.code === '23505' ? '같은 주소(slug)를 쓰는 레슨이 있습니다. 주소를 바꿔주세요.' : `저장 실패: ${error.message}`);
      return;
    }

    if (lesson?.pdf_path && lesson.pdf_path !== form.pdf_path) {
      await supabase.storage.from(FREE_LESSON_PDF_BUCKET).remove([lesson.pdf_path]);
    }
    uploadedPdfPathRef.current = null;
    onSaved();
  };

  const handleClose = async () => {
    if (uploadedPdfPathRef.current) {
      await supabase.storage.from(FREE_LESSON_PDF_BUCKET).remove([uploadedPdfPathRef.current]);
    }
    onClose();
  };

  const labelClass = 'mb-1 block text-sm font-semibold text-gray-800';
  const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500';
  const thumbnail = form.thumbnail_url || (videoId ? youtubeThumbnailUrl(videoId) : '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-6">
      <div className="flex h-full w-full max-w-4xl flex-col bg-white shadow-xl sm:h-auto sm:max-h-full sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-lg font-bold text-gray-900">{isEdit ? '무료 레슨 수정' : '새 무료 레슨 등록'}</h3>
          <button type="button" onClick={handleClose} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" aria-label="닫기">
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600">1. 유튜브 영상</h4>
            <div>
              <label className={labelClass}>
                유튜브 링크 <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  value={form.youtube_url}
                  onChange={(event) => handleYoutubeChange(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => fetchYoutubeTitle(form.youtube_url, true)}
                  disabled={!videoId || fetchingTitle}
                  className="flex-shrink-0 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {fetchingTitle ? '불러오는 중...' : '영상 제목 가져오기'}
                </button>
              </div>
              {form.youtube_url && !videoId && <p className="mt-1 text-xs text-red-500">유튜브 링크 형식이 아닙니다.</p>}
            </div>
            {videoId && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="aspect-video overflow-hidden rounded-lg bg-black">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                    title="미리보기"
                    className="h-full w-full"
                    allowFullScreen
                  />
                </div>
                <div>
                  <p className={labelClass}>썸네일</p>
                  {thumbnail && <img src={thumbnail} alt="" className="aspect-video w-full rounded-lg object-cover" />}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      {uploadingThumb ? '업로드 중...' : '직접 올리기'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleThumbUpload(file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    {form.thumbnail_url && (
                      <button
                        type="button"
                        onClick={() => set('thumbnail_url', '')}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        유튜브 썸네일 사용
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">비워 두면 유튜브 썸네일을 자동으로 씁니다.</p>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600">2. 레슨 정보</h4>
            <div>
              <label className={labelClass}>
                레슨 제목 <span className="text-red-500">*</span>
              </label>
              <input value={form.title} onChange={(event) => set('title', event.target.value)} className={inputClass} placeholder="예) 8비트 기본 리듬 완벽 정리" />
            </div>
            <div>
              <label className={labelClass}>한 줄 소개</label>
              <input
                value={form.summary}
                onChange={(event) => set('summary', event.target.value)}
                className={inputClass}
                maxLength={160}
                placeholder="카드와 검색 결과에 보이는 짧은 설명 (160자 이내)"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>주제</label>
                <select value={form.category} onChange={(event) => set('category', event.target.value)} className={inputClass}>
                  {FREE_LESSON_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.labelKo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>난이도</label>
                <select value={form.level} onChange={(event) => set('level', event.target.value)} className={inputClass}>
                  {FREE_LESSON_LEVELS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.labelKo}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>연습 템포 (BPM)</label>
                <input value={form.bpm} onChange={(event) => set('bpm', event.target.value)} className={inputClass} placeholder="예) 60-100" />
              </div>
            </div>
            <div>
              <label className={labelClass}>
                레슨 소개 <span className="text-xs font-normal text-gray-500">굵게·제목·목록·이미지 삽입 가능</span>
              </label>
              <RichTextEditor
                value={form.description}
                onChange={(html) => set('description', html)}
                onImageUpload={handleEditorImageUpload}
                placeholder="이 레슨에서 배우는 내용, 연습 포인트, 주의할 점 등을 적어주세요."
                minHeight={180}
              />
            </div>

            <button
              type="button"
              onClick={() => setShowEnglish((prev) => !prev)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              <i className={showEnglish ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} /> 영문 정보 {showEnglish ? '접기' : '입력 (해외 사이트용, 선택)'}
            </button>
            {showEnglish && (
              <div className="space-y-3 rounded-lg bg-gray-50 p-4">
                <div>
                  <label className={labelClass}>영문 제목</label>
                  <input value={form.title_en} onChange={(event) => set('title_en', event.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>영문 한 줄 소개</label>
                  <input value={form.summary_en} onChange={(event) => set('summary_en', event.target.value)} className={inputClass} maxLength={160} />
                </div>
                <div>
                  <label className={labelClass}>영문 레슨 소개</label>
                  <RichTextEditor
                    value={form.description_en}
                    onChange={(html) => set('description_en', html)}
                    onImageUpload={handleEditorImageUpload}
                    minHeight={140}
                  />
                </div>
                <p className="text-[11px] text-gray-500">비워 두면 해외 사이트에도 한국어 내용이 그대로 보입니다.</p>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600">3. 연습용 PDF (회원만 다운로드)</h4>
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-4">
              {form.pdf_path ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {form.pdf_preview_url ? (
                    <img src={form.pdf_preview_url} alt="" className="h-28 w-20 rounded border border-gray-200 object-cover object-top" />
                  ) : (
                    <span className="flex h-28 w-20 items-center justify-center rounded bg-red-50 text-red-500">
                      <i className="ri-file-pdf-2-line text-3xl" />
                    </span>
                  )}
                  <div className="flex-1 text-sm text-gray-700">
                    <p className="font-semibold text-emerald-700">
                      <i className="ri-checkbox-circle-fill" /> PDF 업로드 완료
                    </p>
                    <p className="text-xs text-gray-500">
                      {form.pdf_page_count ? `${form.pdf_page_count}쪽` : ''} {formatBytes(form.pdf_size_bytes)}
                    </p>
                    <label className="mt-2 inline-block cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">
                      {uploadingPdf ? '업로드 중...' : '다른 PDF로 교체'}
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        disabled={uploadingPdf}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handlePdfUpload(file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-2 py-4 text-center text-sm text-gray-600">
                  <i className={`${uploadingPdf ? 'ri-loader-4-line animate-spin' : 'ri-upload-cloud-2-line'} text-3xl text-gray-400`} />
                  {uploadingPdf ? 'PDF 업로드 및 미리보기 만드는 중...' : '클릭해서 PDF 올리기 (50MB 이하)'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    disabled={uploadingPdf}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handlePdfUpload(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            <div>
              <label className={labelClass}>다운로드 파일명</label>
              <input
                value={form.pdf_file_name}
                onChange={(event) => set('pdf_file_name', event.target.value)}
                className={inputClass}
                placeholder="COPYDRUM - 8비트 기본 리듬"
              />
              <p className="mt-1 text-[11px] text-gray-400">고객이 받는 파일 이름입니다. .pdf는 자동으로 붙습니다.</p>
            </div>
            <p className="text-[11px] text-gray-500">
              PDF는 비공개 저장소에 보관되고, 로그인한 회원이 다운로드할 때만 1분짜리 임시 링크가 만들어집니다. 첫 페이지는 상세 페이지 미리보기로 쓰입니다.
            </p>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600">4. 함께 연습하기 좋은 악보 (선택)</h4>
            <p className="text-xs text-gray-500">레슨 상세 페이지 아래에 노출됩니다. 레슨에서 배운 패턴이 나오는 곡을 연결하면 악보 구매로 이어지기 좋습니다.</p>
            {relatedSheets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {relatedSheets.map((sheet) => (
                  <span key={sheet.id} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 py-1 pl-1 pr-2 text-xs text-blue-800">
                    {sheet.thumbnail_url && <img src={sheet.thumbnail_url} alt="" className="h-5 w-5 rounded-full object-cover" />}
                    {sheet.title} - {sheet.artist}
                    <button type="button" onClick={() => removeRelatedSheet(sheet.id)} className="text-blue-500 hover:text-blue-800" aria-label="빼기">
                      <i className="ri-close-line" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <input
                value={sheetQuery}
                onChange={(event) => setSheetQuery(event.target.value)}
                className={inputClass}
                placeholder="곡 제목 또는 아티스트로 검색 (2글자 이상)"
              />
              {sheetResults.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {sheetResults.map((sheet) => (
                    <li key={sheet.id}>
                      <button
                        type="button"
                        onClick={() => addRelatedSheet(sheet)}
                        disabled={form.related_sheet_ids.includes(sheet.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-40"
                      >
                        {sheet.thumbnail_url ? (
                          <img src={sheet.thumbnail_url} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <span className="h-8 w-8 rounded bg-gray-100" />
                        )}
                        <span className="truncate">
                          {sheet.title} <span className="text-gray-500">- {sheet.artist}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600">5. 노출 설정</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>페이지 주소</label>
                <div className="flex items-center rounded-lg border border-gray-300 text-sm focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="whitespace-nowrap pl-3 text-gray-400">/free-lessons/</span>
                  <input
                    value={form.slug}
                    onChange={(event) => {
                      setSlugTouched(true);
                      set('slug', event.target.value);
                    }}
                    className="w-full rounded-r-lg px-1 py-2 outline-none"
                  />
                </div>
                {isEdit && <p className="mt-1 text-[11px] text-amber-600">공개된 레슨의 주소를 바꾸면 기존 링크가 끊깁니다.</p>}
              </div>
              <div>
                <label className={labelClass}>정렬 우선순위</label>
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => set('sort_order', Number(event.target.value))}
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-gray-400">숫자가 클수록 앞에 보입니다. 같으면 최신순.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                <input type="checkbox" checked={form.is_published} onChange={(event) => set('is_published', event.target.checked)} className="h-4 w-4" />
                고객에게 공개
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-800">
                <input type="checkbox" checked={form.is_featured} onChange={(event) => set('is_featured', event.target.checked)} className="h-4 w-4" />
                추천 레슨 (목록 맨 위 노출)
              </label>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button type="button" onClick={handleClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploadingPdf || uploadingThumb}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? '저장 중...' : isEdit ? '수정 저장' : '레슨 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
