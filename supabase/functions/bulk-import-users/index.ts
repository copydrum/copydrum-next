import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// 허용 오리진
const ALLOWED = new Set([
  'https://readdy.ai',
  'https://static.readdy.ai', 
  'http://localhost:3000',
  'http://localhost:5173',
  'https://copydrum.com',
  'https://www.copydrum.com',
]);

function cors(origin?: string) {
  const o = origin && ALLOWED.has(origin) ? origin : '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '3600',
  };
}

// 이메일 정규화 함수
function normalizeEmail(email: string): string {
  return email
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width 문자 제거
    .trim()
    .toLowerCase();
}

// Admin API로 사용자 조회 (안전한 폴백 포함)
async function getByEmailAdmin(supabase: any, email: string) {
  // 1) 공식 메서드 (있으면 사용)
  const m: any = (supabase as any).auth?.admin;
  if (m?.getUserByEmail) {
    try {
      const { data } = await m.getUserByEmail(email);
      if (data?.user?.id) return data.user.id;
    } catch (error) {
      console.error('getUserByEmail 실패:', error);
    }
  }

  // 2) listUsers 필터 폴백
  try {
    const { data } = await supabase.auth.admin.listUsers({ 
      page: 1, 
      perPage: 200, 
      email: email 
    });
    const user = data?.users?.find((u: any) => 
      (u.email || '').toLowerCase() === email.toLowerCase()
    );
    if (user?.id) return user.id;
  } catch (error) {
    console.error('listUsers 폴백 실패:', error);
  }

  // 3) RPC 폴백
  try {
    const { data } = await supabase.rpc('get_user_id_by_email', { p_email: email });
    if (data) return data as string;
  } catch (error) {
    console.error('RPC 폴백 실패:', error);
  }

  return null;
}

// 재시도 함수
async function retry<T>(
  fn: () => Promise<T | null>, 
  maxRetries: number = 40, 
  baseDelay: number = 200
): Promise<T | null> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      console.error(`재시도 ${i + 1}/${maxRetries} 실패:`, error);
    }
    
    if (i < maxRetries - 1) {
      const delay = baseDelay + Math.random() * baseDelay; // 지터 추가
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return null;
}

// 사용자 ID 확보 함수 (강화된 버전)
async function ensureUserId(supabase: any, rawEmail: string): Promise<string> {
  const email = normalizeEmail(rawEmail);
  console.log(`사용자 처리 시작: raw="${rawEmail}", norm="${email}"`);

  // 1단계: 기존 사용자 조회
  let userId = await getByEmailAdmin(supabase, email);
  if (userId) {
    console.log(`기존 사용자 발견: ${email} -> ${userId}`);
    return userId;
  }

  // 2단계: 새 사용자 생성
  console.log(`새 사용자 생성 시도: ${email}`);
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: crypto.randomUUID(),
      email_confirm: true
    });

    if (error) {
      const errorMsg = String(error.message || '').toLowerCase();
      
      // 이미 존재하는 사용자 에러는 정상 플로우로 처리
      if (errorMsg.includes('already') || 
          errorMsg.includes('existing_user') || 
          errorMsg.includes('duplicate')) {
        console.log(`기존 사용자 감지됨, 재조회: ${email}`);
        
        userId = await retry(async () => {
          return await getByEmailAdmin(supabase, email);
        }, 40, 250);

        if (!userId) {
          throw new Error(`existing_user_not_found: ${email}`);
        }
        return userId;
      }
      
      // 진짜 생성 실패
      throw new Error(`create_user_failed: ${email} :: ${error.message}`);
    }

    // 3단계: 생성 성공 후 ID 확보 (전파 지연 고려)
    userId = data?.user?.id;
    if (!userId) {
      // 생성은 됐지만 ID를 못 가져온 경우 재조회
      userId = await retry(async () => {
        return await getByEmailAdmin(supabase, email);
      }, 40, 250);

      if (!userId) {
        throw new Error(`created_but_not_fetchable: ${email}`);
      }
    }

    console.log(`새 사용자 생성 완료: ${email} -> ${userId}`);
    return userId;

  } catch (error) {
    console.error(`사용자 처리 실패: ${email}`, error);
    throw error;
  }
}

// 단일 사용자 처리 함수
async function processUser(supabase: any, userData: any): Promise<{ success: boolean; email: string; error?: string }> {
  try {
    const email = normalizeEmail(userData.email);
    
    // 빈 이메일 체크
    if (!email) {
      console.log(`빈 이메일로 건너뜀: ${userData.email}`);
      return { success: false, email: userData.email || '', error: '이메일이 비어있습니다' };
    }
    
    // 사용자 ID 확보
    const userId = await ensureUserId(supabase, email);
    
    // 프로필 정보 upsert (중복 방지)
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: email,
        name: userData.name || null,
        phone: userData.phone || null,
        kakao_id: userData.kakao_id || null,
        google_id: userData.google_id || null,
        role: userData.role || 'user',
        updated_at: new Date().toISOString()
      }, { 
        onConflict: 'id' 
      });

    if (profileError) {
      console.error(`프로필 업데이트 실패: ${email}`, profileError);
      return { success: false, email, error: `프로필 업데이트 실패: ${profileError.message}` };
    }

    console.log(`사용자 처리 완료: ${email}`);
    return { success: true, email };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`사용자 처리 오류: ${userData.email}`, errorMsg);
    return { success: false, email: userData.email, error: errorMsg };
  }
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  
  // CORS 프리플라이트 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors(origin) });
  }

  try {
    // 환경 변수 확인
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase 환경 변수가 설정되지 않았습니다');
    }

    // Supabase 클라이언트 초기화 (안정적인 설정)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: { 
        headers: { 'X-Client-Info': 'bulk-import/1.0' } 
      }
    });

    // 요청 데이터 파싱
    const { users } = await req.json();
    
    if (!Array.isArray(users) || users.length === 0) {
      throw new Error('유효한 사용자 데이터가 없습니다');
    }

    console.log(`대량 등록 시작: ${users.length}명`);

    // 순차 처리로 안정성 확보
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(`처리 중: ${i + 1}/${users.length} - ${user.email}`);
      
      const result = await processUser(supabase, user);
      results.push(result);
      
      if (result.success) {
        successCount++;
      } else {
        if (result.error?.includes('이메일이 비어있습니다')) {
          skippedCount++;
        } else {
          failureCount++;
        }
      }

      // API 부하 방지를 위한 대기
      if (i < users.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const failedUsers = results.filter(r => !r.success && !r.error?.includes('이메일이 비어있습니다'));

    console.log(`대량 등록 완료: 성공 ${successCount}명, 실패 ${failureCount}명, 건너뜀 ${skippedCount}명`);

    return new Response(
      JSON.stringify({
        success: true,
        total: users.length,
        successCount,
        failureCount,
        skippedCount,
        failedUsers: failedUsers.map(f => ({ email: f.email, error: f.error }))
      }),
      {
        headers: { 
          'Content-Type': 'application/json; charset=utf-8',
          ...cors(origin)
        },
        status: 200,
      }
    );

  } catch (error) {
    console.error('대량 등록 오류:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다',
        details: error instanceof Error ? error.stack : undefined
      }),
      {
        headers: { 
          'Content-Type': 'application/json; charset=utf-8',
          ...cors(origin)
        },
        status: 500,
      }
    );
  }
});