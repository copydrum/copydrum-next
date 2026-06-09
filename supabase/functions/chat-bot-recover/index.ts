// 룰 기반 자동복구 봇: 고객이 "결제했는데 결제대기" 상황일 때, 본인 PayPal 결제대기 주문을
// PortOne 의 PAID 결제와 대조해 자동 복구한다. 온라인/오프라인 모두에서 호출 가능(공개).
//
// 안전성: 복구는 PortOne 에 실제 PAID 로 기록되고 (email + orderName + 결제시각) 이 일치하는
//        주문만 완료 처리하며, 구매 권한은 주문의 실제 소유자(user_id)에게만 부여된다.
//        → 타인의 이메일을 넣어도 요청자가 얻는 이득이 없다. 추가로 레이트리밋/차단을 적용.
//
// 배포: supabase functions deploy chat-bot-recover --no-verify-jwt
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function getPortOneAccessToken(apiSecret: string): Promise<string> {
  const res = await fetch("https://api.portone.io/login/api-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiSecret: apiSecret.replace(/[\s"']/g, "").trim() }),
  });
  if (!res.ok) throw new Error(`PortOne login failed: ${res.status}`);
  return (await res.json()).accessToken;
}

interface PaidPayment { id: string; email: string; orderName: string; paidAtMs: number; cancelled: number; }

async function listPaidPaypal(token: string, fromIso: string, untilIso: string): Promise<PaidPayment[]> {
  const out: PaidPayment[] = [];
  for (let page = 0; page < 50; page++) {
    const body = { page: { number: page, size: 100 }, filter: { from: fromIso, until: untilIso, status: ["PAID"] } };
    const res = await fetch(
      "https://api.portone.io/payments?requestBody=" + encodeURIComponent(JSON.stringify(body)),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`PortOne list error: ${res.status}`);
    const data = await res.json() as Record<string, any>;
    const items: any[] = data.items ?? [];
    for (const p of items) {
      const pg = String(p.channel?.pgProvider ?? "");
      if (!pg.startsWith("PAYPAL")) continue;
      out.push({
        id: p.id,
        email: norm(p.customer?.email),
        orderName: norm(p.orderName),
        paidAtMs: p.paidAt ? new Date(p.paidAt).getTime() : 0,
        cancelled: Number(p.amount?.cancelled ?? 0),
      });
    }
    if (items.length < 100) break;
  }
  return out;
}

