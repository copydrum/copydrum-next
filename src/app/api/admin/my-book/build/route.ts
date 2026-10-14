import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { buildMyBook } from '@/lib/myBook/build.server';

export const maxDuration = 300;

/**
 * 관리자 [다시 만들기]. 끝날 때까지 기다렸다가 결과를 돌려준다.
 * force=true 면 이미 완성 파일이 있어도 새로 만들어 바꾼다.
 */
export async function POST(request: NextRequest) {
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

  const { customOrderId, force } = (await request.json().catch(() => ({}))) as {
    customOrderId?: string;
    force?: boolean;
  };
  if (!customOrderId) {
    return NextResponse.json({ success: false, error: 'customOrderId required' }, { status: 400 });
  }

  const result = await buildMyBook(customOrderId, { force: force === true });
  if (result.status === 'failed') {
    return NextResponse.json({ success: false, error: result.error, result }, { status: 500 });
  }
  return NextResponse.json({ success: true, result });
}
