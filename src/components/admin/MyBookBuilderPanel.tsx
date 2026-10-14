'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchBytes, getCoverKind, mapWithConcurrency, MY_BOOK_FONT_FILES } from '../../lib/myBook/bookAssets';

type BuildStatus = 'pending' | 'building' | 'done' | 'failed' | null;

export interface MyBookBuilderOrder {
  id: string;
  status: string;
  name?: string | null;
  book_title?: string | null;
  cover_file_path?: string | null;
  book_cover_theme?: string | null;
  book_build_status?: BuildStatus;
  book_build_started_at?: string | null;
  book_build_error?: string | null;
  book_page_count?: number | null;
  profiles?: { name: string | null; email: string | null } | null;
}

interface BookItem {
  id: string;
  position: number;
  sheet_title: string;
  artist: string | null;
  drum_sheets: { pdf_url: string | null } | null;
}

interface MyBookBuilderPanelProps {
  order: MyBookBuilderOrder;
  hasCompletedFiles: boolean;
  /** 브라우저에서 만든 악보집을 완성 파일로 올리고 (기존 파일은 교체) 고객에게 완성 메시지를 남긴다 */
  onUploadBook: (file: File, pageCount: number) => Promise<{ messageSent: boolean }>;
  onReload: () => Promise<void> | void;
}

const PAID_STATUSES = ['payment_confirmed', 'in_progress', 'completed'];
const STALE_MS = 5 * 60 * 1000;

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  none: { label: '아직 시작 안 함', className: 'bg-gray-100 text-gray-600' },
  pending: { label: '대기', className: 'bg-gray-100 text-gray-600' },
  building: { label: '자동 제작 중', className: 'bg-indigo-100 text-indigo-700' },
  stale: { label: '제작 멈춤 (5분 초과)', className: 'bg-amber-100 text-amber-700' },
  done: { label: '자동 제작 완료', className: 'bg-emerald-100 text-emerald-700' },
  failed: { label: '자동 제작 실패', className: 'bg-red-100 text-red-700' },
};

const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('ko-KR') : '-';

