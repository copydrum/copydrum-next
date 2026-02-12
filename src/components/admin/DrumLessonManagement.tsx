import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { pdfjsLib } from '../../lib/pdfClient';

// ─── Types ───────────────────────────────────────────
interface Category {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
}

interface DrumLessonSheet {
  id: string;
  title: string;
  artist: string;
  difficulty: string;
  price: number;
  category_id: string;
  thumbnail_url?: string | null;
  youtube_url?: string | null;
  pdf_url: string;
  page_count?: number | null;
  tempo?: number | null;
  is_active: boolean;
  created_at: string;
  categories?: { name: string } | null;
  extraCategories?: string[];
}

interface LessonFormData {
  title: string;
  artist: string;
  difficulty: string;
  youtube_url: string;
  thumbnail_url: string;
  pdf_url: string;
  preview_image_url: string;
  page_count: number;
  tempo: number;
  sub_category_ids: string[];
  pdf_file: File | null;
}

const DRUM_LESSON_SUB_CATEGORIES = [
  '드럼테크닉',
  '루디먼트',
  '드럼솔로',
  '기초/입문',
  '리듬패턴',
  '필인',
];

const createEmptyForm = (): LessonFormData => ({
  title: '',
  artist: '',
  difficulty: '초급',
  youtube_url: '',
  thumbnail_url: '',
  pdf_url: '',
  preview_image_url: '',
  page_count: 0,
  tempo: 0,
  sub_category_ids: [],
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

// ─── Component ───────────────────────────────────────
export default function DrumLessonManagement() {
  // ── State ──
  const [lessonCategoryId, setLessonCategoryId] = useState<string | null>(null);
  const [subCategories, setSubCategories] = useState<Category[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [sheets, setSheets] = useState<DrumLessonSheet[]>([]);
  const [loading, setLoading] = useState(true);

  // 서브카테고리 추가/수정
  const [showAddSubCat, setShowAddSubCat] = useState(false);
  const [newSubCatName, setNewSubCatName] = useState('');
  const [newSubCatDesc, setNewSubCatDesc] = useState('');
  const [editingSubCat, setEditingSubCat] = useState<Category | null>(null);
  const [editSubCatName, setEditSubCatName] = useState('');
  const [editSubCatDesc, setEditSubCatDesc] = useState('');

  // 레슨 자료 등록
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [form, setForm] = useState<LessonFormData>(createEmptyForm());
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 악보 목록 검색/필터
  const [searchTerm, setSearchTerm] = useState('');
  const [subCatFilter, setSubCatFilter] = useState('all');

  // 수정 모달
  const [editingSheet, setEditingSheet] = useState<DrumLessonSheet | null>(null);
  const [editForm, setEditForm] = useState<LessonFormData>(createEmptyForm());
  const [editSubCategoryIds, setEditSubCategoryIds] = useState<string[]>([]);

  // ── Data Loading ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. 드럼레슨 메인 카테고리 찾기
      const { data: lessonCat } = await supabase
        .from('categories')
        .select('id')
        .eq('name', '드럼레슨')
        .maybeSingle();

      if (!lessonCat) {
        // 없으면 자동 생성
        const { data: createdCat } = await supabase
          .from('categories')
          .insert({ name: '드럼레슨', description: '무료 드럼 레슨 자료' })
          .select('id')
          .single();
        if (createdCat) {
          setLessonCategoryId(createdCat.id);
        }
      } else {
        setLessonCategoryId(lessonCat.id);
      }

      // 2. 전체 카테고리 로드
      const { data: cats } = await supabase
        .from('categories')
        .select('*')
        .order('name');
      setAllCategories(cats || []);

      // 서브카테고리 필터링 (드럼레슨 제외, 서브카테고리 이름 매칭)
      const subCats = (cats || []).filter((c) =>
        DRUM_LESSON_SUB_CATEGORIES.includes(c.name)
      );
      setSubCategories(subCats);

      // 3. 드럼레슨 악보 로드
      const catId = lessonCat?.id;
      if (catId) {
        // primary category가 드럼레슨인 악보
        const { data: primarySheets } = await supabase
          .from('drum_sheets')
          .select('*, categories ( name )')
          .eq('category_id', catId)
          .order('created_at', { ascending: false });

        // drum_sheet_categories에서 드럼레슨 카테고리에 속한 악보
        const { data: relations } = await supabase
          .from('drum_sheet_categories')
          .select('sheet_id')
          .eq('category_id', catId);

        const relIds = new Set((relations || []).map((r: any) => r.sheet_id));
        const primaryIds = new Set((primarySheets || []).map((s: any) => s.id));
        const additionalIds = Array.from(relIds).filter((id) => !primaryIds.has(id));

        let additionalSheets: any[] = [];
        if (additionalIds.length > 0) {
          const { data } = await supabase
            .from('drum_sheets')
            .select('*, categories ( name )')
            .in('id', additionalIds);
          additionalSheets = data || [];
        }

        const allSheets = [...(primarySheets || []), ...additionalSheets];

        // 각 악보의 추가 카테고리 로드
        if (allSheets.length > 0) {
          const ids = allSheets.map((s) => s.id);
          const { data: extraCats } = await supabase
            .from('drum_sheet_categories')
            .select('sheet_id, category:categories ( name )')
            .in('sheet_id', ids);

          const extraMap = new Map<string, string[]>();
          (extraCats || []).forEach((rel: any) => {
            if (rel?.sheet_id && rel?.category?.name) {
              const list = extraMap.get(rel.sheet_id) || [];
              list.push(rel.category.name);
              extraMap.set(rel.sheet_id, list);
            }
          });

          allSheets.forEach((s) => {
            s.extraCategories = extraMap.get(s.id) || [];
          });
        }

        setSheets(allSheets);
      }
    } catch (error) {
      console.error('드럼레슨 데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Sub-category Management ──
  const handleAddSubCategory = async () => {
    if (!newSubCatName.trim()) {
      alert('서브카테고리 이름을 입력해주세요.');
      return;
    }
    try {
      const { error } = await supabase
        .from('categories')
        .insert({ name: newSubCatName.trim(), description: newSubCatDesc.trim() || null });
      if (error) throw error;
      alert('서브카테고리가 추가되었습니다.');
      setShowAddSubCat(false);
      setNewSubCatName('');
      setNewSubCatDesc('');
      loadData();
    } catch (error: any) {
      alert(`오류: ${error.message}`);
    }
  };

  const handleUpdateSubCategory = async () => {
    if (!editingSubCat || !editSubCatName.trim()) return;
    try {
      const { error } = await supabase
        .from('categories')
        .update({ name: editSubCatName.trim(), description: editSubCatDesc.trim() || null })
        .eq('id', editingSubCat.id);
      if (error) throw error;
      alert('서브카테고리가 수정되었습니다.');
      setEditingSubCat(null);
      loadData();
    } catch (error: any) {
      alert(`오류: ${error.message}`);
    }
  };

  const handleDeleteSubCategory = async (catId: string) => {
    if (!confirm('이 서브카테고리를 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('id', catId);
      if (error) throw error;
      alert('삭제되었습니다.');
      loadData();
    } catch (error: any) {
      alert(`오류: ${error.message}`);
    }
  };

  // ── YouTube Thumbnail ──
  const fetchYoutubeThumbnail = (url: string, setter: (url: string) => void) => {
    const videoId = extractVideoId(url);
    if (!videoId) return;
    const maxResUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    setter(maxResUrl);
  };

  // ── PDF Upload ──
  const handlePdfUpload = async (file: File, setter: (updates: Partial<LessonFormData>) => void) => {
    setIsUploadingPdf(true);
    try {
      // 1. 페이지수
      let pageCount = 0;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        pageCount = pdf.numPages;
      } catch (e) {
        console.error('PDF 페이지수 추출 오류:', e);
      }

      // 2. 업로드
      const fileExt = file.name.split('.').pop() || 'pdf';
      const sanitized = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const safeName = sanitized.length > 2 ? sanitized : `lesson_${Math.random().toString(36).substring(2, 10)}.${fileExt}`;
      const fileName = `${Date.now()}_${safeName}`;
      const filePath = `pdfs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('drum-sheets')
        .upload(filePath, file, { contentType: 'application/pdf', upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('drum-sheets').getPublicUrl(filePath);
      const pdfUrl = urlData.publicUrl;

      // 3. 미리보기 이미지
      let previewImageUrl = '';
      try {
        const ab = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: ab });
        const pdf = await loadingTask.promise;
        if (pdf.numPages > 0) {
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const mosaicData = applyMosaicToImageData(imageData, 15);
            ctx.putImageData(mosaicData, 0, 0);
            const blob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob fail'))), 'image/jpeg', 0.85);
            });
            const imgFileName = `preview_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
            const imgPath = `previews/${imgFileName}`;
            const { error: imgErr } = await supabase.storage
              .from('drum-sheets')
              .upload(imgPath, blob, { contentType: 'image/jpeg', upsert: true });
            if (!imgErr) {
              const { data: imgUrlData } = supabase.storage.from('drum-sheets').getPublicUrl(imgPath);
              previewImageUrl = imgUrlData.publicUrl;
            }
          }
        }
      } catch (e) {
        console.warn('미리보기 생성 실패:', e);
      }

      setter({ pdf_url: pdfUrl, page_count: pageCount, preview_image_url: previewImageUrl });
      alert(`PDF 업로드 완료! 페이지수: ${pageCount}페이지`);
    } catch (error: any) {
      alert(`PDF 업로드 오류: ${error.message}`);
    } finally {
      setIsUploadingPdf(false);
    }
  };

  // ── Add Lesson Sheet ──
  const handleAddLesson = async () => {
    if (!form.title.trim() || !form.artist.trim()) {
      alert('제목과 아티스트는 필수입니다.');
      return;
    }
    if (!form.pdf_url) {
      alert('PDF 파일을 업로드해주세요.');
      return;
    }
    if (!lessonCategoryId) {
      alert('드럼레슨 카테고리가 없습니다. 페이지를 새로고침해주세요.');
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
        title: form.title.trim(),
        artist: form.artist.trim(),
        difficulty,
        price: 0, // 무료
        category_id: lessonCategoryId,
        pdf_url: form.pdf_url,
        is_active: true,
      };
      if (form.thumbnail_url) insertData.thumbnail_url = form.thumbnail_url;
      if (form.youtube_url) insertData.youtube_url = form.youtube_url;
      if (form.page_count > 0) insertData.page_count = form.page_count;
      if (form.tempo > 0) insertData.tempo = form.tempo;
      if (form.preview_image_url) insertData.preview_image_url = form.preview_image_url;

      const { data: inserted, error: insertError } = await supabase
        .from('drum_sheets')
        .insert(insertData)
        .select('id')
        .single();

      if (insertError) throw insertError;

      // drum_sheet_categories에 서브카테고리 + 드럼레슨 추가
      const categoryIdsToLink = [lessonCategoryId, ...form.sub_category_ids];
      if (categoryIdsToLink.length > 0 && inserted) {
        const relations = categoryIdsToLink.map((catId) => ({
          sheet_id: inserted.id,
          category_id: catId,
        }));
        await supabase.from('drum_sheet_categories').insert(relations);
      }

      alert('드럼 레슨 자료가 등록되었습니다!');
      setShowAddLesson(false);
      setForm(createEmptyForm());
      loadData();
    } catch (error: any) {
      alert(`등록 오류: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Edit Sheet ──
  const handleOpenEdit = async (sheet: DrumLessonSheet) => {
    setEditingSheet(sheet);
    setEditForm({
      title: sheet.title,
      artist: sheet.artist,
      difficulty: sheet.difficulty,
      youtube_url: sheet.youtube_url || '',
      thumbnail_url: sheet.thumbnail_url || '',
      pdf_url: sheet.pdf_url,
      preview_image_url: '',
      page_count: sheet.page_count || 0,
      tempo: sheet.tempo || 0,
      sub_category_ids: [],
      pdf_file: null,
    });

    // 기존 서브카테고리 로드
    const { data: rels } = await supabase
      .from('drum_sheet_categories')
      .select('category_id')
      .eq('sheet_id', sheet.id);
    const catIds = (rels || []).map((r: any) => r.category_id);
    // 드럼레슨 제외한 서브카테고리만
    const subIds = catIds.filter((id: string) => id !== lessonCategoryId);
    setEditSubCategoryIds(subIds);
  };

  const handleUpdateSheet = async () => {
    if (!editingSheet) return;
    setIsSubmitting(true);
    try {
      const difficultyMap: Record<string, string> = {
        beginner: '초급', intermediate: '중급', advanced: '고급',
        '초급': '초급', '중급': '중급', '고급': '고급',
      };
      const difficulty = difficultyMap[editForm.difficulty.toLowerCase()] || '초급';

      const updateData: any = {
        title: editForm.title.trim(),
        artist: editForm.artist.trim(),
        difficulty,
        price: 0,
      };
      if (editForm.thumbnail_url) updateData.thumbnail_url = editForm.thumbnail_url;
      if (editForm.youtube_url) updateData.youtube_url = editForm.youtube_url;
      if (editForm.page_count > 0) updateData.page_count = editForm.page_count;
      if (editForm.tempo > 0) updateData.tempo = editForm.tempo;

      const { error: updateError } = await supabase
        .from('drum_sheets')
        .update(updateData)
        .eq('id', editingSheet.id);
      if (updateError) throw updateError;

      // 서브카테고리 업데이트
      await supabase.from('drum_sheet_categories').delete().eq('sheet_id', editingSheet.id);
      const categoryIdsToLink = [lessonCategoryId!, ...editSubCategoryIds];
      if (categoryIdsToLink.length > 0) {
        const relations = categoryIdsToLink.map((catId) => ({
          sheet_id: editingSheet.id,
          category_id: catId,
        }));
        await supabase.from('drum_sheet_categories').insert(relations);
      }

      alert('수정 완료!');
      setEditingSheet(null);
      loadData();
    } catch (error: any) {
      alert(`수정 오류: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delete Sheet ──
  const handleDeleteSheet = async (sheetId: string) => {
    if (!confirm('이 드럼레슨 자료를 삭제하시겠습니까?')) return;
    try {
      await supabase.from('drum_sheet_categories').delete().eq('sheet_id', sheetId);
      const { error } = await supabase.from('drum_sheets').delete().eq('id', sheetId);
      if (error) throw error;
      alert('삭제되었습니다.');
      loadData();
    } catch (error: any) {
      alert(`삭제 오류: ${error.message}`);
    }
  };

  // ── Toggle Active ──
  const handleToggleActive = async (sheetId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('drum_sheets')
        .update({ is_active: !currentActive })
        .eq('id', sheetId);
      if (error) throw error;
      loadData();
    } catch (error: any) {
      alert(`상태 변경 오류: ${error.message}`);
    }
  };

  // ── Filtered Sheets ──
  const filteredSheets = sheets.filter((s) => {
    const term = searchTerm.toLowerCase().trim();
    if (term && !s.title.toLowerCase().includes(term) && !s.artist.toLowerCase().includes(term)) {
      return false;
    }
    if (subCatFilter !== 'all') {
      const cats = s.extraCategories || [];
      const primaryCat = s.categories?.name || '';
      if (!cats.includes(subCatFilter) && primaryCat !== subCatFilter) return false;
    }
    return true;
  });

  // ── Render ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-blue-600">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
          <span>드럼레슨 데이터를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ===== Header ===== */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">🥁 드럼레슨 관리</h2>
          <p className="text-sm text-gray-500 mt-1">무료 드럼 레슨 자료를 등록하고 관리합니다.</p>
        </div>
        <button
          onClick={() => {
            setForm(createEmptyForm());
            setShowAddLesson(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <i className="ri-add-line"></i>
          <span>새 레슨 자료 등록</span>
        </button>
      </div>

      {/* ===== 서브카테고리 관리 ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">📂 서브카테고리 관리</h3>
          <button
            onClick={() => setShowAddSubCat(true)}
            className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1"
          >
            <i className="ri-add-line"></i> 추가
          </button>
        </div>

        {subCategories.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 서브카테고리가 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {subCategories.map((cat) => (
              <div
                key={cat.id}
                className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-full px-4 py-1.5"
              >
                <span className="text-sm font-medium text-blue-700">{cat.name}</span>
                <button
                  onClick={() => {
                    setEditingSubCat(cat);
                    setEditSubCatName(cat.name);
                    setEditSubCatDesc(cat.description || '');
                  }}
                  className="text-blue-400 hover:text-blue-600 text-xs"
                >
                  <i className="ri-edit-line"></i>
                </button>
                <button
                  onClick={() => handleDeleteSubCategory(cat.id)}
                  className="text-red-400 hover:text-red-600 text-xs"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 서브카테고리 추가 모달 */}
        {showAddSubCat && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">서브카테고리 추가</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
                  <input
                    type="text"
                    value={newSubCatName}
                    onChange={(e) => setNewSubCatName(e.target.value)}
                    placeholder="예: 드럼테크닉"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                  <input
                    type="text"
                    value={newSubCatDesc}
                    onChange={(e) => setNewSubCatDesc(e.target.value)}
                    placeholder="카테고리 설명 (선택)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowAddSubCat(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">취소</button>
                <button onClick={handleAddSubCategory} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">추가</button>
              </div>
            </div>
          </div>
        )}

        {/* 서브카테고리 수정 모달 */}
        {editingSubCat && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">서브카테고리 수정</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                  <input
                    type="text"
                    value={editSubCatName}
                    onChange={(e) => setEditSubCatName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                  <input
                    type="text"
                    value={editSubCatDesc}
                    onChange={(e) => setEditSubCatDesc(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setEditingSubCat(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">취소</button>
                <button onClick={handleUpdateSubCategory} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">수정</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== 레슨 자료 목록 ===== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">📋 레슨 자료 목록 ({filteredSheets.length}개)</h3>
            <div className="flex gap-3">
              <div className="relative">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="검색..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <select
                value={subCatFilter}
                onChange={(e) => setSubCatFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
              >
                <option value="all">전체 서브카테고리</option>
                {subCategories.map((cat) => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">썸네일</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">제목 / 아티스트</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">서브카테고리</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">난이도</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">영상</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">등록일</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSheets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    {searchTerm || subCatFilter !== 'all' ? '검색 결과가 없습니다.' : '등록된 레슨 자료가 없습니다.'}
                  </td>
                </tr>
              ) : (
                filteredSheets.map((sheet) => {
                  const extraCats = (sheet.extraCategories || []).filter((c) => c !== '드럼레슨');
                  const videoId = extractVideoId(sheet.youtube_url || '');

                  return (
                    <tr key={sheet.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        {sheet.thumbnail_url ? (
                          <img src={sheet.thumbnail_url} alt={sheet.title} className="w-16 h-12 object-cover rounded border" />
                        ) : (
                          <div className="w-16 h-12 bg-gray-100 rounded border flex items-center justify-center text-gray-400">
                            <i className="ri-image-line"></i>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{sheet.title}</div>
                        <div className="text-xs text-gray-500">{sheet.artist}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {extraCats.length > 0 ? extraCats.map((cat) => (
                            <span key={cat} className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                              {cat}
                            </span>
                          )) : (
                            <span className="text-xs text-gray-400">미분류</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                          sheet.difficulty === '초급' ? 'bg-green-100 text-green-700' :
                          sheet.difficulty === '중급' ? 'bg-yellow-100 text-yellow-700' :
                          sheet.difficulty === '고급' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {sheet.difficulty}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {videoId ? (
                          <a href={sheet.youtube_url!} target="_blank" rel="noreferrer" className="text-red-500 hover:text-red-700">
                            <i className="ri-youtube-fill text-lg"></i>
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">없음</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleActive(sheet.id, sheet.is_active)}
                          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full cursor-pointer ${
                            sheet.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {sheet.is_active ? '활성' : '비활성'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(sheet.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenEdit(sheet)}
                            className="text-blue-600 hover:text-blue-800"
                            title="수정"
                          >
                            <i className="ri-edit-line"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteSheet(sheet.id)}
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

      {/* ===== 새 레슨 자료 등록 모달 ===== */}
      {showAddLesson && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">🎵 새 드럼레슨 자료 등록</h3>
                <p className="text-xs text-gray-500 mt-0.5">가격은 자동으로 0원(무료)으로 설정됩니다.</p>
              </div>
              <button onClick={() => setShowAddLesson(false)} className="text-gray-400 hover:text-gray-600">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-5">
                {/* 제목 & 아티스트 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">제목 *</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="레슨 자료 제목"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">아티스트 / 출처 *</label>
                    <input
                      type="text"
                      value={form.artist}
                      onChange={(e) => setForm({ ...form, artist: e.target.value })}
                      placeholder="예: COPYDRUM"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 유튜브 URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">유튜브 레슨 URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.youtube_url}
                      onChange={(e) => {
                        const url = e.target.value;
                        setForm({ ...form, youtube_url: url });
                        if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
                          fetchYoutubeThumbnail(url, (thumbUrl) =>
                            setForm((prev) => ({ ...prev, thumbnail_url: thumbUrl }))
                          );
                        }
                      }}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  {form.youtube_url && extractVideoId(form.youtube_url) && (
                    <div className="mt-2 aspect-video max-w-sm bg-black rounded-lg overflow-hidden">
                      <iframe
                        src={`https://www.youtube.com/embed/${extractVideoId(form.youtube_url)}`}
                        className="w-full h-full"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="미리보기"
                      />
                    </div>
                  )}
                </div>

                {/* 썸네일 미리보기 */}
                {form.thumbnail_url && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">썸네일 미리보기</label>
                    <img src={form.thumbnail_url} alt="썸네일" className="w-32 h-24 object-cover rounded-lg border" />
                  </div>
                )}

                {/* PDF 업로드 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PDF 파일 *</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setForm((prev) => ({ ...prev, pdf_file: file }));
                        handlePdfUpload(file, (updates) => setForm((prev) => ({ ...prev, ...updates })));
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                  {isUploadingPdf && (
                    <p className="mt-1 text-sm text-blue-600 flex items-center gap-1">
                      <i className="ri-loader-4-line animate-spin"></i> PDF 업로드 및 처리 중...
                    </p>
                  )}
                  {form.page_count > 0 && (
                    <p className="mt-1 text-sm text-gray-600">페이지수: {form.page_count}페이지</p>
                  )}
                </div>

                {/* 난이도 & 템포 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">난이도</label>
                    <select
                      value={form.difficulty}
                      onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="초급">초급</option>
                      <option value="중급">중급</option>
                      <option value="고급">고급</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">템포 (BPM)</label>
                    <input
                      type="number"
                      value={form.tempo}
                      onChange={(e) => setForm({ ...form, tempo: Number(e.target.value) })}
                      placeholder="예: 120"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                </div>

                {/* 서브카테고리 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">서브카테고리 (선택, 중복 가능)</label>
                  <div className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                    {subCategories.length === 0 ? (
                      <p className="text-sm text-gray-500">서브카테고리가 없습니다. 상단에서 먼저 추가해주세요.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {subCategories.map((cat) => {
                          const isSelected = form.sub_category_ids.includes(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({
                                  ...prev,
                                  sub_category_ids: isSelected
                                    ? prev.sub_category_ids.filter((id) => id !== cat.id)
                                    : [...prev.sub_category_ids, cat.id],
                                }));
                              }}
                              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-400'
                              }`}
                            >
                              {cat.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 가격 표시 */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                  <i className="ri-price-tag-3-line text-green-600 text-xl"></i>
                  <div>
                    <span className="text-green-700 font-semibold">가격: 무료 (0원)</span>
                    <p className="text-xs text-green-600 mt-0.5">드럼레슨 자료는 자동으로 무료로 설정됩니다.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
              <button
                onClick={() => setShowAddLesson(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                취소
              </button>
              <button
                onClick={handleAddLesson}
                disabled={isSubmitting || isUploadingPdf}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i> 등록 중...
                  </>
                ) : (
                  '등록'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 수정 모달 ===== */}
      {editingSheet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">레슨 자료 수정</h3>
              <button onClick={() => setEditingSheet(null)} className="text-gray-400 hover:text-gray-600">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">아티스트</label>
                    <input
                      type="text"
                      value={editForm.artist}
                      onChange={(e) => setEditForm({ ...editForm, artist: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">유튜브 레슨 URL</label>
                  <input
                    type="text"
                    value={editForm.youtube_url}
                    onChange={(e) => {
                      const url = e.target.value;
                      setEditForm({ ...editForm, youtube_url: url });
                      if (url && (url.includes('youtube.com') || url.includes('youtu.be'))) {
                        fetchYoutubeThumbnail(url, (thumbUrl) =>
                          setEditForm((prev) => ({ ...prev, thumbnail_url: thumbUrl }))
                        );
                      }
                    }}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                {editForm.thumbnail_url && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">썸네일</label>
                    <img src={editForm.thumbnail_url} alt="썸네일" className="w-32 h-24 object-cover rounded-lg border" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">난이도</label>
                    <select
                      value={editForm.difficulty}
                      onChange={(e) => setEditForm({ ...editForm, difficulty: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="초급">초급</option>
                      <option value="중급">중급</option>
                      <option value="고급">고급</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">템포 (BPM)</label>
                    <input
                      type="number"
                      value={editForm.tempo}
                      onChange={(e) => setEditForm({ ...editForm, tempo: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      min="0"
                    />
                  </div>
                </div>

                {/* 서브카테고리 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">서브카테고리</label>
                  <div className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                    <div className="flex flex-wrap gap-2">
                      {subCategories.map((cat) => {
                        const isSelected = editSubCategoryIds.includes(cat.id);
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setEditSubCategoryIds((prev) =>
                                isSelected ? prev.filter((id) => id !== cat.id) : [...prev, cat.id]
                              );
                            }}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-gray-300 text-gray-700 hover:border-blue-400'
                            }`}
                          >
                            {cat.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                  <i className="ri-price-tag-3-line text-green-600 text-xl"></i>
                  <span className="text-green-700 font-semibold">가격: 무료 (0원)</span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setEditingSheet(null)} className="px-4 py-2 text-gray-600 hover:text-gray-800">취소</button>
              <button
                onClick={handleUpdateSheet}
                disabled={isSubmitting}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {isSubmitting ? '수정 중...' : '수정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
