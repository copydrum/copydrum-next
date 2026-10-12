import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { extractYoutubeVideoId } from '@/lib/freeLessons';

/**
 * 관리자: 유튜브 영상 제목·채널명 조회 (oEmbed). 무료 레슨 등록 시 제목 자동 입력용.
 */
export async function GET(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, role')
    .eq('id', authUser.id)
    .maybeSingle();
  if (!profile || (!profile.is_admin && profile.role !== 'admin')) {
    return NextResponse.json({ error: '관리자만 사용할 수 있습니다.' }, { status: 403 });
  }

  const videoId = extractYoutubeVideoId(request.nextUrl.searchParams.get('url'));
  if (!videoId) {
    return NextResponse.json({ error: '유튜브 링크를 확인해주세요.' }, { status: 400 });
  }

  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      return NextResponse.json({ videoId, title: null, author: null }, { status: 200 });
    }
    const data = (await response.json()) as { title?: string; author_name?: string };
    return NextResponse.json({
      videoId,
      title: data.title ?? null,
      author: data.author_name ?? null,
    });
  } catch (error) {
    console.error('[youtube-info] oEmbed 조회 실패:', error);
    return NextResponse.json({ videoId, title: null, author: null }, { status: 200 });
  }
}