/** 관리자용 나만의 악보집 제작 도구: 자동 제작 상태 확인, 다시 만들기, 곡별 대체 PDF 로 직접 만들기 */
export default function MyBookBuilderPanel({ order, hasCompletedFiles, onUploadBook, onReload }: MyBookBuilderPanelProps) {
  const [items, setItems] = useState<BookItem[]>([]);
  const [replacements, setReplacements] = useState<Record<string, File>>({});
  const [serverBusy, setServerBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [built, setBuilt] = useState<{ url: string; file: File; pageCount: number; warnings: string[] } | null>(null);
  const builtUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('custom_order_items')
        .select('id, position, sheet_title, artist, drum_sheets ( pdf_url )')
        .eq('custom_order_id', order.id)
        .order('position', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error('[admin/my-book] 곡 목록 로드 실패:', error);
        return;
      }
      setItems((data ?? []) as unknown as BookItem[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  useEffect(
    () => () => {
      if (builtUrlRef.current) URL.revokeObjectURL(builtUrlRef.current);
    },
    []
  );

  const statusKey = useMemo(() => {
    const status = order.book_build_status;
    if (!status) return 'none';
    if (status === 'building') {
      const started = order.book_build_started_at ? new Date(order.book_build_started_at).getTime() : 0;
      return !started || Date.now() - started > STALE_MS ? 'stale' : 'building';
    }
    return status;
  }, [order.book_build_status, order.book_build_started_at]);

  const isPaid = PAID_STATUSES.includes(order.status);
  const missingPdf = items.filter((item) => !item.drum_sheets?.pdf_url && !replacements[item.id]);
  const buyerName = order.name?.trim() || order.profiles?.name?.trim() || order.profiles?.email?.split('@')[0] || '고객';
  const bookTitle = order.book_title?.trim() || '나만의 악보집';

  const handleServerBuild = async () => {
    if (hasCompletedFiles && !confirm('이미 완성 파일이 있습니다. 새로 만들어 기존 파일을 바꿀까요?')) return;
    setServerBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/my-book/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customOrderId: order.id, force: true }),
      });
      const json = await res.json().catch(() => ({}));
      const result = json?.result;
      if (result?.status === 'done') {
        setMessage({
          type: 'ok',
          text: `서버에서 다시 만들었습니다. (${result.pageCount}페이지)${
            result.warnings?.length ? ` · ${result.warnings.join(' / ')}` : ''
          }`,
        });
      } else if (result?.status === 'skipped') {
        setMessage({
          type: 'error',
          text:
            result.reason === 'locked'
              ? '지금 다른 곳에서 만드는 중입니다. 잠시 후 새로고침해 주세요.'
              : result.reason === 'not_paid'
                ? '결제가 확인된 주문만 만들 수 있습니다.'
                : `건너뜀: ${result.reason}`,
        });
      } else {
        setMessage({ type: 'error', text: json?.error || '다시 만들기에 실패했습니다.' });
      }
      await onReload();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '다시 만들기에 실패했습니다.' });
    } finally {
      setServerBusy(false);
    }
  };

  const handleLocalBuild = useCallback(async () => {
    setMessage(null);
    setLocalBusy('준비 중...');
    try {
      const { buildBookPdf, getMyBookFileName } = await import('../../lib/myBook/buildBookPdf');

      setLocalBusy('폰트 불러오는 중...');
      const [regular, bold, extraBold] = await Promise.all(
        [MY_BOOK_FONT_FILES.regular, MY_BOOK_FONT_FILES.bold, MY_BOOK_FONT_FILES.extraBold].map((file) =>
          fetchBytes(`/fonts/my-book/${file}`)
        )
      );

      let done = 0;
      setLocalBusy(`악보 불러오는 중... (0/${items.length})`);
      const pdfs = await mapWithConcurrency(items, 4, async (item) => {
        const replacement = replacements[item.id];
        const bytes = replacement
          ? new Uint8Array(await replacement.arrayBuffer())
          : await fetchBytes(item.drum_sheets!.pdf_url!, 2).catch((error) => {
              throw new Error(`${item.position}번 "${item.sheet_title}" PDF를 불러오지 못했습니다: ${error.message}`);
            });
        done += 1;
        setLocalBusy(`악보 불러오는 중... (${done}/${items.length})`);
        return bytes;
      });

      const warnings: string[] = [];
      let cover = null;
      const coverKind = getCoverKind(order.cover_file_path);
      if (order.cover_file_path && coverKind) {
        try {
          const coverUrl = supabase.storage.from('custom-orders').getPublicUrl(order.cover_file_path).data.publicUrl;
          cover = { bytes: await fetchBytes(coverUrl), kind: coverKind };
        } catch {
          warnings.push('표지 파일을 불러오지 못해 기본 표지로 만들었습니다.');
        }
      }

      setLocalBusy('한 권으로 묶는 중...');
      const result = await buildBookPdf({
        title: bookTitle,
        buyerName,
        createdAt: new Date(),
        songs: items.map((item, index) => ({ title: item.sheet_title, artist: item.artist, pdf: pdfs[index] })),
        cover,
        coverTheme: order.book_cover_theme,
        fonts: { regular, bold, extraBold },
      });

      const file = new File([result.bytes as BlobPart], getMyBookFileName(bookTitle), { type: 'application/pdf' });
      if (builtUrlRef.current) URL.revokeObjectURL(builtUrlRef.current);
      const url = URL.createObjectURL(file);
      builtUrlRef.current = url;
      setBuilt({ url, file, pageCount: result.pageCount, warnings: [...warnings, ...result.warnings] });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '악보집을 만들지 못했습니다.' });
    } finally {
      setLocalBusy(null);
    }
  }, [items, replacements, order.cover_file_path, order.book_cover_theme, bookTitle, buyerName]);

  const handleUpload = async () => {
    if (!built) return;
    if (hasCompletedFiles && !confirm('기존 완성 파일을 이 파일로 바꿉니다. 고객에게는 새 파일만 보입니다. 진행할까요?')) return;
    setUploading(true);
    setMessage(null);
    try {
      const { messageSent } = await onUploadBook(built.file, built.pageCount);
      setMessage(
        messageSent
          ? { type: 'ok', text: '업로드하고 완료 처리했습니다. 고객에게 완성 안내 메시지도 보냈습니다.' }
          : {
              type: 'error',
              text: '업로드하고 완료 처리했지만 완성 안내 메시지를 보내지 못했습니다. 아래 대화창에서 고객에게 직접 알려 주세요.',
            }
      );
    } catch (error) {
      const text = error instanceof Error ? error.message : (error as { message?: string })?.message;
      setMessage({ type: 'error', text: text || '업로드하지 못했습니다.' });
    } finally {
      setUploading(false);
    }
  };

  const status = STATUS_LABEL[statusKey] ?? STATUS_LABEL.none;

  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900">
          <i className="ri-magic-line mr-1 text-indigo-600" />
          악보집 자동 제작
        </h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
        <dt>마지막 시작</dt>
        <dd className="text-right text-gray-800">{formatDateTime(order.book_build_started_at)}</dd>
        <dt>페이지 수</dt>
        <dd className="text-right text-gray-800">{order.book_page_count ? `${order.book_page_count}쪽` : '-'}</dd>
      </dl>
      {order.book_build_error && (
        <p
          className={`mt-2 rounded-md px-3 py-2 text-xs ${
            order.book_build_status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {order.book_build_status === 'failed' ? '오류: ' : '참고: '}
          {order.book_build_error}
        </p>
      )}

      <div className="mt-3 rounded-md bg-white p-3">
        <p className="text-sm font-semibold text-gray-900">1. 서버에서 다시 만들기</p>
        <p className="mt-0.5 text-xs text-gray-500">
          원본 PDF로 서버에서 다시 만들어 바로 완성 파일로 올립니다. 보통 수십 초 걸립니다.
        </p>
        <button
          type="button"
          onClick={() => void handleServerBuild()}
          disabled={!isPaid || serverBusy || !!localBusy}
          className="mt-2 w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {serverBusy ? '만드는 중... (창을 닫지 마세요)' : hasCompletedFiles ? '다시 만들어 교체' : '지금 만들기'}
        </button>
        {!isPaid && <p className="mt-1 text-xs text-amber-700">결제가 확인된 뒤에 만들 수 있습니다.</p>}
      </div>

      <div className="mt-3 rounded-md bg-white p-3">
        <p className="text-sm font-semibold text-gray-900">2. 곡 바꿔서 직접 만들기</p>
        <p className="mt-0.5 text-xs text-gray-500">
          원본이 없거나 고친 악보로 바꾸고 싶은 곡에만 PDF를 넣고, 이 브라우저에서 만들어 미리 본 뒤 올립니다.
          올리면 고객에게 완성 안내 메시지가 자동으로 남습니다.
        </p>
        <ol className="mt-2 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded border border-gray-100">
          {items.map((item) => {
            const replacement = replacements[item.id];
            const missing = !item.drum_sheets?.pdf_url;
            return (
              <li key={item.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
                <span className="w-5 shrink-0 text-center font-semibold text-gray-400">{item.position}</span>
                <span className={`min-w-0 flex-1 truncate ${missing && !replacement ? 'text-red-600' : 'text-gray-800'}`}>
                  {item.sheet_title}
                  {missing && !replacement && ' (원본 PDF 없음)'}
                </span>
                {replacement ? (
                  <button
                    type="button"
                    onClick={() =>
                      setReplacements((prev) => {
                        const next = { ...prev };
                        delete next[item.id];
                        return next;
                      })
                    }
                    className="shrink-0 rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 hover:bg-emerald-100"
                    title={replacement.name}
                  >
                    대체됨 ✕
                  </button>
                ) : (
                  <label className="shrink-0 cursor-pointer rounded border border-gray-200 px-2 py-0.5 text-gray-600 hover:bg-gray-50">
                    대체 PDF
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        if (file) setReplacements((prev) => ({ ...prev, [item.id]: file }));
                      }}
                    />
                  </label>
                )}
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={() => void handleLocalBuild()}
          disabled={!!localBusy || serverBusy || items.length === 0 || missingPdf.length > 0}
          className="mt-2 w-full rounded-md border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
        >
          {localBusy ?? '미리보기 만들기'}
        </button>
        {missingPdf.length > 0 && (
          <p className="mt-1 text-xs text-red-600">원본 PDF가 없는 곡 {missingPdf.length}곡에 대체 PDF를 넣어 주세요.</p>
        )}

        {built && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-600">
              {built.file.name} · {built.pageCount}페이지 · {(built.file.size / 1024 / 1024).toFixed(1)}MB
              {built.warnings.length > 0 && <span className="block text-amber-700">{built.warnings.join(' / ')}</span>}
            </p>
            <iframe src={built.url} title="악보집 미리보기" className="h-[420px] w-full rounded border border-gray-200" />
            <div className="flex gap-2">
              <a
                href={built.url}
                download={built.file.name}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                내 컴퓨터에 저장
              </a>
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={uploading}
                className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
              >
                {uploading ? '올리는 중...' : '업로드하고 완료'}
              </button>
            </div>
          </div>
        )}
      </div>

      {message && (
        <p
          className={`mt-3 rounded-md px-3 py-2 text-xs ${
            message.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