const MSG = {
  recovered: (n: number) =>
    `결제가 정상 확인되어 ${n}건을 완료 처리했습니다. 마이페이지 > 구매내역에서 바로 다운로드하실 수 있어요. 🎉`,
  noMatch: "자동으로 확인되는 결제 내역을 찾지 못했습니다. 상담원이 곧 직접 확인해 드릴게요.",
  noPending: "결제대기 상태의 주문이 없습니다. 이미 정상 처리되었을 수 있어요.",
  notFound: "주문 정보를 찾지 못했습니다. 가입하신 이메일이 맞는지 확인해 주세요. 상담원이 확인해 드릴게요.",
  throttled: "잠시 후 다시 시도해 주세요.",
  blocked: "요청을 처리할 수 없습니다.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { success: false, error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const portoneApiKey = Deno.env.get("PORTONE_API_KEY");
    if (!supabaseUrl || !serviceKey || !portoneApiKey) {
      return json(500, { success: false, error: "Missing configuration" });
    }
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const payload = await req.json().catch(() => ({}));
    let email = norm(payload.email);
    let userId: string | null = payload.userId ?? null;
    const conversationId: string | null = payload.conversationId ?? null;
    const guestToken: string | null = payload.guestToken ?? null;

    // userId/email 보완
    if (!userId && email && isEmail(email)) {
      const { data: prof } = await service.from("profiles").select("id").eq("email", payload.email).maybeSingle();
      if (prof) userId = prof.id;
    }
    if (userId && !email) {
      const { data: u } = await service.auth.admin.getUserById(userId);
      email = norm(u?.user?.email);
    }
    if (!email || !isEmail(email)) {
      return json(200, { success: true, recovered: 0, message: MSG.notFound });
    }

    // 차단 확인
    const { data: blocked } = await service
      .from("chat_blocks")
      .select("id")
      .or(`email.ilike.${email}${userId ? `,user_id.eq.${userId}` : ""}`)
      .limit(1);
    if (blocked && blocked.length > 0) {
      return json(403, { success: false, error: MSG.blocked });
    }

    // 레이트리밋: 동일 이메일 최근 2분 내 3회 이상이면 차단
    const twoMinAgo = new Date(Date.now() - 120 * 1000).toISOString();
    const { count: recentRuns } = await service
      .from("chat_bot_runs")
      .select("id", { count: "exact", head: true })
      .ilike("email", email)
      .gt("created_at", twoMinAgo);
    if ((recentRuns ?? 0) >= 3) {
      return json(429, { success: false, message: MSG.throttled });
    }
    await service.from("chat_bot_runs").insert({ email });

    // 봇 메시지 기록 헬퍼(대화가 유효할 때만)
    const postBotMessage = async (text: string) => {
      if (!conversationId) return;
      const { data: conv } = await service
        .from("chat_conversations")
        .select("id, user_id, guest_token")
        .eq("id", conversationId)
        .maybeSingle();
      if (!conv) return;
      const owns = (userId && conv.user_id === userId) || (guestToken && conv.guest_token === guestToken);
      if (!owns) return;
      await service.from("chat_messages").insert({
        conversation_id: conversationId, sender_type: "bot", body: text,
      });
      await service.from("chat_conversations").update({
        last_message_at: new Date().toISOString(),
        last_message_preview: text.slice(0, 120),
        updated_at: new Date().toISOString(),
      }).eq("id", conversationId);
    };

    if (!userId) {
      await postBotMessage(MSG.notFound);
      return json(200, { success: true, recovered: 0, message: MSG.notFound });
    }

    const { data: pending } = await service
      .from("orders")
      .select("id, order_number, status, payment_status, payment_method, metadata, created_at, user_id")
      .eq("user_id", userId)
      .eq("payment_status", "pending")
      .eq("payment_method", "paypal")
      .order("created_at", { ascending: false });

    if (!pending || pending.length === 0) {
      await postBotMessage(MSG.noPending);
      return json(200, { success: true, recovered: 0, message: MSG.noPending });
    }

    const token = await getPortOneAccessToken(portoneApiKey);
    const sinceIso = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
    const untilIso = new Date(Date.now() + 3600 * 1000).toISOString();
    const paid = await listPaidPaypal(token, sinceIso, untilIso);

    const timeWindowMs = 3 * 24 * 3600 * 1000;
    const used = new Set<string>();
    let recovered = 0;

    for (const order of pending) {
      const desc = norm((order.metadata as Record<string, any>)?.description);
      const createdMs = new Date(order.created_at as string).getTime();
      const cands = paid.filter((p) =>
        p.email === email && p.orderName === desc && desc &&
        Math.abs(p.paidAtMs - createdMs) <= timeWindowMs && p.cancelled === 0 && !used.has(p.id),
      );
      if (cands.length !== 1) continue;
      const match = cands[0];
      used.add(match.id);

      const nowIso = new Date().toISOString();
      const { error: updErr } = await service
        .from("orders")
        .update({
          status: "completed", payment_status: "paid", payment_provider: "portone",
          payment_method: "paypal", transaction_id: match.id, payment_confirmed_at: nowIso, updated_at: nowIso,
          metadata: {
            ...((order.metadata as Record<string, unknown>) ?? {}),
            portone_status: "PAID", portone_payment_id: match.id,
            reconciled_at: nowIso, reconciled_by: "chat-bot-recover",
          },
        })
        .eq("id", order.id)
        .eq("payment_status", "pending");
      if (updErr) continue;

      const { data: items } = await service.from("order_items").select("drum_sheet_id, price").eq("order_id", order.id);
      if (items && items.length > 0) {
        const records = items.map((it: any) => ({
          user_id: order.user_id, drum_sheet_id: it.drum_sheet_id, order_id: order.id, price_paid: it.price ?? 0,
        }));
        const { error: purErr } = await service.from("purchases").insert(records);
        if (purErr && purErr.code !== "23505") { /* 권한 부여 경고는 무시하고 진행 */ }
      }
      recovered += 1;
    }

    const message = recovered > 0 ? MSG.recovered(recovered) : MSG.noMatch;
    await postBotMessage(message);
    return json(200, { success: true, recovered, message });
  } catch (error) {
    console.error("[chat-bot-recover]", error);
    return json(500, { success: false, error: error instanceof Error ? error.message : "error" });
  }
});
