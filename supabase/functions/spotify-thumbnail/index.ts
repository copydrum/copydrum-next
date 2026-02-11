import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SPOTIFY_CLIENT_ID = 'db046dbd76114679881553a34aceb8f7'
const SPOTIFY_CLIENT_SECRET = '698e1882bcfa4607b804542ab25f0630'

let accessToken: string | null = null

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { artist, title, sheetId } = await req.json()

    if (!artist || !title) {
      return new Response(
        JSON.stringify({ error: 'Artist and title are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Spotify 썸네일 검색 시작:', { artist, title })

    // Spotify 액세스 토큰 가져오기
    const token = await getAccessToken()
    
    // Spotify에서 곡 검색
    const query = `artist:"${artist}" track:"${title}"`
    const encodedQuery = encodeURIComponent(query)

    const searchResponse = await fetch(
      `https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=1`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )

    if (!searchResponse.ok) {
      console.log('Spotify 검색 실패, 기본 썸네일 생성')
      return await generateDefaultThumbnail(supabaseClient, artist, title, sheetId)
    }

    const searchData = await searchResponse.json()
    
    if (searchData.tracks?.items?.length > 0) {
      const track = searchData.tracks.items[0]
      
      if (track.album?.images?.length > 0) {
        // 가장 큰 이미지 선택
        const largestImage = track.album.images.reduce((prev: any, current: any) => 
          (prev.width > current.width) ? prev : current
        )
        
        console.log('Spotify 앨범 커버 발견:', largestImage.url)
        
        // 이미지 다운로드 및 Supabase에 업로드
        const imageResponse = await fetch(largestImage.url)
        if (imageResponse.ok) {
          const imageBuffer = await imageResponse.arrayBuffer()
          
          const fileName = `thumbnail_${sheetId || crypto.randomUUID()}.jpg`
          const filePath = `thumbnails/${fileName}`
          
          const { error: uploadError } = await supabaseClient.storage
            .from('drum-sheets')
            .upload(filePath, imageBuffer, {
              contentType: 'image/jpeg',
              upsert: true
            })
          
          if (!uploadError) {
            const { data } = supabaseClient.storage
              .from('drum-sheets')
              .getPublicUrl(filePath)
            
            return new Response(
              JSON.stringify({ 
                success: true, 
                thumbnailUrl: data.publicUrl,
                source: 'spotify',
                albumName: track.album.name
              }),
              { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            )
          }
        }
      }
    }
    
    console.log('Spotify에서 이미지를 찾을 수 없음, 기본 썸네일 생성')
    return await generateDefaultThumbnail(supabaseClient, artist, title, sheetId)

  } catch (error) {
    console.error('Spotify 썸네일 생성 오류:', error)
    
    // 오류 발생시 기본 썸네일 생성
    try {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      )
      
      const { artist, title, sheetId } = await req.json()
      return await generateDefaultThumbnail(supabaseClient, artist, title, sheetId)
    } catch (fallbackError) {
      return new Response(
        JSON.stringify({ error: fallbackError.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
  }
})

// Spotify 액세스 토큰 가져오기
async function getAccessToken(): Promise<string> {
  if (accessToken) return accessToken

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`
    },
    body: 'grant_type=client_credentials'
  })

  const data = await response.json()
  accessToken = data.access_token
  return accessToken
}

// 기본 썸네일 생성 (COPYDRUM DRUM SHEET 텍스트)
async function generateDefaultThumbnail(
  supabaseClient: any, 
  artist: string, 
  title: string, 
  sheetId?: string
) {
  console.log('기본 썸네일 생성 시작')
  
  const width = 400
  const height = 400
  
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // 그라데이션 배경
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, '#1e3a8a')  // 진한 파란색
  gradient.addColorStop(1, '#3b82f6')  // 밝은 파란색
  
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  
  // 메인 텍스트
  ctx.fillStyle = 'white'
  ctx.font = 'bold 32px Arial'
  ctx.textAlign = 'center'
  ctx.fillText('COPYDRUM', width / 2, height / 2 - 20)
  
  ctx.font = 'bold 24px Arial'
  ctx.fillText('DRUM SHEET', width / 2, height / 2 + 20)
  
  // 아티스트와 제목 추가
  ctx.font = '16px Arial'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  
  // 텍스트가 너무 길면 줄임
  const maxLength = 25
  const displayArtist = artist.length > maxLength ? artist.substring(0, maxLength) + '...' : artist
  const displayTitle = title.length > maxLength ? title.substring(0, maxLength) + '...' : title
  
  ctx.fillText(displayArtist, width / 2, height / 2 + 60)
  ctx.fillText(displayTitle, width / 2, height / 2 + 80)
  
  // 드럼 아이콘 추가 (간단한 원형)
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(width / 2, height / 2 - 80, 30, 0, 2 * Math.PI)
  ctx.stroke()
  
  ctx.beginPath()
  ctx.arc(width / 2, height / 2 - 80, 20, 0, 2 * Math.PI)
  ctx.stroke()
  
  // 캔버스를 Blob으로 변환
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  const arrayBuffer = await blob.arrayBuffer()
  
  // Supabase Storage에 업로드
  const fileName = `thumbnail_${sheetId || crypto.randomUUID()}.jpg`
  const filePath = `thumbnails/${fileName}`
  
  const { error: uploadError } = await supabaseClient.storage
    .from('drum-sheets')
    .upload(filePath, arrayBuffer, {
      contentType: 'image/jpeg',
      upsert: true
    })
  
  if (uploadError) {
    throw uploadError
  }
  
  const { data } = supabaseClient.storage
    .from('drum-sheets')
    .getPublicUrl(filePath)
  
  console.log('기본 썸네일 생성 완료:', data.publicUrl)
  
  return new Response(
    JSON.stringify({ 
      success: true, 
      thumbnailUrl: data.publicUrl,
      source: 'default'
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  )
}