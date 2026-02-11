import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { provider, userInfo } = await req.json()
    
    console.log('=== 소셜 로그인 요청 시작 ===')
    console.log('Provider:', provider)
    console.log('UserInfo:', JSON.stringify(userInfo, null, 2))

    // Supabase 클라이언트 초기화 (서비스 롤 키 사용)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    let email: string
    let name: string
    let socialId: string

    // 제공자별 데이터 처리 - 한글 이름 직접 처리
    if (provider === 'kakao') {
      email = userInfo.kakao_account?.email
      // 카카오 닉네임 - 한글 이름 그대로 사용
      const kakaoNickname = userInfo.kakao_account?.profile?.nickname || userInfo.properties?.nickname
      name = kakaoNickname || '카카오 사용자'
      socialId = userInfo.id?.toString()
      
      console.log('카카오 데이터 추출:', { email, name, socialId })
      console.log('원본 닉네임:', kakaoNickname, '처리된 이름:', name)
    } else if (provider === 'google') {
      email = userInfo.email
      // 구글 이름 - 한글 이름 그대로 사용
      const googleName = userInfo.name || userInfo.given_name
      name = googleName || '구글 사용자'
      socialId = userInfo.id?.toString()
      
      console.log('구글 데이터 추출:', { email, name, socialId })
      console.log('원본 이름:', googleName, '처리된 이름:', name)
    } else {
      throw new Error('지원하지 않는 소셜 로그인 제공자입니다.')
    }

    if (!email) {
      console.error('이메일 정보 없음:', { provider, userInfo })
      throw new Error(`${provider} 계정에서 이메일 정보를 가져올 수 없습니다.`)
    }

    if (!socialId) {
      console.error('소셜 ID 정보 없음:', { provider, userInfo })
      throw new Error(`${provider} 계정에서 ID 정보를 가져올 수 없습니다.`)
    }

    console.log('처리할 사용자 정보:', { email, name, socialId, provider })

    // 기존 사용자 확인 (이메일 또는 소셜 ID로)
    const socialIdColumn = provider === 'kakao' ? 'kakao_id' : 'google_id'
    
    const { data: existingProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .or(`email.eq.${email},${socialIdColumn}.eq.${socialId}`)

    if (profileError) {
      console.error('프로필 조회 오류:', profileError)
      throw new Error('사용자 정보 조회 중 오류가 발생했습니다.')
    }

    console.log('기존 프로필 조회 결과:', existingProfiles)

    let userId: string
    let isNewUser = false

    if (existingProfiles && existingProfiles.length > 0) {
      // 기존 사용자 - 소셜 ID와 이름 업데이트
      const existingProfile = existingProfiles[0]
      console.log('기존 사용자 발견, 정보 업데이트:', existingProfile.id)
      
      const updateData: any = {
        name: name, // 한글 이름 그대로 저장
        provider: provider,
        updated_at: new Date().toISOString()
      }
      
      // 소셜 ID 설정
      if (provider === 'kakao') {
        updateData.kakao_id = socialId
      } else if (provider === 'google') {
        updateData.google_id = socialId
      }
      
      console.log('업데이트할 데이터:', updateData)

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', existingProfile.id)

      if (updateError) {
        console.error('프로필 업데이트 오류:', updateError)
        throw new Error('사용자 정보 업데이트 중 오류가 발생했습니다.')
      }

      console.log('프로필 업데이트 완료')
      userId = existingProfile.id
    } else {
      // 새 사용자 - Auth 사용자 생성 후 프로필 생성
      console.log('새 사용자 생성 중...')
      isNewUser = true
      
      // 임시 비밀번호 생성
      const tempPassword = `${provider}_${socialId}_${Date.now()}`
      
      // Supabase Auth에 사용자 생성
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true, // 이메일 확인 없이 바로 활성화
        user_metadata: {
          name: name,
          provider: provider,
          social_id: socialId
        }
      })

      if (authError) {
        console.error('Auth 사용자 생성 오류:', authError)
        throw new Error('사용자 계정 생성 중 오류가 발생했습니다.')
      }

      userId = authData.user.id
      console.log('Auth 사용자 생성 완료:', userId)

      // 프로필 테이블에 사용자 정보 저장
      const insertData: any = {
        id: userId,
        email: email,
        name: name, // 한글 이름 그대로 저장
        provider: provider,
        role: 'user',
        is_admin: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      
      // 소셜 ID 설정
      if (provider === 'kakao') {
        insertData.kakao_id = socialId
      } else if (provider === 'google') {
        insertData.google_id = socialId
      }
      
      console.log('삽입할 프로필 데이터:', insertData)

      const { error: insertError } = await supabase
        .from('profiles')
        .insert(insertData)

      if (insertError) {
        console.error('프로필 생성 오류:', insertError)
        throw new Error('사용자 프로필 생성 중 오류가 발생했습니다.')
      }
      
      console.log('프로필 생성 완료')
    }

    // 최종 확인 - 소셜 ID와 이름이 제대로 저장되었는지 확인
    const { data: finalProfile, error: finalError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (finalError) {
      console.error('최종 프로필 확인 오류:', finalError)
    } else {
      console.log('최종 저장된 프로필:', finalProfile)
      console.log('저장된 이름 확인:', finalProfile.name)
      console.log('저장된 소셜 ID 확인:', {
        kakao_id: finalProfile.kakao_id,
        google_id: finalProfile.google_id
      })
    }

    // 로그인을 위한 세션 토큰 생성
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `${req.headers.get('origin') || 'http://localhost:5173'}/`
      }
    })

    if (sessionError) {
      console.error('세션 생성 오류:', sessionError)
      throw new Error('로그인 세션 생성 중 오류가 발생했습니다.')
    }

    console.log('=== 소셜 로그인 처리 완료 ===')
    console.log('결과:', { userId, email, name, provider, isNewUser })

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email: email,
          name: name,
          provider: provider,
          isNewUser: isNewUser
        },
        authUrl: sessionData.properties?.action_link
      }),
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json; charset=utf-8'
        },
        status: 200,
      },
    )

  } catch (error) {
    console.error('=== 소셜 로그인 처리 오류 ===')
    console.error('Error:', error)
    console.error('Stack:', error.stack)
    
    return new Response(
      JSON.stringify({
        error: error.message || '소셜 로그인 처리 중 오류가 발생했습니다.',
        details: error.stack
      }),
      {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json; charset=utf-8'
        },
        status: 400,
      },
    )
  }
})