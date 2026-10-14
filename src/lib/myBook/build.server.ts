import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { sendMyBookBuildFailedNotification } from '@/lib/email/sendMyBookBuildFailedNotification';
import { buildBookPdf, getMyBookFileName, type BookFonts } from './buildBookPdf';
import { fetchBytes, getCoverKind, mapWithConcurrency, MY_BOOK_FONT_FILES } from './bookAssets';
import { grantMyBookSheets } from './grant.server';
import { MY_BOOK_RECOVERED_MESSAGE } from './messages';

export const MY_BOOK_PAID_STATUSES = ['payment_confirmed', 'in_progress', 'completed'];
/** 이 시간보다 오래 building 이면 중간에 죽은 것으로 보고 다시 만들 수 있다 (함수 최대 실행 시간과 같게) */
export const MY_BOOK_BUILD_STALE_MS = 5 * 60 * 1000;
/** 고객 화면에서 제작 지연을 관리자에게 알렸다는 표시 (book_build_error 앞부분) */
export const MY_BOOK_DELAY_REPORT_MARK = '[지연 알림]';

export type MyBookBuildStatus = 'pending' | 'building' | 'done' | 'failed';

export type BuildMyBookResult =
  | { status: 'done'; pageCount: number; warnings: string[] }
  | { status: 'skipped'; reason: 'not_found' | 'not_book' | 'not_paid' | 'already_done' | 'locked' }
  | { status: 'failed'; error: string };

interface BookOrderRow {
  id: string;
  user_id: string | null;
  order_type: string | null;
  status: string;
  name: string | null;
  email: string | null;
  book_title: string | null;
  cover_file_path: string | null;
  completed_pdf_url: string | null;
  book_build_status: MyBookBuildStatus | null;
  book_build_started_at: string | null;
  book_build_error: string | null;
}

interface BookItemRow {
  position: number;
  sheet_title: string | null;
  artist: string | null;
  drum_sheets: { title: string | null; artist: string | null; pdf_url: string | null } | null;
}

let fontsPromise: Promise<BookFonts> | null = null;

function loadFonts(): Promise<BookFonts> {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), 'public', 'fonts', 'my-book');
    fontsPromise = Promise.all([
      fs.readFile(path.join(dir, MY_BOOK_FONT_FILES.regular)),
      fs.readFile(path.join(dir, MY_BOOK_FONT_FILES.bold)),
      fs.readFile(path.join(dir, MY_BOOK_FONT_FILES.extraBold)),
    ]).then(([regular, bold, extraBold]) => ({ regular, bold, extraBold }));
    fontsPromise.catch(() => {
      fontsPromise = null;
    });
  }
  return fontsPromise;
}

export function isMyBookBuildStale(order: { book_build_status: string | null; book_build_started_at: string | null }) {
  if (order.book_build_status !== 'building') return false;
  const started = order.book_build_started_at ? new Date(order.book_build_started_at).getTime() : 0;
  return !started || Date.now() - started > MY_BOOK_BUILD_STALE_MS;
}

const toMessage = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

/**
 * 결제가 확인된 나만의 악보집 주문의 PDF 를 만들어 완성 파일로 올리고 주문을 완료 처리한다.
 * 같은 주문에 동시에 여러 번 호출돼도 book_build_status 조건부 업데이트로 한 번만 만든다.
 * force 는 관리자 [다시 만들기] 용으로, 이미 완료된 주문도 새 파일로 바꾼다.
 */
