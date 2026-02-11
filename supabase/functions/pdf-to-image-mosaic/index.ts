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
    console.log('[pdf-to-image-mosaic] 요청 시작')
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const requestBody = await req.json()
    const { pdfUrl, sheetId } = requestBody

    console.log('[pdf-to-image-mosaic] 입력 파라미터:', { pdfUrl: pdfUrl?.substring(0, 100), sheetId })

    if (!pdfUrl) {
      console.error('[pdf-to-image-mosaic] PDF URL이 제공되지 않음')
      return new Response(
        JSON.stringify({ error: 'PDF URL is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('[pdf-to-image-mosaic] PDF 다운로드 시작:', pdfUrl)

    // PDF 파일 다운로드
    const pdfResponse = await fetch(pdfUrl)
    if (!pdfResponse.ok) {
      const errorMsg = `PDF 다운로드 실패: ${pdfResponse.status} ${pdfResponse.statusText}`
      console.error('[pdf-to-image-mosaic]', errorMsg)
      throw new Error(errorMsg)
    }

    const pdfBuffer = await pdfResponse.arrayBuffer()
    console.log('[pdf-to-image-mosaic] PDF 다운로드 완료, 크기:', pdfBuffer.byteLength, 'bytes')

    // PDF-lib을 사용하여 PDF 정보 읽기
    const { PDFDocument } = await import('https://esm.sh/pdf-lib@1.17.1')
    
    let pdfDoc
    let width = 595  // 기본 A4 width
    let height = 842 // 기본 A4 height
    let pageCount = 0
    
    try {
      pdfDoc = await PDFDocument.load(pdfBuffer)
      const pages = pdfDoc.getPages()
      pageCount = pages.length
      
      if (pages.length > 0) {
        const firstPage = pages[0]
        const size = firstPage.getSize()
        width = size.width
        height = size.height
        console.log('[pdf-to-image-mosaic] PDF 정보:', { 
          pageCount, 
          width: Math.round(width), 
          height: Math.round(height) 
        })
      }
    } catch (pdfError) {
      console.warn('[pdf-to-image-mosaic] PDF 파싱 오류, 기본 크기 사용:', pdfError)
      // PDF 파싱 실패 시 기본 크기 사용
    }
    
    // SVG 생성 (모자이크 효과 포함, PDF 정보 반영)
    const svgContent = generatePreviewSVG(width, height, pageCount)
    
    // SVG를 PNG로 변환하기 위해 외부 서비스나 라이브러리 필요
    // 일단 SVG를 직접 저장하거나, 간단한 이미지 생성 방법 사용
    // 여기서는 SVG를 base64로 인코딩하여 데이터 URL로 사용하거나
    // 또는 간단한 JPEG 이미지를 생성
    
    // SVG를 Blob으로 변환
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' })
    const svgArrayBuffer = await svgBlob.arrayBuffer()
    
    console.log('[pdf-to-image-mosaic] SVG 생성 완료, 크기:', svgArrayBuffer.byteLength, 'bytes')
    
    // Supabase Storage에 SVG 이미지 업로드 (또는 PNG로 변환 필요)
    // 일단 SVG로 저장 (브라우저에서 렌더링 가능)
    const fileName = `preview_${sheetId || crypto.randomUUID()}.svg`
    const filePath = `previews/${fileName}`
    
    console.log('[pdf-to-image-mosaic] Storage 업로드 시작, 버킷: drum-sheets, 경로:', filePath)
    
    const { error: uploadError } = await supabaseClient.storage
      .from('drum-sheets')
      .upload(filePath, svgArrayBuffer, {
        contentType: 'image/svg+xml',
        upsert: true
      })
    
    if (uploadError) {
      console.error('[pdf-to-image-mosaic] Storage 업로드 오류:', {
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        error: uploadError
      })
      throw new Error(`Storage 업로드 실패: ${uploadError.message}`)
    }
    
    // 공개 URL 생성
    const { data: urlData, error: urlError } = supabaseClient.storage
      .from('drum-sheets')
      .getPublicUrl(filePath)
    
    if (urlError) {
      console.error('[pdf-to-image-mosaic] 공개 URL 생성 오류:', urlError)
      throw new Error(`공개 URL 생성 실패: ${urlError.message}`)
    }
    
    console.log('[pdf-to-image-mosaic] 이미지 업로드 완료:', urlData.publicUrl)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: urlData.publicUrl,
        fileName: fileName
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    
    console.error('[pdf-to-image-mosaic] PDF 변환 오류:', {
      message: errorMessage,
      stack: errorStack,
      error: error
    })
    
    return new Response(
      JSON.stringify({ 
        error: 'PDF to image conversion failed',
        details: errorMessage,
        // 개발 환경에서만 스택 트레이스 포함
        ...(Deno.env.get('ENVIRONMENT') === 'development' && { stack: errorStack })
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// SVG 미리보기 이미지 생성 함수 (모자이크 효과 포함)
function generatePreviewSVG(width: number, height: number, pageCount: number = 0): string {
  const blockSize = 15 // 모자이크 블록 크기 (더 작게)
  const startY = Math.floor(height * 0.4) // 상단 40%는 미리보기, 하단 60%는 모자이크
  
  // SVG 요소 생성 (viewBox 사용으로 반응형)
  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`
  
  // 흰색 배경
  svg += `<rect width="${width}" height="${height}" fill="white"/>`
  
  // 상단: 악보 미리보기 영역
  const previewAreaHeight = startY
  
  // 제목
  svg += `<text x="${width / 2}" y="40" font-family="Arial, sans-serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#1a1a1a">DRUM SHEET PREVIEW</text>`
  
  // 페이지 정보 (있는 경우)
  if (pageCount > 0) {
    svg += `<text x="${width / 2}" y="65" font-family="Arial, sans-serif" font-size="12" text-anchor="middle" fill="#666">${pageCount} 페이지</text>`
  }
  
  // 오선보 라인 (더 정확한 위치)
  const staffStartY = 90
  const staffLeft = width * 0.1
  const staffRight = width * 0.9
  const lineSpacing = 15
  
  for (let i = 0; i < 5; i++) {
    const y = staffStartY + (i * lineSpacing)
    svg += `<line x1="${staffLeft}" y1="${y}" x2="${staffRight}" y2="${y}" stroke="#000" stroke-width="1.5"/>`
  }
  
  // 음표 시뮬레이션 (더 자연스럽게)
  const noteCount = Math.min(12, Math.floor((staffRight - staffLeft) / 40))
  for (let i = 0; i < noteCount; i++) {
    const x = staffLeft + 30 + (i * ((staffRight - staffLeft - 60) / (noteCount - 1)))
    // 오선보 범위 내에서 랜덤 위치
    const baseY = staffStartY + (lineSpacing * 2)
    const y = baseY + (Math.sin(i * 0.8) * lineSpacing * 1.5)
    svg += `<circle cx="${x}" cy="${y}" r="6" fill="#000"/>`
    // 음표 줄기
    const stemLength = 25
    const stemX = x + 6
    svg += `<line x1="${stemX}" y1="${y - 8}" x2="${stemX}" y2="${y + stemLength}" stroke="#000" stroke-width="1.5"/>`
  }
  
  // 구분선 (미리보기와 모자이크 영역)
  svg += `<line x1="0" y1="${startY}" x2="${width}" y2="${startY}" stroke="#ccc" stroke-width="2" stroke-dasharray="5,5"/>`
  
  // 하단: 모자이크 효과 (더 자연스러운 그라데이션)
  // 모자이크 블록 생성 (더 작은 블록으로 더 세밀하게)
  for (let y = startY + 5; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      // 그라데이션 효과를 위한 색상 계산
      // 중앙에서 멀어질수록 더 어두워지는 효과
      const centerX = width / 2
      const centerY = (startY + height) / 2
      const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2))
      const maxDistance = Math.sqrt(Math.pow(width, 2) + Math.pow(height - startY, 2))
      const ratio = distance / maxDistance
      
      // 회색 톤 (120-200 범위, 중앙은 밝고 가장자리는 어둡게)
      const gray = Math.floor(200 - (ratio * 80))
      const blockHeight = Math.min(blockSize, height - y)
      const blockWidth = Math.min(blockSize, width - x)
      
      // 약간의 랜덤성 추가
      const randomVariation = Math.floor(Math.random() * 20) - 10
      const finalGray = Math.max(100, Math.min(220, gray + randomVariation))
      
      svg += `<rect x="${x}" y="${y}" width="${blockWidth}" height="${blockHeight}" fill="rgb(${finalGray}, ${finalGray}, ${finalGray})" opacity="0.9"/>`
    }
  }
  
  // 하단 텍스트 (모자이크 영역)
  svg += `<text x="${width / 2}" y="${height - 20}" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#999" opacity="0.7">미리보기 (하단 모자이크 처리)</text>`
  
  svg += `</svg>`
  
  return svg
}