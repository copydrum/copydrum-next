import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';

const MAX_PAGE_SIZE = 100;
const MEMBER_COLUMNS = 'id, email, name, kakao_id, google_id, is_admin, created_at, updated_at';

/** PostgREST or() 문법과 LIKE 와일드카드로 해석되는 문자를 뺀다 */
const sanitizeSearchTerm = (value: string) => value.replace(/[,()*%_\\]/g, ' ').trim().slice(0, 100);

/**
 * GET /api/admin/members?page=1&pageSize=20&q=검색어
 * 회원 관리 목록. 회원 수가 많아 화면에 보일 페이지만 이메일·이름으로 검색해 돌려준다.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: profile } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(Number(params.get('pageSize')) || 20)));
  const term = sanitizeSearchTerm(params.get('q') ?? '');

  let query = service
    .from('profiles')
    .select(MEMBER_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (term) {
    query = query.or(`email.ilike.%${term}%,name.ilike.%${term}%`);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error('[admin/members] 회원 목록 조회 실패:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { success: true, members: data ?? [], total: count ?? 0 },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
