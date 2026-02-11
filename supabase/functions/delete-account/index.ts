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
    // JWT 토큰에서 사용자 정보 추출
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: '인증이 필요합니다.' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    
    // Supabase 클라이언트 생성 (Service Role Key 사용)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
    
    // 토큰으로 사용자 확인
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

    const userId = user.id
    console.log('회원탈퇴 요청:', userId)

    // 관련 데이터 순서대로 삭제 (외래키 제약 조건 고려)
    try {
      // 1. 즐겨찾기 삭제
      const { error: favoriteError } = await supabaseClient
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)

      if (favoriteError) {
        console.error('즐겨찾기 삭제 오류:', favoriteError)
      }

      // 2. 장바구니 아이템 삭제
      const { error: cartError } = await supabaseClient
        .from('cart_items')
        .delete()
        .eq('user_id', userId)

      if (cartError) {
        console.error('장바구니 삭제 오류:', cartError)
      }

      // 3. 고객 문의 삭제
      const { error: inquiryError } = await supabaseClient
        .from('customer_inquiries')
        .delete()
        .eq('user_id', userId)

      if (inquiryError) {
        console.error('고객 문의 삭제 오류:', inquiryError)
      }

      // 4. 맞춤 주문 삭제
      const { error: customOrderError } = await supabaseClient
        .from('custom_orders')
        .delete()
        .eq('user_id', userId)

      if (customOrderError) {
        console.error('맞춤 주문 삭제 오류:', customOrderError)
      }

      // 5. 주문 삭제 (order_items는 CASCADE로 자동 삭제됨)
      const { error: orderError } = await supabaseClient
        .from('orders')
        .delete()
        .eq('user_id', userId)

      if (orderError) {
        console.error('주문 삭제 오류:', orderError)
      }

      // 6. 프로필 삭제
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .delete()
        .eq('id', userId)

      if (profileError) {
        console.error('프로필 삭제 오류:', profileError)
        return new Response(
          JSON.stringify({ 
            error: '회원탈퇴 중 오류가 발생했습니다.',
            details: profileError.message 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // 7. Auth 사용자 삭제
      const { error: authDeleteError } = await supabaseClient.auth.admin.deleteUser(userId)
      
      if (authDeleteError) {
        console.error('Auth 사용자 삭제 오류:', authDeleteError)
        return new Response(
          JSON.stringify({ 
            error: '계정 삭제에 실패했습니다.',
            details: authDeleteError.message 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('회원탈퇴 완료:', userId)

      return new Response(
        JSON.stringify({ 
          success: true,
          message: '회원탈퇴가 완료되었습니다.'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )

    } catch (error) {
      console.error('회원탈퇴 처리 중 오류:', error)
      return new Response(
        JSON.stringify({ 
          error: '회원탈퇴 중 오류가 발생했습니다.',
          details: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('회원탈퇴 오류:', error)
    return new Response(
      JSON.stringify({ 
        error: '회원탈퇴 중 오류가 발생했습니다.',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

