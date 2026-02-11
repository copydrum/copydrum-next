import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { artist, title } = await req.json()

    if (!artist || !title) {
      return new Response(
        JSON.stringify({ error: 'Artist and title are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Spotify API 키 (Secrets에서 가져오기)
    const clientId = Deno.env.get('SPOTIFY_CLIENT_ID') || 'db046dbd76114679881553a34aceb8f7'
    const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET') || '698e1882bcfa4607b804542ab25f0630'
    
    console.log('Spotify API 요청 시작:', { artist, title })
    
    // Spotify API 토큰 획득
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`
      },
      body: 'grant_type=client_credentials'
    })

    if (!tokenResponse.ok) {
      console.error('토큰 획득 실패:', tokenResponse.status)
      throw new Error(`Token request failed: ${tokenResponse.status}`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    if (!accessToken) {
      console.error('액세스 토큰이 없음')
      throw new Error('No access token received')
    }

    console.log('토큰 획득 성공')

    // Spotify에서 트랙 검색
    const searchQuery = `track:"${title}" artist:"${artist}"`
    console.log('검색 쿼리:', searchQuery)
    
    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    )

    if (!searchResponse.ok) {
      console.error('검색 요청 실패:', searchResponse.status)
      throw new Error(`Search request failed: ${searchResponse.status}`)
    }

    const searchData = await searchResponse.json()
    console.log('검색 결과:', searchData)
    
    if (searchData.tracks?.items?.length > 0) {
      const track = searchData.tracks.items[0]
      const albumImage = track.album.images?.[0]?.url
      
      console.log('앨범 이미지 찾음:', albumImage)
      
      if (albumImage) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            imageUrl: albumImage,
            source: 'spotify',
            trackName: track.name,
            artistName: track.artists[0]?.name
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    console.log('Spotify에서 앨범 커버를 찾지 못함')
    
    // Spotify에서 찾지 못한 경우 null 반환
    return new Response(
      JSON.stringify({ 
        success: false, 
        imageUrl: null,
        message: 'No album cover found on Spotify'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        imageUrl: null
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})