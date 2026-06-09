// 신규 고객 채팅 메시지 → 관리자 알림 (텔레그램 우선, Resend 이메일 선택).
// DB 트리거(pg_net)에서 호출. 10분 내 연속 메시지는 1건만 알림(스로틀).
//
// 배포: supabase functions deploy notify-chat-message
//
// Secrets (텔레그램 — 권장):
//   TELEGRAM_BOT_TOKEN  — @BotFather 에서 발급
//   TELEGRAM_CHAT_ID    — 본인 chat id (getUpdates 로 확인)
//
// Secrets (이메일 — 선택):
//   RESEND_API_KEY, RESEND_FROM_EMAIL, ADMIN_NOTIFY_EMAIL, SITE_URL
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    throw new Error(`Telegram error: ${JSON.stringify(data)}`);
  }
}

async function sendResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend error: ${txt}`);
  }
}

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
    let customerEmail = conv.guest_email ?? "";
    if (conv.user_id) {
      const { data: prof } = await service
        .from("profiles").select("name, email").eq("id", conv.user_id).maybeSingle();
      if (prof) {
        customer = prof.name || prof.email || customer;
        customerEmail = prof.email || customerEmail;
      }
    }

    const preview = (conv.last_message_preview ?? "").trim();
    const siteUrl = (Deno.env.get("SITE_URL") || "https://copydrum.com").replace(/\/$/, "");
    const adminUrl = `${siteUrl}/admin`;

    const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
    const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID")?.trim();
    const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim();

    if (!telegramToken && !resendApiKey) {
      console.log("[notify-chat-message] TELEGRAM_BOT_TOKEN / RESEND_API_KEY 모두 미설정");
      return json(200, { success: true, skipped: "no-notification-channel" });
    }

    const sent: string[] = [];
    const errors: string[] = [];

    // ── 텔레그램 ──
    if (telegramToken && telegramChatId) {
      const lines = [
        "💬 <b>[카피드럼] 새 채팅 문의</b>",
        "",
        `👤 <b>${escapeHtml(customer)}</b>`,
      ];
      if (customerEmail) lines.push(`📧 ${escapeHtml(customerEmail)}`);
      if (preview) lines.push("", `💭 ${escapeHtml(preview)}`);
      lines.push("", `🔗 <a href="${adminUrl}">관리자 → 실시간 채팅</a>`);

      try {
        await sendTelegram(telegramToken, telegramChatId, lines.join("\n"));
        sent.push("telegram");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[notify-chat-message] telegram failed:", msg);
        errors.push(`telegram: ${msg}`);
      }
    }

    // ── 이메일 (선택) ──
    if (resendApiKey) {
      const adminEmail = Deno.env.get("ADMIN_NOTIFY_EMAIL") || "copydrum@hanmail.net";
      const html = `
        <p><strong>${escapeHtml(customer)}</strong> 님이 채팅 상담을 시작했습니다.</p>
        <p style="color:#555">"${escapeHtml(preview)}"</p>
        <p><a href="${adminUrl}">관리자 → 실시간 채팅에서 응답하기</a></p>
      `.trim();
      try {
        await sendResend(
          resendApiKey,
          Deno.env.get("RESEND_FROM_EMAIL") || "noreply@copydrum.com",
          adminEmail,
          `[카피드럼] 새 채팅 문의 - ${customer}`,
          html,
        );
        sent.push("email");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[notify-chat-message] email failed:", msg);
        errors.push(`email: ${msg}`);
      }
    }

    if (sent.length === 0) {
      return json(500, { success: false, error: errors.join("; ") || "all channels failed" });
    }

    return json(200, { success: true, sent, ...(errors.length ? { warnings: errors } : {}) });
  } catch (error) {
    console.error("[notify-chat-message]", error);
    return json(500, { success: false, error: error instanceof Error ? error.message : "error" });
  }
});
