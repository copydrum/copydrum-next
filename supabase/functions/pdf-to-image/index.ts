import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    const { pdfUrl } = await req.json()

    if (!pdfUrl) {
      return new Response(
        JSON.stringify({ error: 'PDF URL is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // PDF 파일 다운로드
    const pdfResponse = await fetch(pdfUrl)
    if (!pdfResponse.ok) {
      throw new Error('Failed to fetch PDF')
    }

    const pdfBuffer = await pdfResponse.arrayBuffer()

    // PDF-lib을 사용하여 첫 번째 페이지를 이미지로 변환
    const { PDFDocument } = await import('https://esm.sh/pdf-lib@1.17.1')
    
    const pdfDoc = await PDFDocument.load(pdfBuffer)
    const pages = pdfDoc.getPages()
    
    if (pages.length === 0) {
      throw new Error('PDF has no pages')
    }

    const firstPage = pages[0]
    const { width, height } = firstPage.getSize()

    // Canvas API를 사용하여 PDF 페이지를 이미지로 렌더링
    // 실제로는 pdf2pic 또는 유사한 라이브러리를 사용해야 하지만,
    // Edge Functions에서는 제한이 있으므로 대안적 접근 방식 사용
    
    // PDF.js를 사용한 렌더링 (브라우저 환경에서만 가능)
    // 서버 환경에서는 다른 방법 필요
    
    // 임시로 Canvas를 사용한 모자이크 처리 로직
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }

    // PDF 페이지를 캔버스에 그리기 (실제 구현에서는 PDF 렌더링 라이브러리 필요)
    // 여기서는 기본 이미지 생성 및 모자이크 처리만 구현
    
    // 모자이크 처리 함수
    const applyMosaic = (imageData: ImageData, blockSize: number = 20) => {
      const data = imageData.data
      const width = imageData.width
      const height = imageData.height
      
      // 하단 절반에만 모자이크 적용
      const startY = Math.floor(height / 2)
      
      for (let y = startY; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
          // 블록의 평균 색상 계산
          let r = 0, g = 0, b = 0, count = 0
          
          for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
            for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
              const idx = ((y + dy) * width + (x + dx)) * 4
              r += data[idx]
              g += data[idx + 1]
              b += data[idx + 2]
              count++
            }
          }
          
          if (count > 0) {
            r = Math.floor(r / count)
            g = Math.floor(g / count)
            b = Math.floor(b / count)
            
            // 블록 전체를 평균 색상으로 채우기
            for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
              for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
                const idx = ((y + dy) * width + (x + dx)) * 4
                data[idx] = r
                data[idx + 1] = g
                data[idx + 2] = b
              }
            }
          }
        }
      }
      
      return imageData
    }

    // 기본 이미지 데이터 생성 (실제로는 PDF 렌더링 결과 사용)
    const imageData = ctx.createImageData(width, height)
    
    // 임시 이미지 데이터 (실제로는 PDF 렌더링 결과)
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 255     // R
      imageData.data[i + 1] = 255 // G
      imageData.data[i + 2] = 255 // B
      imageData.data[i + 3] = 255 // A
    }
    
    // 모자이크 처리 적용
    const mosaicImageData = applyMosaic(imageData)
    
    // 캔버스에 이미지 데이터 적용
    ctx.putImageData(mosaicImageData, 0, 0)
    
    // 캔버스를 Blob으로 변환
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
    const arrayBuffer = await blob.arrayBuffer()
    
    // Supabase Storage에 이미지 업로드
    const fileName = `preview_${crypto.randomUUID()}.jpg`
    const filePath = `images/${fileName}`
    
    const { error: uploadError } = await supabaseClient.storage
      .from('drum-sheets')
      .upload(filePath, arrayBuffer, {
        contentType: 'image/jpeg'
      })
    
    if (uploadError) {
      throw uploadError
    }
    
    // 공개 URL 생성
    const { data } = supabaseClient.storage
      .from('drum-sheets')
      .getPublicUrl(filePath)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: data.publicUrl,
        fileName: fileName
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})