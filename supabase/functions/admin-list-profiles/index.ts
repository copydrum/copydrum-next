import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('Missing authorization header')
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '')
    console.log('Token received, length:', token.length)
    
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasAnonKey: !!supabaseAnonKey,
        hasServiceKey: !!supabaseServiceKey
      })
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify JWT and get user
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
    
    if (authError) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token', details: authError.message }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!user) {
      console.error('No user found from token')
      return new Response(
        JSON.stringify({ error: 'No user found from token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Authenticated user:', user.id, user.email)

    // Create service role client for admin operations
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey)
    
    // Check if user profile exists and get role
    const { data: profile, error: profileError } = await supabaseService
      .from('profiles')
      .select('id, email, name, role, created_at')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      console.error('Profile fetch error:', profileError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to verify user profile', 
          details: profileError.message,
          userId: user.id 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!profile) {
      console.error('No profile found for user:', user.id, user.email)
      // Try to create profile if it doesn't exist with proper name handling
      // 이름 우선순위: user_metadata.name > full_name > 이메일 앞부분 > '사용자'
      let userName = user.user_metadata?.name || 
                     user.user_metadata?.full_name || 
                     (user.email ? user.email.split('@')[0] : '사용자')
      
      // Ensure name is not empty or null (trim 후에도 빈 문자열이면 이메일 앞부분 사용)
      if (!userName || userName.trim() === '') {
        userName = user.email ? user.email.split('@')[0] : '사용자'
      }
      
      console.log('Attempting to create profile with name:', userName)
      
      const { data: newProfile, error: createError } = await supabaseService
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email || '',
          name: userName.trim(), // Ensure name is properly trimmed and not null
          role: 'user' // Default role
        })
        .select()
        .single()

      if (createError) {
        console.error('Failed to create profile:', createError)
        return new Response(
          JSON.stringify({ 
            error: 'Profile not found and failed to create', 
            details: createError.message,
            userId: user.id,
            attemptedName: userName,
            userMetadata: user.user_metadata
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('Created new profile for user:', user.id, 'with name:', userName)
      return new Response(
        JSON.stringify({ 
          error: 'Profile created but admin access required', 
          message: '프로필이 생성되었지만 관리자 권한이 필요합니다. 관리자에게 문의하여 권한을 설정받으세요.',
          newProfile: newProfile
        }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('User profile found:', profile.id, profile.email, 'role:', profile.role)

    if (profile.role !== 'admin') {
      console.log('Access denied - user role:', profile.role, 'for user:', user.email)
      return new Response(
        JSON.stringify({ 
          error: 'Admin access required', 
          currentRole: profile.role,
          message: '관리자 권한이 필요합니다. 현재 권한: ' + profile.role
        }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Admin access verified for:', user.email)

    // Parse request body for pagination parameters
    let page = 1
    let limit = 100  // 기본값을 100으로 설정 (한 페이지에 100명)
    let offset = 0

    try {
      const body = await req.json()
      if (body.page && body.page > 0) {
        page = body.page
      }
      if (body.limit && body.limit > 0 && body.limit <= 1000) {
        limit = body.limit
      }
      offset = (page - 1) * limit
    } catch (e) {
      // If no body or invalid JSON, use defaults
      console.log('Using default parameters: page = 1, limit = 100')
    }

    console.log('Pagination params:', { page, limit, offset })

    // Get total count first - 정확한 총 회원수를 위한 카운트 쿼리
    const { count: totalCount, error: countError } = await supabaseService
      .from('profiles')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      console.error('Count fetch error:', countError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch profiles count', 
          details: countError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Total profiles count:', totalCount)

    // Fetch profiles with pagination
    const { data: profiles, error: fetchError } = await supabaseService
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (fetchError) {
      console.error('Profiles fetch error:', fetchError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch profiles', 
          details: fetchError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const totalPages = Math.ceil((totalCount || 0) / limit)

    console.log('Successfully fetched profiles:', {
      page,
      limit,
      offset,
      returned: profiles?.length || 0,
      total: totalCount,
      totalPages
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: profiles || [],
        pagination: {
          page,
          limit,
          offset,
          total: totalCount || 0,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        count: profiles?.length || 0,
        totalCount: totalCount || 0,
        adminUser: {
          id: user.id,
          email: user.email,
          role: profile.role
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})