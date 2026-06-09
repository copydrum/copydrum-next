// 관리자 → 채팅 메시지 전송 / 대화 상태 변경 / 읽음 처리.
// 권한: 호출자의 JWT 로 profiles.is_admin 또는 role='admin' 인지 검증 후 service role 로 기록.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error("[admin-send-chat-message]", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
