// 신규 고객 채팅 메시지가 들어오면 관리자에게 이메일 알림.
// DB 트리거(pg_net)에서 호출되며, 짧은 시간 내 연속 메시지는 1건만 알림(스로틀).
//
// 배포: supabase functions deploy notify-chat-message
// 필요한 환경변수: RESEND_API_KEY, (선택) RESEND_FROM_EMAIL, SITE_URL, ADMIN_NOTIFY_EMAIL
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json(500, { success: false, error: "Missing config" });

    const payload = await req.json().catch(() => ({}));
    const conversationId = String(payload.conversationId ?? "").trim();
    if (!conversationId) return json(400, { success: false, error: "Missing conversationId" });

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 스로틀: 최근 10분 내 이 대화의 고객 메시지가 2건 이상이면(=연속 입력) 알림 생략
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await service
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("sender_type", "user")
      .gt("created_at", tenMinAgo);
    if ((count ?? 0) > 1) return json(200, { success: true, skipped: "throttled" });

    const { data: conv } = await service
      .from("chat_conversations")
      .select("id, guest_name, guest_email, user_id, last_message_preview")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) return json(404, { success: false, error: "conversation not found" });

    let customer = conv.guest_name || conv.guest_email || "회원";
    if (!conv.guest_email && conv.user_id) {
      const { data: prof } = await service
        .from("profiles").select("name, email").eq("id", conv.user_id).maybeSingle();
      customer = prof?.name || prof?.email || customer;
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = Deno.env.get("ADMIN_NOTIFY_EMAIL") || "copydrum@hanmail.net";
    const siteUrl = Deno.env.get("SITE_URL") || "https://copydrum.com";

    if (!resendApiKey) {
      console.log("[notify-chat-message] RESEND_API_KEY 미설정 — 알림 생략", { conversationId, customer });
      return json(200, { success: true, skipped: "no-resend-key" });
    }

    const html = `
      <p><strong>${customer}</strong> 님이 채팅 상담을 시작했습니다.</p>
      <p style="color:#555">"${(conv.last_message_preview ?? "").replace(/</g, "&lt;")}"</p>
      <p><a href="${siteUrl}/admin">관리자 → 실시간 채팅에서 응답하기</a></p>
    `.trim();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM_EMAIL") || "noreply@copydrum.com",
        to: [adminEmail],
        subject: `[카피드럼] 새 채팅 문의 - ${customer}`,
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Resend error: ${txt}`);
    }

    return json(200, { success: true });
  } catch (error) {
    console.error("[notify-chat-message]", error);
    return json(500, { success: false, error: error instanceof Error ? error.message : "error" });
  }
});
