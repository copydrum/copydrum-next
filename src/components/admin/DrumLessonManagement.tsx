import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { pdfjsLib } from '../../lib/pdfClient';
import RichTextEditor from './RichTextEditor';

// 레슨 유형(서브카테고리) — 글로벌 /free-sheets 유형 필터 탭과 1:1 매칭
const LESSON_TYPE_OPTIONS = ['루디먼트', '필인', '리듬패턴', '드럼테크닉', '기초/입문'];

// ─── Types ───────────────────────────────────────────
interface LessonBookSheet {
  id: string;
  title: string;
  artist: string;
  difficulty: string;
  price: number;
  category_id: string;
  thumbnail_url?: string | null;
  youtube_url?: string | null;
  pdf_url: string;
  preview_image_url?: string | null;
  page_count?: number | null;
  tempo?: number | null;
  table_of_contents?: string | null;
  title_translations?: Record<string, string> | null;
  table_of_contents_translations?: Record<string, string> | null;
  /** 악보 미리보기용 PDF 페이지 (1부터). null이면 1페이지와 동일 */
  preview_pdf_page?: number | null;
  is_active: boolean;
  created_at: string;
  /** 레슨 유형(서브카테고리) 이름. junction에서 파생 */
  lesson_type?: string;
}

interface BookFormData {
  title_ko: string;
  title_en: string;
  artist: string;            // 저자/편저자 (재활용)
  difficulty: string;        // 대상 수준 (재활용)
  price: number;             // 가격 (필수)
  youtube_url: string;       // 샘플 영상 (선택)
  thumbnail_url: string;     // 책표지 (썸네일)
  pdf_url: string;
  preview_image_url: string;
  page_count: number;
  tempo: number;
  detail_page_ko: string;   // 상세(한국어) → table_of_contents
  detail_page_en: string;   // 상세(영문) → table_of_contents_translations.en
  /** PDF에서 모자이크 미리보기로 쓸 페이지 번호 (1 = 첫 페이지) */
  preview_pdf_page: number;
  lesson_type: string;      // 레슨 유형(서브카테고리). '' = 선택 안 함
  pdf_file: File | null;
}

const createEmptyForm = (): BookFormData => ({
  title_ko: '',
  title_en: '',
  artist: '',
  difficulty: '초급',
  price: 0,
  youtube_url: '',
  thumbnail_url: '',
  pdf_url: '',
  preview_image_url: '',
  page_count: 0,
  tempo: 0,
  detail_page_ko: '',
  detail_page_en: '',
  preview_pdf_page: 1,
  lesson_type: '',
  pdf_file: null,
});

// ─── Helpers ─────────────────────────────────────────
const extractVideoId = (url: string): string | null => {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
};

const applyMosaicToImageData = (imageData: ImageData, blockSize = 15): ImageData => {
  const { data, width, height } = imageData;
  const startY = Math.floor(height * 0.4);
  for (let y = startY; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      let r = 0, g = 0, b = 0, cnt = 0;
      for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
        for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
          const idx = ((y + dy) * width + (x + dx)) * 4;
          r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; cnt++;
        }
      }
      if (cnt > 0) {
        r = Math.floor(r / cnt); g = Math.floor(g / cnt); b = Math.floor(b / cnt);
        for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
          for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            data[idx] = r; data[idx + 1] = g; data[idx + 2] = b;
          }
        }
      }
    }
  }
  return imageData;
};

