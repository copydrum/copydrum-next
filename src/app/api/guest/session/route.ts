import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SERVICE_ROLE_KEY_MISSING');
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function strongRandomPassword(): string {
  return (
    crypto.randomUUID() +
    crypto.randomUUID().toUpperCase().replace(/-/g, '') +
    '!aZ9'
  );
}

/**
 * POST /api/guest/session  body: { email }
 *
 * 게스트 결제 진입점. 입력 이메일로 계정을 자동 생성하고,
 * 클라이언트가 즉시 세션을 수립할 수 있도록 magiclink token_hash 를 반환한다.
 *
 * 보안 규칙:
 *  - 이미 존재하는 이메일이면 자동 로그인하지 않는다(계정 탈취 방지). exists:true 만 반환.
 *  - 신규 이메일만 계정 생성 + token_hash 발급.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { success: false, error: '유효한 이메일을 입력해 주세요.' },
      { status: 400 }
    );
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      { success: false, error: '서버 설정 오류로 게스트 결제를 사용할 수 없습니다.' },
      { status: 500 }
    );
  }

  // 1) 기존 계정 여부 — createUser 시도로 판별(중복이면 에러)
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: strongRandomPassword(),
    email_confirm: true,
    user_metadata: { guest_signup: true },
  });

  if (createErr) {
    const msg = (createErr.message || '').toLowerCase();
    const alreadyExists =
      msg.includes('already') ||
      msg.includes('registered') ||
      msg.includes('exists') ||
      (createErr as { code?: string }).code === 'email_exists';
    if (alreadyExists) {
      return NextResponse.json({ success: true, exists: true });
    }
    return NextResponse.json(
      { success: false, error: createErr.message || '계정 생성에 실패했습니다.' },
      { status: 500 }
    );
  }

  const newUser = created?.user;
  if (!newUser) {
    return NextResponse.json(
      { success: false, error: '계정 생성에 실패했습니다.' },
      { status: 500 }
    );
  }

  // 2) 프로필 생성 (best-effort)
  await supabase
    .from('profiles')
    .upsert(
      { id: newUser.id, email, name: email.split('@')[0] },
      { onConflict: 'id' }
    );

  // 3) 즉시 로그인용 magiclink token_hash 발급
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });

  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { success: false, error: '로그인 토큰 발급에 실패했습니다.' },
      { status: 500 }
    );
  }

  // 비번설정 메일은 클라이언트에서 resetPasswordForEmail(검증된 Supabase 내장 메일)로 발송한다.
  return NextResponse.json({
    success: true,
    exists: false,
    email,
    tokenHash: linkData.properties.hashed_token,
  });
}
