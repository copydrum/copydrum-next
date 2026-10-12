import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { FREE_LESSON_PDF_BUCKET, sanitizePdfFileName } from '@/lib/freeLessons';

const HOURLY_DOWNLOAD_LIMIT = 40;

/**
 * 무료 레슨 PDF 다운로드 (회원 전용).
 * 로그인 확인 → 다운로드 기록 → 1분짜리 서명 URL 반환
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ error: 'LOGIN_REQUIRED' }, { status: 401 });
  }

  let lessonId = '';
  try {
    const body = await request.json();
    lessonId = typeof body?.lessonId === 'string' ? body.lessonId : '';
  } catch {
    // 아래에서 400 처리
  }
  if (!/^[0-9a-f-]{36}$/i.test(lessonId)) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: lesson, error: lessonError } = await supabase
    .from('free_lessons')
    .select('id, title, pdf_path, pdf_file_name, is_published')
    .eq('id', lessonId)
    .maybeSingle();
  if (lessonError) {
    console.error('[free-lesson-download] 레슨 조회 실패:', lessonError);
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }
  if (!lesson || !lesson.is_published || !lesson.pdf_path) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('free_lesson_downloads')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', authUser.id)
    .gte('created_at', since);
  if ((recentCount ?? 0) >= HOURLY_DOWNLOAD_LIMIT) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }

  const fileName = sanitizePdfFileName(lesson.pdf_file_name || `COPYDRUM - ${lesson.title}`);

  const { data: signed, error: signedError } = await supabase.storage
    .from(FREE_LESSON_PDF_BUCKET)
    .createSignedUrl(lesson.pdf_path, 60, { download: fileName });
  if (signedError || !signed?.signedUrl) {
    console.error('[free-lesson-download] 서명 URL 발급 실패:', signedError);
    return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 });
  }

  const { error: logError } = await supabase
    .from('free_lesson_downloads')
    .insert({ lesson_id: lesson.id, user_id: authUser.id });
  if (logError) {
    console.error('[free-lesson-download] 다운로드 기록 실패:', logError);
  }

  return NextResponse.json({ url: signed.signedUrl, fileName });
}
