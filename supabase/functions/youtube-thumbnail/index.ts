import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
    const { youtubeUrl } = await req.json()

    if (!youtubeUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'YouTube URL is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Extract video ID from YouTube URL
    const videoId = extractVideoId(youtubeUrl)
    
    if (!videoId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid YouTube URL' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Get high quality thumbnail URL
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    
    // Verify thumbnail exists by making a HEAD request
    try {
      const thumbnailResponse = await fetch(thumbnailUrl, { method: 'HEAD' })
      
      if (thumbnailResponse.ok) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            thumbnailUrl: thumbnailUrl,
            videoId: videoId
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      } else {
        // Fallback to standard quality thumbnail
        const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        return new Response(
          JSON.stringify({ 
            success: true, 
            thumbnailUrl: fallbackUrl,
            videoId: videoId
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    } catch (error) {
      // If thumbnail check fails, still return the URL
      return new Response(
        JSON.stringify({ 
          success: true, 
          thumbnailUrl: thumbnailUrl,
          videoId: videoId
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

  } catch (error) {
    console.error('YouTube thumbnail error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

function extractVideoId(url: string): string | null {
  // Handle various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return null
}