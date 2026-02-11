import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Supabase 클라이언트 생성
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // JWT 토큰에서 사용자 정보 추출
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

    if (authError || !user) {
      console.error('인증 오류:', authError)
      return new Response(
        JSON.stringify({ error: '인증이 필요합니다.' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 관리자 권한 확인
    const { data: adminProfile, error: adminError } = await supabaseClient
      .from('profiles')
      .select('is_admin, role')
      .eq('id', user.id)
      .single()

    if (adminError) {
      console.error('관리자 프로필 조회 오류:', adminError)
      return new Response(
        JSON.stringify({ error: '권한 확인 중 오류가 발생했습니다.' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 관리자 이메일 목록
    const ADMIN_EMAILS = ['copydrum@hanmail.net', 'admin@example.com']
    const isAdminEmail = ADMIN_EMAILS.includes(user.email || '')
    const isAdminRole = adminProfile?.is_admin || adminProfile?.role === 'admin'

    if (!isAdminEmail && !isAdminRole) {
      return new Response(
        JSON.stringify({ error: '관리자 권한이 필요합니다.' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 요청 데이터 파싱
    const requestBody = await req.json()
    const { userId } = requestBody

    if (!userId) {
      return new Response(
        JSON.stringify({ error: '회원 ID가 필요합니다.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('삭제할 회원 ID:', userId)

    // 자기 자신 삭제 방지
    if (userId === user.id) {
      return new Response(
        JSON.stringify({ error: '자기 자신은 삭제할 수 없습니다.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 삭제할 회원이 존재하는지 확인
    const { data: targetUser, error: userCheckError } = await supabaseClient
      .from('profiles')
      .select('id, email, name, role')
      .eq('id', userId)
      .single()

    if (userCheckError || !targetUser) {
      console.error('회원 조회 오류:', userCheckError)
      return new Response(
        JSON.stringify({ error: '존재하지 않는 회원입니다.' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 관리자 삭제 방지
    if (targetUser.role === 'admin' || ADMIN_EMAILS.includes(targetUser.email)) {
      return new Response(
        JSON.stringify({ error: '관리자 계정은 삭제할 수 없습니다.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('삭제할 회원 정보:', targetUser)

    // 관련 데이터 순서대로 삭제 (외래키 제약 조건 고려)
    try {
      // 1. 장바구니 아이템 삭제
      const { error: cartError } = await supabaseClient
        .from('cart_items')
        .delete()
        .eq('user_id', userId)

      if (cartError) {
        console.error('장바구니 삭제 오류:', cartError)
      }

      // 2. 주문 삭제
      const { error: orderError } = await supabaseClient
        .from('orders')
        .delete()
        .eq('user_id', userId)

      if (orderError) {
        console.error('주문 삭제 오류:', orderError)
      }

      // 3. 맞춤 주문 삭제
      const { error: customOrderError } = await supabaseClient
        .from('custom_orders')
        .delete()
        .eq('user_id', userId)

      if (customOrderError) {
        console.error('맞춤 주문 삭제 오류:', customOrderError)
      }

      // 4. 고객 문의 삭제
      const { error: inquiryError } = await supabaseClient
        .from('customer_inquiries')
        .delete()
        .eq('user_id', userId)

      if (inquiryError) {
        console.error('고객 문의 삭제 오류:', inquiryError)
      }

      // 5. 프로필 삭제
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .delete()
        .eq('id', userId)

      if (profileError) {
        console.error('프로필 삭제 오류:', profileError)
        return new Response(
          JSON.stringify({ 
            error: '회원 삭제 중 오류가 발생했습니다.',
            details: profileError.message 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // 6. Auth 사용자 삭제 (선택사항)
      try {
        const { error: authDeleteError } = await supabaseClient.auth.admin.deleteUser(userId)
        if (authDeleteError) {
          console.log('Auth 사용자 삭제 실패 (무시됨):', authDeleteError)
        }
      } catch (authDeleteError) {
        console.log('Auth 사용자 삭제 실패 (무시됨):', authDeleteError)
      }

      console.log('회원 삭제 완료:', targetUser.email)

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: '회원이 성공적으로 삭제되었습니다.',
          deletedUser: {
            id: targetUser.id,
            email: targetUser.email,
            name: targetUser.name
          }
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } catch (deleteError) {
      console.error('삭제 과정 중 오류:', deleteError)
      return new Response(
        JSON.stringify({ 
          error: '회원 삭제 중 오류가 발생했습니다.',
          details: deleteError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('서버 오류:', error)
    return new Response(
      JSON.stringify({ 
        error: '서버 오류가 발생했습니다.',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})