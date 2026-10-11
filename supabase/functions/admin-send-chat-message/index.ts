// 관리자 → 채팅 메시지 전송 / 대화 상태 변경 / 읽음 처리.
// 권한: 호출자의 JWT 로 profiles.is_admin 또는 role='admin' 인지 검증 후 service role 로 기록.
//
// 답변 전송 시 고객이 채팅을 보고 있지 않으면 답변 알림 이메일을 보낸다 (Resend).
// Secrets: RESEND_API_KEY, RESEND_FROM_EMAIL(선택), SITE_URL(선택)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** 고객이 이 시간 안에 채팅을 봤다면 지금 화면에서 답변을 보고 있는 것으로 간주 */
const SEEN_RECENTLY_MS = 45 * 1000;
/** 같은 대화에 답변 이메일은 이 간격 안에 한 번만 */
const REPLY_EMAIL_THROTTLE_MS = 10 * 60 * 1000;

const LOCALE_PATH: Record<string, string> = { "zh-CN": "zh-cn", "zh-TW": "zh-tw" };

interface ReplyEmailCopy {
  subject: string;
  heading: string;
  button: string;
  footer: string;
}

const REPLY_EMAIL_COPY: Record<string, ReplyEmailCopy> = {
  ko: {
    subject: "[카피드럼] 문의하신 내용에 답변이 도착했어요",
    heading: "카피드럼 고객센터에서 답변을 남겼어요.",
    button: "채팅에서 답변 확인하기",
    footer: "이 메일은 카피드럼 채팅 상담에 답변이 등록되어 발송되었습니다.",
  },
  en: {
    subject: "[CopyDrum] You have a reply from our support team",
    heading: "CopyDrum Support replied to your message.",
    button: "View reply in chat",
    footer: "You received this email because we replied to your CopyDrum chat.",
  },
  ja: {
    subject: "[CopyDrum] お問い合わせへの返信が届きました",
    heading: "CopyDrumサポートから返信がありました。",
    button: "チャットで返信を確認する",
    footer: "このメールは、CopyDrumのチャットに返信が登録されたため送信されました。",
  },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 고객에게 답변 알림 이메일 발송. 조건이 맞지 않거나 설정이 없으면 조용히 건너뛴다. */
async function maybeSendReplyEmail(
  service: SupabaseClient,
  conversationId: string,
  message: string,
): Promise<string> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendApiKey) return "skipped(no-resend-key)";

  const { data: conv, error } = await service
    .from("chat_conversations")
    .select("id, user_id, guest_email, guest_token, locale, user_last_seen_at, reply_email_sent_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !conv) return "skipped(no-conversation-columns)";

  const now = Date.now();
  if (conv.user_last_seen_at && now - new Date(conv.user_last_seen_at).getTime() < SEEN_RECENTLY_MS) {
    return "skipped(customer-watching)";
  }
  if (conv.reply_email_sent_at && now - new Date(conv.reply_email_sent_at).getTime() < REPLY_EMAIL_THROTTLE_MS) {
    return "skipped(throttled)";
  }

  let email = (conv.guest_email as string | null)?.trim() || "";
  if (!email && conv.user_id) {
    const { data: prof } = await service.from("profiles").select("email").eq("id", conv.user_id).maybeSingle();
    email = prof?.email?.trim() || "";
  }
  if (!email) return "skipped(no-email)";

  const locale = (conv.locale as string | null) || "ko";
  const copy = REPLY_EMAIL_COPY[locale] ?? REPLY_EMAIL_COPY[locale.split("-")[0]] ?? REPLY_EMAIL_COPY.en;
  const siteUrl = (Deno.env.get("SITE_URL") || "https://copydrum.com").replace(/\/$/, "");
  const params = new URLSearchParams({ chat: "open", c: conv.id });
  if (!conv.user_id && conv.guest_token) params.set("t", conv.guest_token);
  const link = `${siteUrl}/${LOCALE_PATH[locale] ?? locale}?${params.toString()}`;
  const preview = escapeHtml(message.length > 300 ? `${message.slice(0, 300)}…` : message).replace(/\n/g, "<br/>");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#111827;font-size:18px;">${copy.heading}</h2>
      <div style="background:#f3f4f6;border-radius:12px;padding:16px;margin:16px 0;font-size:14px;line-height:1.6;">
        ${preview}
      </div>
      <p style="text-align:center;margin:28px 0;">
        <a href="${link}"
           style="background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block;">
          ${copy.button}
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="font-size:12px;color:#9ca3af;">${copy.footer}<br/>— CopyDrum</p>
    </div>
  `.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM_EMAIL") || "noreply@copydrum.com",
      to: [email],
      subject: copy.subject,
      html,
    }),
  });
  if (!res.ok) {
    console.error("[admin-send-chat-message] reply email failed:", await res.text());
    return "failed";
  }

  await service
    .from("chat_conversations")
    .update({ reply_email_sent_at: new Date().toISOString() })
    .eq("id", conversationId);
  return "sent";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonResponse(500, { error: "Missing Supabase configuration" });
    }

    const accessToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!accessToken) return jsonResponse(401, { error: "Unauthorized" });

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return jsonResponse(401, { error: "Unauthorized" });

    const { data: profile, error: profileError } = await authClient
      .from("profiles")
      .select("role, is_admin")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return jsonResponse(500, { error: "Failed to verify profile" });

    const isAdmin = !!profile && (profile.is_admin === true || profile.role === "admin");
    if (!isAdmin) return jsonResponse(403, { error: "Forbidden" });

    let payload: {
      conversationId?: string;
      action?: "send" | "close" | "read" | "block" | "unblock";
      message?: string;
      status?: string;
      reason?: string;
    } = {};
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload" });
    }

    const conversationId = (payload.conversationId ?? "").trim();
    const action = payload.action ?? "send";
    if (!conversationId) return jsonResponse(400, { error: "Missing conversationId" });

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: conv, error: convErr } = await service
      .from("chat_conversations")
      .select("id, user_id, guest_email")
      .eq("id", conversationId)
      .maybeSingle();
    if (convErr) return jsonResponse(500, { error: "Failed to verify conversation" });
    if (!conv) return jsonResponse(404, { error: "Conversation not found" });

    const nowIso = new Date().toISOString();

    if (action === "block" || action === "unblock") {
      // 차단 식별자: 회원이면 user_id + 이메일, 게스트면 guest_email
      let email = conv.guest_email as string | null;
      if (conv.user_id && !email) {
        const { data: prof } = await service.from("profiles").select("email").eq("id", conv.user_id).maybeSingle();
        email = prof?.email ?? null;
      }
      if (action === "unblock") {
        if (conv.user_id) await service.from("chat_blocks").delete().eq("user_id", conv.user_id);
        if (email) await service.from("chat_blocks").delete().ilike("email", email);
        return jsonResponse(200, { ok: true });
      }
      // block
      await service.from("chat_blocks").insert({
        user_id: conv.user_id ?? null,
        email: email ?? null,
        reason: payload.reason ?? null,
        created_by: user.id,
      });
      // 차단과 동시에 대화 종료
      await service.from("chat_conversations").update({ status: "closed", updated_at: nowIso }).eq("id", conversationId);
      return jsonResponse(200, { ok: true });
    }

    if (action === "read") {
      await service
        .from("chat_conversations")
        .update({ unread_for_admin: 0, updated_at: nowIso })
        .eq("id", conversationId);
      return jsonResponse(200, { ok: true });
    }

    if (action === "close") {
      await service
        .from("chat_conversations")
        .update({ status: "closed", updated_at: nowIso })
        .eq("id", conversationId);
      return jsonResponse(200, { ok: true });
    }

    // action === 'send'
    const message = (payload.message ?? "").trim();
    if (!message) return jsonResponse(400, { error: "Missing message" });

    const { error: insertError } = await service.from("chat_messages").insert({
      conversation_id: conversationId,
      sender_type: "admin",
      sender_id: user.id,
      body: message,
    });
    if (insertError) return jsonResponse(500, { error: "Failed to send message" });

    await service
      .from("chat_conversations")
      .update({
        last_message_at: nowIso,
        last_message_preview: message.slice(0, 120),
        status: payload.status ?? "open",
        unread_for_user: 1,
        unread_for_admin: 0,
        assigned_admin_id: user.id,
        updated_at: nowIso,
      })
      .eq("id", conversationId);

    let replyEmail = "skipped";
    try {
      replyEmail = await maybeSendReplyEmail(service, conversationId, message);
    } catch (e) {
      console.error("[admin-send-chat-message] reply email error:", e);
      replyEmail = "error";
    }

    return jsonResponse(200, { ok: true, replyEmail });
  } catch (error) {
    console.error("[admin-send-chat-message]", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