export async function buildMyBook(customOrderId: string, options: { force?: boolean } = {}): Promise<BuildMyBookResult> {
  const service = createServiceRoleClient();

  const { data: order, error: orderError } = await service
    .from('custom_orders')
    .select(
      'id, user_id, order_type, status, name, email, book_title, cover_file_path, completed_pdf_url, book_build_status, book_build_started_at, book_build_error'
    )
    .eq('id', customOrderId)
    .maybeSingle<BookOrderRow>();

  if (orderError || !order) {
    console.error('[my-book/build] 주문 조회 실패:', { customOrderId, orderError });
    return { status: 'skipped', reason: 'not_found' };
  }
  if (order.order_type !== 'book' || !order.user_id) return { status: 'skipped', reason: 'not_book' };
  if (!MY_BOOK_PAID_STATUSES.includes(order.status)) return { status: 'skipped', reason: 'not_paid' };
  // 관리자가 직접 파일을 올린 주문은 자동 제작으로 덮어쓰지 않는다
  if (!options.force && (order.book_build_status === 'done' || order.completed_pdf_url)) {
    return { status: 'skipped', reason: 'already_done' };
  }

  const startedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - MY_BOOK_BUILD_STALE_MS).toISOString();
  const takeable = ['pending', 'failed', ...(options.force ? ['done'] : [])].join(',');
  const { data: locked, error: lockError } = await service
    .from('custom_orders')
    .update({ book_build_status: 'building', book_build_started_at: startedAt, book_build_error: null })
    .eq('id', customOrderId)
    .or(
      `book_build_status.is.null,book_build_status.in.(${takeable}),and(book_build_status.eq.building,book_build_started_at.lt."${staleBefore}")`
    )
    .select('id')
    .maybeSingle();

  if (lockError) {
    console.error('[my-book/build] 제작 시작 기록 실패:', { customOrderId, lockError });
    return { status: 'failed', error: toMessage(lockError.message) };
  }
  if (!locked) return { status: 'skipped', reason: 'locked' };

  const bookTitle = order.book_title?.trim() || '나만의 악보집';
  const buyerName = order.name?.trim() || order.email?.split('@')[0] || '고객';
  let songCount = 0;

  try {
    const { data: itemRows, error: itemsError } = await service
      .from('custom_order_items')
      .select('position, sheet_title, artist, drum_sheets ( title, artist, pdf_url )')
      .eq('custom_order_id', customOrderId)
      .order('position', { ascending: true });
    if (itemsError) throw new Error(`곡 목록 조회 실패: ${itemsError.message}`);

    const items = (itemRows ?? []) as unknown as BookItemRow[];
    songCount = items.length;
    if (items.length === 0) throw new Error('악보집에 담긴 곡이 없습니다.');

    const songs = items.map((item) => ({
      title: item.sheet_title || item.drum_sheets?.title || '제목 미등록',
      artist: item.artist ?? item.drum_sheets?.artist ?? null,
      pdfUrl: item.drum_sheets?.pdf_url || null,
    }));
    const missing = songs.filter((song) => !song.pdfUrl).map((song) => song.title);
    if (missing.length > 0) throw new Error(`PDF 가 없는 곡: ${missing.join(', ')}`);

    const [pdfs, fonts, cover] = await Promise.all([
      mapWithConcurrency(songs, 4, async (song, index) => {
        try {
          return await fetchBytes(song.pdfUrl!, 2);
        } catch (error) {
          throw new Error(`${index + 1}번 곡 "${song.title}" PDF 다운로드 실패: ${toMessage(error)}`);
        }
      }),
      loadFonts(),
      loadCover(order.cover_file_path),
    ]);

    const result = await buildBookPdf({
      title: bookTitle,
      buyerName,
      createdAt: new Date(),
      songs: songs.map((song, index) => ({ title: song.title, artist: song.artist, pdf: pdfs[index] })),
      cover: cover.cover,
      fonts,
    });
    const warnings = [...cover.warnings, ...result.warnings];

    const filePath = `${order.user_id}/${order.id}/my-book-${Date.now()}.pdf`;
    const { error: uploadError } = await service.storage
      .from('custom-orders')
      .upload(filePath, result.bytes, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw new Error(`파일 업로드 실패: ${uploadError.message}`);

    const { data: publicUrlData } = service.storage.from('custom-orders').getPublicUrl(filePath);
    const completedFiles = [
      { url: publicUrlData.publicUrl, filename: getMyBookFileName(bookTitle), uploaded_at: new Date().toISOString() },
    ];

    const { data: finished, error: finishError } = await service
      .from('custom_orders')
      .update({
        completed_pdf_url: publicUrlData.publicUrl,
        completed_pdf_filename: JSON.stringify(completedFiles),
        status: 'completed',
        book_build_status: 'done',
        book_build_error: warnings.length > 0 ? warnings.join(' / ').slice(0, 500) : null,
        book_page_count: result.pageCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', customOrderId)
      .eq('book_build_status', 'building')
      .eq('book_build_started_at', startedAt)
      .select('id')
      .maybeSingle();

    if (finishError || !finished) {
      // 그 사이 다른 제작이 잠금을 가져갔다 → 이번 파일은 버린다
      await service.storage.from('custom-orders').remove([filePath]);
      if (finishError) throw new Error(`완료 기록 실패: ${finishError.message}`);
      return { status: 'skipped', reason: 'locked' };
    }

    try {
      await grantMyBookSheets(customOrderId);
    } catch (grantError) {
      console.error('[my-book/build] 낱곡 권한 부여 실패:', { customOrderId, grantError });
    }

    // 고객에게 담당자 처리로 안내했던 주문이면 완성 소식을 주문 메시지로 남긴다
    const customerWasToldToWait =
      order.book_build_status === 'failed' || !!order.book_build_error?.startsWith(MY_BOOK_DELAY_REPORT_MARK);
    if (customerWasToldToWait) {
      const { error: messageError } = await service.from('custom_order_messages').insert({
        custom_order_id: customOrderId,
        sender_id: null,
        sender_type: 'admin',
        message: MY_BOOK_RECOVERED_MESSAGE,
      });
      if (messageError) {
        console.error('[my-book/build] 완성 안내 메시지 저장 실패:', { customOrderId, messageError });
      }
    }

    console.log('[my-book/build] ✅ 악보집 제작 완료:', {
      customOrderId,
      songs: songs.length,
      pages: result.pageCount,
      kb: Math.round(result.bytes.length / 1024),
      warnings,
    });
    return { status: 'done', pageCount: result.pageCount, warnings };
  } catch (error) {
    const message = toMessage(error);
    console.error('[my-book/build] ❌ 악보집 제작 실패:', { customOrderId, message });

    await service
      .from('custom_orders')
      .update({ book_build_status: 'failed', book_build_error: message })
      .eq('id', customOrderId)
      .eq('book_build_status', 'building')
      .eq('book_build_started_at', startedAt);

    await sendMyBookBuildFailedNotification({
      customOrderId,
      bookTitle,
      buyerName,
      buyerEmail: order.email,
      songCount,
      error: message,
    });
    return { status: 'failed', error: message };
  }
}

async function loadCover(coverPath: string | null) {
  const warnings: string[] = [];
  if (!coverPath) return { cover: null, warnings };

  const kind = getCoverKind(coverPath);
  if (!kind) {
    warnings.push('표지 파일 형식을 지원하지 않아 기본 표지로 만들었습니다.');
    return { cover: null, warnings };
  }

  const service = createServiceRoleClient();
  const { data, error } = await service.storage.from('custom-orders').download(coverPath);
  if (error || !data) {
    warnings.push('표지 파일을 불러오지 못해 기본 표지로 만들었습니다.');
    return { cover: null, warnings };
  }
  return { cover: { bytes: new Uint8Array(await data.arrayBuffer()), kind }, warnings };
}