/** PDF 버퍼에서 지정 페이지(1-based)를 렌더해 모자이크 JPEG를 스토리지에 올리고 public URL 반환 */
async function uploadMosaicPreviewFromPdfPage(
  pdfArrayBuffer: ArrayBuffer,
  page1Based: number,
): Promise<{ previewImageUrl: string; pageUsed: number }> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfArrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pageIdx = Math.min(Math.max(1, page1Based || 1), numPages);
  const page = await pdf.getPage(pageIdx);
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { previewImageUrl: '', pageUsed: pageIdx };
  }
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mosaicData = applyMosaicToImageData(imageData, 15);
  ctx.putImageData(mosaicData, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('blob fail'))),
      'image/jpeg',
      0.85,
    );
  });
  const imgFileName = `preview_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
  const imgPath = `previews/${imgFileName}`;
  const { error: imgErr } = await supabase.storage
    .from('drum-sheets')
    .upload(imgPath, blob, { contentType: 'image/jpeg', upsert: true });
  if (imgErr) {
    console.warn('미리보기 스토리지 업로드 실패:', imgErr);
    return { previewImageUrl: '', pageUsed: pageIdx };
  }
  const { data: imgUrlData } = supabase.storage.from('drum-sheets').getPublicUrl(imgPath);
  return { previewImageUrl: imgUrlData.publicUrl, pageUsed: pageIdx };
}

// ─── Component ───────────────────────────────────────
export default function DrumLessonManagement() {
  const [lessonCategoryId, setLessonCategoryId] = useState<string | null>(null);
  const [typeCategoryMap, setTypeCategoryMap] = useState<Record<string, string>>({});
  const [books, setBooks] = useState<LessonBookSheet[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddBook, setShowAddBook] = useState(false);
  const [form, setForm] = useState<BookFormData>(createEmptyForm());
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  const [editingBook, setEditingBook] = useState<LessonBookSheet | null>(null);
  const [editForm, setEditForm] = useState<BookFormData>(createEmptyForm());

  // ── Data Loading ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. 드럼레슨(=교재) 카테고리 찾기
      const { data: lessonCat } = await supabase
        .from('categories')
        .select('id')
        .eq('name', '드럼레슨')
        .maybeSingle();

      let catId = lessonCat?.id as string | undefined;
      if (!catId) {
        const { data: created } = await supabase
          .from('categories')
          .insert({ name: '드럼레슨', description: '드럼레슨 교재(유료 PDF 드럼북) 카테고리' })
          .select('id')
          .single();
        catId = created?.id;
      }
      if (catId) setLessonCategoryId(catId);

      if (!catId) {
        setBooks([]);
        return;
      }

      // 1-b. 레슨 유형(서브카테고리) 카테고리 ID 맵 로드
      const { data: typeCats } = await supabase
        .from('categories')
        .select('id, name')
        .in('name', LESSON_TYPE_OPTIONS);
      const typeMap: Record<string, string> = {};
      (typeCats || []).forEach((c: any) => {
        if (c?.name && c?.id) typeMap[c.name] = c.id;
      });
      setTypeCategoryMap(typeMap);

      // 2. 드럼레슨 카테고리에 속한 교재 로드
      const { data: list, error } = await supabase
        .from('drum_sheets')
        .select('*')
        .eq('category_id', catId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 2-b. 각 교재의 유형(junction) 파생
      const bookIds = (list || []).map((b: any) => b.id);
      const typeBySheet: Record<string, string> = {};
      if (bookIds.length > 0) {
        const { data: jrows } = await supabase
          .from('drum_sheet_categories')
          .select('sheet_id, categories ( name )')
          .in('sheet_id', bookIds);
        (jrows || []).forEach((r: any) => {
          const nm = r?.categories?.name;
          if (nm && LESSON_TYPE_OPTIONS.includes(nm)) typeBySheet[r.sheet_id] = nm;
        });
      }
      const withType = (list || []).map((b: any) => ({ ...b, lesson_type: typeBySheet[b.id] || '' }));
      setBooks(withType as LessonBookSheet[]);
    } catch (error) {
      console.error('드럼레슨 교재 데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── 레슨 유형 카테고리 ID 보장 (없으면 생성) ──
  const ensureTypeCategoryId = async (name: string): Promise<string | null> => {
    if (!name) return null;
    if (typeCategoryMap[name]) return typeCategoryMap[name];
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('name', name)
      .maybeSingle();
    if (existing?.id) {
      setTypeCategoryMap((prev) => ({ ...prev, [name]: existing.id }));
      return existing.id;
    }
    const { data: created } = await supabase
      .from('categories')
      .insert({ name, description: `${name} 레슨 유형` })
      .select('id')
      .single();
    if (created?.id) {
      setTypeCategoryMap((prev) => ({ ...prev, [name]: created.id }));
      return created.id;
    }
    return null;
  };

  // ── YouTube Thumbnail ──
  const fetchYoutubeThumbnail = (url: string, setter: (url: string) => void) => {
    const videoId = extractVideoId(url);
    if (!videoId) return;
    const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    setter(maxResUrl);
  };

  // ── PDF Upload (PDF + page count + mosaic preview image, 페이지 지정 가능) ──
  const handlePdfUpload = async (
    file: File,
    setter: (updates: Partial<BookFormData>) => void,
    previewPage1Based: number,
  ) => {
    setIsUploadingPdf(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      let pageCount = 0;
      try {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        pageCount = pdf.numPages;
      } catch (e) {
        console.error('PDF 페이지수 추출 오류:', e);
      }

      const fileExt = file.name.split('.').pop() || 'pdf';
      const sanitized = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const safeName =
        sanitized.length > 2
          ? sanitized
          : `lesson_book_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
      const fileName = `${Date.now()}_${safeName}`;
      const filePath = `pdfs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('drum-sheets')
        .upload(filePath, file, { contentType: 'application/pdf', upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('drum-sheets').getPublicUrl(filePath);
      const pdfUrl = urlData.publicUrl;

      let previewImageUrl = '';
      let pageUsedForPreview = Math.max(1, previewPage1Based || 1);
      try {
        if (pageCount > 0) {
          pageUsedForPreview = Math.min(Math.max(1, previewPage1Based || 1), pageCount);
          const { previewImageUrl: url } = await uploadMosaicPreviewFromPdfPage(
            arrayBuffer,
            pageUsedForPreview,
          );
          previewImageUrl = url;
        }
      } catch (e) {
        console.warn('미리보기 생성 실패:', e);
      }

      setter({
        pdf_url: pdfUrl,
        page_count: pageCount,
        preview_image_url: previewImageUrl,
        preview_pdf_page: pageUsedForPreview,
      });
      alert(
        `PDF 업로드 완료! 총 ${pageCount}페이지 · 미리보기는 ${pageUsedForPreview}페이지에서 생성했습니다.`,
      );
    } catch (error: any) {
      alert(`PDF 업로드 오류: ${error.message}`);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  /** 이미 업로드된 PDF URL에서 미리보기만 다시 생성 (페이지 번호 변경 후 사용) */
  const regenerateLessonPreviewFromPdf = async (
    pdfUrl: string,
    previewPage1Based: number,
    setter: (updates: Partial<BookFormData>) => void,
  ) => {
    if (!pdfUrl) {
      alert('PDF가 먼저 업로드되어 있어야 합니다.');
      return;
    }
    setIsUploadingPdf(true);
    try {
      const res = await fetch(pdfUrl, { mode: 'cors' });
      if (!res.ok) {
        throw new Error(`PDF 불러오기 실패 (${res.status})`);
      }
      const ab = await res.arrayBuffer();
      const { previewImageUrl, pageUsed } = await uploadMosaicPreviewFromPdfPage(
        ab,
        previewPage1Based,
      );
      if (!previewImageUrl) {
        throw new Error('미리보기 이미지 생성에 실패했습니다.');
      }
      setter({ preview_image_url: previewImageUrl, preview_pdf_page: pageUsed });
      alert(`미리보기를 ${pageUsed}페이지 기준으로 다시 생성했습니다.`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '미리보기 재생성 실패';
      alert(msg);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  // ── 책표지 이미지 직접 업로드 ──
  const handleLessonDetailImageUpload = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `lesson_detail_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `lesson-detail-images/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('drum-sheets')
      .upload(filePath, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from('drum-sheets').getPublicUrl(filePath);
    return urlData.publicUrl;
  };

  const handleCoverImageUpload = async (
    file: File,
    setter: (url: string) => void,
  ) => {
    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `cover_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `covers/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('drum-sheets')
        .upload(filePath, file, { contentType: file.type || 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('drum-sheets').getPublicUrl(filePath);
      setter(urlData.publicUrl);
    } catch (error: any) {
      alert(`표지 이미지 업로드 오류: ${error.message}`);
    }
  };

  // ── Add Book ──
  const handleAddBook = async () => {
    if (!form.title_ko.trim() || !form.artist.trim()) {
      alert('한글 제목과 저자/편저자는 필수입니다.');
      return;
    }
    if (!form.pdf_url) {
      alert('PDF 파일을 업로드해주세요.');
      return;
    }
    if (!form.thumbnail_url) {
      alert('교재 표지 이미지(썸네일)를 등록해주세요.');
      return;
    }
    if (!lessonCategoryId) {
      alert('드럼레슨 카테고리가 없습니다. 페이지를 새로고침해주세요.');
      return;
    }
    if (form.price < 0) {
      alert('가격은 0원 이상이어야 합니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const difficultyMap: Record<string, string> = {
        beginner: '초급', intermediate: '중급', advanced: '고급',
        '초급': '초급', '중급': '중급', '고급': '고급',
      };
      const difficulty = difficultyMap[form.difficulty.toLowerCase()] || '초급';

      const insertData: any = {
        title: form.title_ko.trim(),
        artist: form.artist.trim(),
        difficulty,
        price: Math.max(0, Math.floor(form.price)),
        category_id: lessonCategoryId,
        pdf_url: form.pdf_url,
        thumbnail_url: form.thumbnail_url,
        is_active: true,
      };
      if (form.youtube_url) insertData.youtube_url = form.youtube_url;
      if (form.page_count > 0) insertData.page_count = form.page_count;
      if (form.tempo > 0) insertData.tempo = form.tempo;
      if (form.preview_image_url) insertData.preview_image_url = form.preview_image_url;
      const previewPage = Math.max(1, Math.floor(form.preview_pdf_page) || 1);
      insertData.preview_pdf_page = previewPage;
      if (form.detail_page_ko.trim()) insertData.table_of_contents = form.detail_page_ko.trim();
      if (form.title_en.trim()) insertData.title_translations = { en: form.title_en.trim() };
      if (form.detail_page_en.trim()) {
        insertData.table_of_contents_translations = { en: form.detail_page_en.trim() };
      }

      // ─── slug 자동 생성 ───
      const slugRaw = `${insertData.artist}-${insertData.title}`;
      let baseSlug = slugRaw
        .toLowerCase()
        .trim()
        .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (!baseSlug) baseSlug = `lesson-book-${Date.now()}`;

      let slug = baseSlug;
      let slugSuffix = 0;
      while (true) {
        const { data: existingSlug } = await supabase
          .from('drum_sheets')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (!existingSlug) break;
        slugSuffix++;
        slug = `${baseSlug}-${slugSuffix}`;
      }
      insertData.slug = slug;

      const { data: inserted, error: insertError } = await supabase
        .from('drum_sheets')
        .insert(insertData)
        .select('id')
        .single();

      if (insertError) throw insertError;

      // 레슨 유형(서브카테고리) junction 연결
      if (form.lesson_type && inserted?.id) {
        const typeCatId = await ensureTypeCategoryId(form.lesson_type);
        if (typeCatId) {
          await supabase
            .from('drum_sheet_categories')
            .insert({ sheet_id: inserted.id, category_id: typeCatId });
        }
      }

      alert('드럼레슨 교재가 등록되었습니다!');
      setShowAddBook(false);
      setForm(createEmptyForm());
      loadData();
    } catch (error: any) {
      alert(`등록 오류: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Edit Book ──
  const handleOpenEdit = (book: LessonBookSheet) => {
    setEditingBook(book);
    const titleEn = book.title_translations?.en ?? '';
    const detailEn = book.table_of_contents_translations?.en ?? '';
    setEditForm({
      title_ko: book.title,
      title_en: titleEn,
      artist: book.artist,
      difficulty: book.difficulty,
      price: book.price ?? 0,
      youtube_url: book.youtube_url || '',
      thumbnail_url: book.thumbnail_url || '',
      pdf_url: book.pdf_url,
      preview_image_url: book.preview_image_url || '',
      page_count: book.page_count || 0,
      tempo: book.tempo || 0,
      detail_page_ko: book.table_of_contents || '',
      detail_page_en: detailEn,
      pdf_file: null,
      preview_pdf_page: book.preview_pdf_page != null && book.preview_pdf_page > 0 ? book.preview_pdf_page : 1,
      lesson_type: book.lesson_type || '',
    });
  };

  const handleUpdateBook = async () => {
    if (!editingBook) return;
    if (!editForm.title_ko.trim() || !editForm.artist.trim()) {
      alert('한글 제목과 저자/편저자는 필수입니다.');
      return;
    }
    if (editForm.price < 0) {
      alert('가격은 0원 이상이어야 합니다.');
      return;
    }
    setIsSubmitting(true);
    try {
      const difficultyMap: Record<string, string> = {
        beginner: '초급', intermediate: '중급', advanced: '고급',
        '초급': '초급', '중급': '중급', '고급': '고급',
      };
      const difficulty = difficultyMap[editForm.difficulty.toLowerCase()] || '초급';

      const updateData: any = {
        title: editForm.title_ko.trim(),
        artist: editForm.artist.trim(),
        difficulty,
        price: Math.max(0, Math.floor(editForm.price)),
        thumbnail_url: editForm.thumbnail_url || null,
        youtube_url: editForm.youtube_url || null,
        page_count: editForm.page_count > 0 ? editForm.page_count : null,
        tempo: editForm.tempo > 0 ? editForm.tempo : null,
        table_of_contents: editForm.detail_page_ko.trim() || null,
        title_translations: editForm.title_en.trim() ? { en: editForm.title_en.trim() } : null,
        table_of_contents_translations: editForm.detail_page_en.trim()
          ? { en: editForm.detail_page_en.trim() }
          : null,
        preview_pdf_page: Math.max(1, Math.floor(editForm.preview_pdf_page) || 1),
        preview_image_url: editForm.preview_image_url || null,
      };

      const { error: updateError } = await supabase
        .from('drum_sheets')
        .update(updateData)
        .eq('id', editingBook.id);
      if (updateError) throw updateError;

      // 레슨 유형(서브카테고리) junction 재설정: 기존 유형 링크 제거 후 재삽입
      const typeIds = Object.values(typeCategoryMap);
      if (typeIds.length > 0) {
        await supabase
          .from('drum_sheet_categories')
          .delete()
          .eq('sheet_id', editingBook.id)
          .in('category_id', typeIds);
      }
      if (editForm.lesson_type) {
        const typeCatId = await ensureTypeCategoryId(editForm.lesson_type);
        if (typeCatId) {
          await supabase
            .from('drum_sheet_categories')
            .insert({ sheet_id: editingBook.id, category_id: typeCatId });
        }
      }

      alert('수정 완료!');
      setEditingBook(null);
      loadData();
    } catch (error: any) {
      alert(`수정 오류: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delete Book ──
  const handleDeleteBook = async (bookId: string) => {
    if (!confirm('이 드럼레슨 교재를 삭제하시겠습니까?')) return;
    try {
      // 다중 카테고리 연결이 남아있을 수 있으니 함께 정리
      await supabase.from('drum_sheet_categories').delete().eq('sheet_id', bookId);
      const { error } = await supabase.from('drum_sheets').delete().eq('id', bookId);
      if (error) throw error;
      alert('삭제되었습니다.');
      loadData();
    } catch (error: any) {
      alert(`삭제 오류: ${error.message}`);
    }
  };

  // ── Toggle Active ──
  const handleToggleActive = async (bookId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('drum_sheets')
        .update({ is_active: !currentActive })
        .eq('id', bookId);
      if (error) throw error;
      loadData();
    } catch (error: any) {
      alert(`상태 변경 오류: ${error.message}`);
    }
  };

  // ── Filtered Books ──
  const filteredBooks = books.filter((b) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const enTitle = (b.title_translations?.en || '').toLowerCase();
    return (
      b.title.toLowerCase().includes(term) ||
      enTitle.includes(term) ||
      (b.artist || '').toLowerCase().includes(term)
    );
  });

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-orange-600">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
          <span>드럼레슨 교재 데이터를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ===== Header ===== */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">📘 드럼레슨 교재 관리</h2>
          <p className="text-sm text-gray-500 mt-1">
            유료 PDF 드럼레슨 교재를 등록·관리합니다. (가격, 목차 입력 가능)
          </p>
        </div>
        <button
          onClick={() => {
            setForm(createEmptyForm());
            setShowAddBook(true);
          }}
          className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
        >
          <i className="ri-add-line"></i>
          <span>새 교재 등록</span>
        </button>
      </div>

      {/* ===== 교재 목록 ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              📚 교재 목록 ({filteredBooks.length}권)
            </h3>
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="검색 (제목, 저자)..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">표지</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">제목 / 저자</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">가격</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">대상 수준</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">페이지</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">샘플 영상</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">등록일</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredBooks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    {searchTerm ? '검색 결과가 없습니다.' : '등록된 교재가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredBooks.map((book) => {
                  const videoId = extractVideoId(book.youtube_url || '');
                  return (
                    <tr key={book.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        {book.thumbnail_url ? (
                          <img
                            src={book.thumbnail_url}
                            alt={book.title}
                            className="w-12 h-16 object-cover rounded border"
                          />
                        ) : (
                          <div className="w-12 h-16 bg-gray-100 rounded border flex items-center justify-center text-gray-400">
                            <i className="ri-book-2-line"></i>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{book.title}</div>
                        <div className="text-xs text-gray-500">{book.artist}</div>
                      </td>
                      <td className="px-6 py-4">
                        {book.price > 0 ? (
                          <span className="inline-flex items-center text-sm font-semibold text-gray-900">
                            {book.price.toLocaleString()}원
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                            무료
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            book.difficulty === '초급'
                              ? 'bg-green-100 text-green-700'
                              : book.difficulty === '중급'
                              ? 'bg-yellow-100 text-yellow-700'
                              : book.difficulty === '고급'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {book.difficulty}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {book.page_count ? `${book.page_count}p` : '-'}
                      </td>
                      <td className="px-6 py-4">
                        {videoId ? (
                          <a
                            href={book.youtube_url!}
                            target="_blank"
                            rel="noreferrer"
                            className="text-red-500 hover:text-red-700"
                          >
                            <i className="ri-youtube-fill text-lg"></i>
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">없음</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleActive(book.id, book.is_active)}
                          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer ${
                            book.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {book.is_active ? '활성' : '비활성'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(book.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenEdit(book)}
                            className="text-blue-600 hover:text-blue-800"
                            title="수정"
                          >
                            <i className="ri-edit-line"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteBook(book.id)}
                            className="text-red-600 hover:text-red-800"
                            title="삭제"
                          >
                            <i className="ri-delete-bin-line"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== 새 교재 등록 모달 ===== */}
      {showAddBook && (
        <BookFormModal
          mode="add"
          form={form}
          setForm={setForm}
          isUploadingPdf={isUploadingPdf}
          isSubmitting={isSubmitting}
          onClose={() => setShowAddBook(false)}
          onSubmit={handleAddBook}
          onPdfUpload={(file) =>
            handlePdfUpload(file, (updates) => setForm((prev) => ({ ...prev, ...updates })), form.preview_pdf_page)
          }
          onRegeneratePdfPreview={() =>
            regenerateLessonPreviewFromPdf(
              form.pdf_url,
              Math.max(1, form.preview_pdf_page || 1),
              (updates) => setForm((prev) => ({ ...prev, ...updates })),
            )
          }
          onCoverUpload={(file) =>
            handleCoverImageUpload(file, (url) => setForm((prev) => ({ ...prev, thumbnail_url: url })))
          }
          onLessonDetailImageUpload={handleLessonDetailImageUpload}
          onYoutubeAutoFillThumb={(url) =>
            fetchYoutubeThumbnail(url, (thumbUrl) =>
              setForm((prev) => ({ ...prev, thumbnail_url: prev.thumbnail_url || thumbUrl })),
            )
          }
        />
      )}

      {/* ===== 수정 모달 ===== */}
      {editingBook && (
        <BookFormModal
          mode="edit"
          form={editForm}
          setForm={setEditForm}
          isUploadingPdf={isUploadingPdf}
          isSubmitting={isSubmitting}
          onClose={() => setEditingBook(null)}
          onSubmit={handleUpdateBook}
          onPdfUpload={(file) =>
            handlePdfUpload(file, (updates) =>
              setEditForm((prev) => ({ ...prev, ...updates })),
              editForm.preview_pdf_page,
            )
          }
          onRegeneratePdfPreview={() =>
            regenerateLessonPreviewFromPdf(
              editForm.pdf_url,
              Math.max(1, editForm.preview_pdf_page || 1),
              (updates) => setEditForm((prev) => ({ ...prev, ...updates })),
            )
          }
          onCoverUpload={(file) =>
            handleCoverImageUpload(file, (url) =>
              setEditForm((prev) => ({ ...prev, thumbnail_url: url })),
            )
          }
          onLessonDetailImageUpload={handleLessonDetailImageUpload}
          onYoutubeAutoFillThumb={(url) =>
            fetchYoutubeThumbnail(url, (thumbUrl) =>
              setEditForm((prev) => ({ ...prev, thumbnail_url: prev.thumbnail_url || thumbUrl })),
            )
          }
        />
      )}
    </div>
  );
}

// ─── Book Form Modal (Add / Edit 공통) ───────────────
interface BookFormModalProps {
  mode: 'add' | 'edit';
  form: BookFormData;
  setForm: React.Dispatch<React.SetStateAction<BookFormData>>;
  isUploadingPdf: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
  onPdfUpload: (file: File) => void;
  /** PDF가 이미 있을 때, 입력한 페이지 번호로 모자이크 미리보기만 다시 생성 */
  onRegeneratePdfPreview: () => void | Promise<void>;
  onCoverUpload: (file: File) => void;
  onLessonDetailImageUpload: (file: File) => Promise<string>;
  onYoutubeAutoFillThumb: (url: string) => void;
}

function BookFormModal({
  mode,
  form,
  setForm,
  isUploadingPdf,
  isSubmitting,
  onClose,
  onSubmit,
  onPdfUpload,
  onRegeneratePdfPreview,
  onCoverUpload,
  onLessonDetailImageUpload,
  onYoutubeAutoFillThumb,
}: BookFormModalProps) {
  const isAdd = mode === 'add';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isAdd ? '📘 새 드럼레슨 교재 등록' : '교재 수정'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              한글 제목·상세는 한국어 사이트에서만, 영문은 그 외 언어에서 표시됩니다. (드럼모음집과 동일한 방식)
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            {/* 제목(한/영) & 저자 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">교재 제목 (한국어) *</label>
                <input
                  type="text"
                  value={form.title_ko}
                  onChange={(e) => setForm({ ...form, title_ko: e.target.value })}
                  placeholder="예: 실전에서 바로 써먹는 장르별 드럼 필인 100선"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  교재 제목 (영문){' '}
                  <span className="text-xs font-normal text-gray-500">한국어 제외 언어에 표시</span>
                </label>
                <input
                  type="text"
                  value={form.title_en}
                  onChange={(e) => setForm({ ...form, title_en: e.target.value })}
                  placeholder="e.g. 100 Genre Drum Fills for Real Gigs"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">저자 / 편저자 *</label>
                <input
                  type="text"
                  value={form.artist}
                  onChange={(e) => setForm({ ...form, artist: e.target.value })}
                  placeholder="예: COPYDRUM 편집부"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* 가격 & 대상 수준 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  판매 가격 (원) *
                </label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  placeholder="예: 19000"
                  min="0"
                  step="1000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  0으로 설정 시 무료 교재로 표시됩니다.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  대상 수준 (난이도)
                </label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                >
                  <option value="초급">초급</option>
                  <option value="중급">중급</option>
                  <option value="고급">고급</option>
                </select>
              </div>
            </div>

            {/* 레슨 유형 (글로벌 사이트 유형 필터) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                레슨 유형{' '}
                <span className="text-xs font-normal text-gray-500">
                  (글로벌 사이트 Rudiments/Fills/… 필터에 사용 · 선택 사항)
                </span>
              </label>
              <select
                value={form.lesson_type}
                onChange={(e) => setForm({ ...form, lesson_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
              >
                <option value="">선택 안 함</option>
                {LESSON_TYPE_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* 책 표지 (썸네일) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                교재 표지 이미지 * <span className="text-xs text-gray-500">(리스트/상세 노출)</span>
              </label>
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-2">
                  <input
                    type="url"
                    value={form.thumbnail_url}
                    onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
                    placeholder="이미지 URL을 입력하거나, 아래에서 파일 업로드"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onCoverUpload(file);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm"
                  />
                </div>
                {form.thumbnail_url && (
                  <img
                    src={form.thumbnail_url}
                    alt="표지 미리보기"
                    className="w-20 h-28 object-cover rounded-lg border shadow-sm"
                  />
                )}
              </div>
            </div>

            {/* PDF 업로드 + 미리보기 페이지 지정 */}
            <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1">
                  악보 미리보기용 PDF 페이지
                </label>
                <p className="text-xs text-gray-600 mb-2">
                  교재 PDF는 보통 1페이지가 책 표지입니다. 상세 페이지에 보일 <strong>모자이크 미리보기</strong>를 PDF의 몇 번째 페이지에서
                  만들지 입력하세요. (예: 본문이 3페이지부터면 <strong>3</strong>)
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    max={form.page_count > 0 ? form.page_count : undefined}
                    value={form.preview_pdf_page || 1}
                    onChange={(e) => {
                      const v = Math.max(1, Math.floor(Number(e.target.value)) || 1);
                      setForm({ ...form, preview_pdf_page: v });
                    }}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm"
                  />
                  <span className="text-sm text-gray-600">
                    페이지부터 미리보기 생성
                    {form.page_count > 0 ? (
                      <span className="text-gray-500"> (PDF 총 {form.page_count}페이지)</span>
                    ) : null}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">교재 PDF 파일 *</label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setForm((prev) => ({ ...prev, pdf_file: file }));
                      onPdfUpload(file);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm bg-white"
                />
                {isUploadingPdf && (
                  <p className="mt-1 text-sm text-orange-600 flex items-center gap-1">
                    <i className="ri-loader-4-line animate-spin"></i> PDF 업로드 및 미리보기 처리 중...
                  </p>
                )}
                {form.page_count > 0 && (
                  <p className="mt-1 text-sm text-gray-600">페이지수: {form.page_count}페이지</p>
                )}
                {form.pdf_url && !isUploadingPdf && (
                  <p className="mt-1 text-xs text-green-700 truncate">
                    업로드 완료:{' '}
                    <a href={form.pdf_url} target="_blank" rel="noreferrer" className="underline">
                      PDF 링크 확인
                    </a>
                  </p>
                )}
                {form.pdf_url && !isUploadingPdf && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onRegeneratePdfPreview()}
                      className="text-sm px-3 py-1.5 rounded-lg bg-white border border-orange-300 text-orange-800 hover:bg-orange-50"
                    >
                      위 페이지 번호로 미리보기 다시 만들기
                    </button>
                    <span className="text-xs text-gray-500">
                      페이지 번호만 바꾼 뒤 이 버튼을 누르면 이미지가 갱신됩니다.
                    </span>
                  </div>
                )}
                {form.preview_image_url ? (
                  <div className="mt-3 flex items-start gap-3">
                    <span className="text-xs text-gray-600 shrink-0 pt-1">현재 미리보기:</span>
                    <img
                      src={form.preview_image_url}
                      alt="PDF 미리보기"
                      className="max-h-40 rounded border border-gray-200 shadow-sm"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {/* 상세페이지(한/영): 리치 에디터 (굵게/제목/리스트/링크/이미지/YouTube) */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  상세페이지 (한국어){' '}
                  <span className="text-xs font-normal text-gray-500">
                    한국어 사이트에서만 표시 · 굵게/제목/목록/이미지/YouTube 삽입 가능
                  </span>
                </label>
                <RichTextEditor
                  value={form.detail_page_ko}
                  onChange={(html) => setForm({ ...form, detail_page_ko: html })}
                  onImageUpload={onLessonDetailImageUpload}
                  placeholder="예: 1장. 기초 그립과 자세 … (이미지/영상 삽입 가능)"
                  minHeight={220}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  상세페이지 (영문){' '}
                  <span className="text-xs font-normal text-gray-500">
                    한국어 제외 언어에 표시 · 비우면 한국어 상세를 대신 표시
                  </span>
                </label>
                <RichTextEditor
                  value={form.detail_page_en}
                  onChange={(html) => setForm({ ...form, detail_page_en: html })}
                  onImageUpload={onLessonDetailImageUpload}
                  placeholder="e.g. Chapter 1 … (images / video supported)"
                  minHeight={220}
                />
              </div>
            </div>

            {/* 샘플 유튜브 영상 (선택) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                샘플 유튜브 영상 URL <span className="text-xs text-gray-500">(선택)</span>
              </label>
              <input
                type="text"
                value={form.youtube_url}
                onChange={(e) => {
                  const url = e.target.value;
                  setForm({ ...form, youtube_url: url });
                  if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
                    onYoutubeAutoFillThumb(url);
                  }
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 text-sm"
              />
              {form.youtube_url && extractVideoId(form.youtube_url) && (
                <div className="mt-2 aspect-video max-w-sm bg-black rounded-lg overflow-hidden">
                  <iframe
                    src={`https://www.youtube.com/embed/${extractVideoId(form.youtube_url)}`}
                    className="w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="샘플 영상 미리보기"
                  />
                </div>
              )}
            </div>

            {/* 템포 (선택, 기존 호환) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                기준 템포 (BPM) <span className="text-xs text-gray-500">(선택)</span>
              </label>
              <input
                type="number"
                value={form.tempo}
                onChange={(e) => setForm({ ...form, tempo: Number(e.target.value) })}
                placeholder="예: 120"
                min="0"
                className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800">
            취소
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting || isUploadingPdf}
            className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>{' '}
                {isAdd ? '등록 중...' : '수정 중...'}
              </>
            ) : isAdd ? (
              '교재 등록'
            ) : (
              '수정 저장'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
