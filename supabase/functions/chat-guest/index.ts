// 게스트(비로그인) 실시간 채팅 백엔드.
// 게스트는 테이블에 직접 접근하지 않고 이 함수를 통해서만 접근하며,
// 대화 생성 시 발급된 guest_token 으로 본인 대화만 다룰 수 있다.
//
// 배포: supabase functions deploy chat-guest --no-verify-jwt
//
// action:
//   start: { name, email, channel, firstMessage? } -> { conversationId, token }
//   send:  { token, conversationId, body } -> { ok }
//   fetch: { token, conversationId, since? } -> { messages }
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return json(500, { success: false, error: "Missing Supabase configuration" });
    }
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    let payload: Record<string, any> = {};
    try {
      payload = await req.json();
    } catch {
      return json(400, { success: false, error: "Invalid JSON" });
    }

    const action = String(payload.action ?? "");
    const nowIso = new Date().toISOString();

    // ── start ──
    if (action === "start") {
      const name = String(payload.name ?? "").trim().slice(0, 80);
      const email = String(payload.email ?? "").trim().slice(0, 160);
      const firstMessage = payload.firstMessage ? String(payload.firstMessage).trim().slice(0, 2000) : "";
      if (!name || !isEmail(email)) {
        return json(400, { success: false, error: "이름과 올바른 이메일을 입력해 주세요." });
      }
      // 차단 확인
      const { data: blk } = await service
        .from("chat_blocks").select("id").ilike("email", email).limit(1);
      if (blk && blk.length > 0) {
        return json(403, { success: false, error: "현재 채팅을 이용할 수 없습니다. 고객센터로 문의해 주세요." });
      }
      const token = crypto.randomUUID() + "-" + crypto.randomUUID();

      const { data: conv, error: convErr } = await service
        .from("chat_conversations")
        .insert({
          guest_token: token,
          guest_name: name,
          guest_email: email,
          channel: "live",
          status: "open",
          last_message_at: nowIso,
          last_message_preview: firstMessage ? firstMessage.slice(0, 120) : null,
          unread_for_admin: firstMessage ? 1 : 0,
        })
        .select("id")
        .single();
      if (convErr || !conv) return json(500, { success: false, error: "대화를 생성하지 못했습니다." });

      if (firstMessage) {
        await service.from("chat_messages").insert({
          conversation_id: conv.id,
          sender_type: "user",
          body: firstMessage,
        });
      }

      return json(200, { success: true, conversationId: conv.id, token });
    }

    // 이하 action 은 token + conversationId 검증 필요
    const token = String(payload.token ?? "");
    const conversationId = String(payload.conversationId ?? "");
    if (!token || !conversationId) {
      return json(400, { success: false, error: "Missing token or conversationId" });
    }

    const { data: conv, error: convErr } = await service
      .from("chat_conversations")
      .select("id, guest_token, guest_email, status")
      .eq("id", conversationId)
      .maybeSingle();
    if (convErr) return json(500, { success: false, error: "조회 실패" });
    if (!conv || conv.guest_token !== token) {
      return json(403, { success: false, error: "Forbidden" });
    }

    // ── send ──
    if (action === "send") {
      const body = String(payload.body ?? "").trim().slice(0, 2000);
      if (!body) return json(400, { success: false, error: "메시지를 입력해 주세요." });

      // 차단 확인
      if (conv.guest_email) {
        const { data: blk } = await service
          .from("chat_blocks").select("id").ilike("email", conv.guest_email).limit(1);
        if (blk && blk.length > 0) {
          return json(403, { success: false, error: "현재 채팅을 이용할 수 없습니다." });
        }
      }

      // 레이트리밋: 최근 15초 내 고객 메시지 5건 초과 시 차단
      const since = new Date(Date.now() - 15 * 1000).toISOString();
      const { count: recent } = await service
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("sender_type", "user")
        .gt("created_at", since);
      if ((recent ?? 0) >= 5) {
        return json(429, { success: false, error: "잠시 후 다시 시도해 주세요." });
      }

      if (conv.status === "closed") {
        await service.from("chat_conversations").update({ status: "open" }).eq("id", conversationId);
      }
      const { error: insErr } = await service.from("chat_messages").insert({
        conversation_id: conversationId,
        sender_type: "user",
        body,
      });
      if (insErr) return json(500, { success: false, error: "전송 실패" });

      await service
        .from("chat_conversations")
        .update({
          last_message_at: nowIso,
          last_message_preview: body.slice(0, 120),
          unread_for_admin: 1,
          updated_at: nowIso,
        })
        .eq("id", conversationId);

      return json(200, { success: true });
    }

    // ── fetch ──
    if (action === "fetch") {
      const since = payload.since ? String(payload.since) : null;
      let query = service
        .from("chat_messages")
        .select("id, conversation_id, sender_type, sender_id, body, attachment_url, read_at, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      if (since) query = query.gt("created_at", since);
      const { data: messages, error: msgErr } = await query;
      if (msgErr) return json(500, { success: false, error: "조회 실패" });
      return json(200, { success: true, messages: messages ?? [] });
    }

    return json(400, { success: false, error: "Unknown action" });
  } catch (error) {
    console.error("[chat-guest]", error);
    return json(500, { success: false, error: "Internal server error" });
  }
});
