import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * 선주문 완료 알림 이메일 발송 함수
 * 
 * 요청 본문:
 * {
 *   email: "user@example.com",
 *   title: "곡명",
 *   artist: "아티스트명"
 * }
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, title, artist } = await req.json();

    if (!email || !title || !artist) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'email, title, artist는 필수 필드입니다.' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 이메일 발송 로직
    // 프로젝트에 설정된 이메일 서비스를 사용 (Resend, Nodemailer 등)
    // 여기서는 Supabase의 내장 이메일 기능이나 외부 서비스를 호출할 수 있습니다.

    // 예시: Resend API 사용 (환경변수에서 API 키 가져오기)
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    if (resendApiKey) {
      const emailSubject = `[카피드럼] 주문하신 ${title} 악보 채보가 완료되었습니다!`;
      const emailBody = `
안녕하세요, 카피드럼입니다.

주문하신 ${artist} - ${title} 드럼 악보의 채보 작업이 완료되었습니다!

이제 카피드럼 마이페이지에서 바로 다운로드하실 수 있습니다.
아래 링크에서 확인해 주세요:

마이페이지: ${Deno.env.get('SITE_URL') || 'https://copydrum.com'}/mypage

감사합니다.
카피드럼 팀
      `.trim();

      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@copydrum.com',
          to: [email],
          subject: emailSubject,
          html: emailBody.replace(/\n/g, '<br>'),
        }),
      });

      if (!resendResponse.ok) {
        const errorText = await resendResponse.text();
        throw new Error(`Resend API 오류: ${errorText}`);
      }

      console.log(`[send-preorder-completion-email] ✅ 이메일 발송 성공: ${email}`);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: '이메일이 발송되었습니다.'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    } else {
      // Resend API 키가 없으면 로그만 남기고 성공으로 처리
      console.log(`[send-preorder-completion-email] ⚠️ RESEND_API_KEY가 설정되지 않아 이메일 발송을 건너뜁니다.`);
      console.log(`[send-preorder-completion-email] 📧 이메일 내용 (${email}):`);
      console.log(`제목: [카피드럼] 주문하신 ${title} 악보 채보가 완료되었습니다!`);
      console.log(`내용: 주문하신 ${artist} - ${title} 드럼 악보의 채보 작업이 완료되었습니다!`);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: '이메일 발송이 건너뛰어졌습니다. (RESEND_API_KEY 미설정)'
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('[send-preorder-completion-email] ❌ 오류:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
