// 관리자 전용: 특정 고객의 결제대기(PayPal) 주문을 PortOne 과 대조해 조회/복구.
// 채팅 상담 화면에서 상담원이 버튼 한 번으로 "결제됐는데 멈춘" 주문을 즉시 처리.
//
// 권한: 호출자 JWT 로 profiles.is_admin 또는 role='admin' 검증.
// 배포: supabase functions deploy admin-reconcile-order
//
// body:
//   { userId?, email?, dryRun? }  // userId 또는 email 중 하나 필수
// 반환:
//   { ok, orders:[{order_number, status, payment_status, matched, action, paymentId}] }
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

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

async function getPortOneAccessToken(apiSecret: string): Promise<string> {
  const res = await fetch("https://api.portone.io/login/api-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiSecret: apiSecret.replace(/[\s"']/g, "").trim() }),
  });
  if (!res.ok) throw new Error(`PortOne login failed: ${res.status}`);
  return (await res.json()).accessToken;
}

interface PaidPayment {
  id: string;
  email: string;
  orderName: string;
  paidAtMs: number;
  cancelled: number;
  pgProvider: string;
}

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
        pgProvider: pg,
      });
    }
    if (items.length < 100) break;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const portoneApiKey = Deno.env.get("PORTONE_API_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey || !portoneApiKey) {
      return json(500, { ok: false, error: "Missing configuration" });
    }

    const accessToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!accessToken) return json(401, { ok: false, error: "Unauthorized" });

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) return json(401, { ok: false, error: "Unauthorized" });

    const { data: profile } = await authClient
      .from("profiles").select("role, is_admin").eq("id", user.id).maybeSingle();
    const isAdmin = !!profile && (profile.is_admin === true || profile.role === "admin");
    if (!isAdmin) return json(403, { ok: false, error: "Forbidden" });

    const payload = await req.json().catch(() => ({}));
    const dryRun = payload.dryRun === true;
    let targetUserId: string | null = payload.userId ?? null;
    let email = norm(payload.email);

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // userId/email 보완
    if (!targetUserId && email) {
      const { data: prof } = await service.from("profiles").select("id, email").eq("email", payload.email).maybeSingle();
      if (prof) targetUserId = prof.id;
    }
    if (targetUserId && !email) {
      const { data: u } = await service.auth.admin.getUserById(targetUserId);
      email = norm(u?.user?.email);
    }
    if (!targetUserId) return json(400, { ok: false, error: "고객을 식별할 수 없습니다(userId/email)" });

    // 해당 고객의 결제대기 PayPal 주문
    const { data: pending } = await service
      .from("orders")
      .select("id, order_number, status, payment_status, payment_method, total_amount, metadata, created_at, user_id")
      .eq("user_id", targetUserId)
      .eq("payment_status", "pending")
      .eq("payment_method", "paypal")
      .order("created_at", { ascending: false });

    if (!pending || pending.length === 0) {
      return json(200, { ok: true, orders: [], message: "결제대기 PayPal 주문이 없습니다." });
    }

    const token = await getPortOneAccessToken(portoneApiKey);
    const sinceIso = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
    const untilIso = new Date(Date.now() + 3600 * 1000).toISOString();
    const paid = await listPaidPaypal(token, sinceIso, untilIso);

    const timeWindowMs = 3 * 24 * 3600 * 1000;
    const used = new Set<string>();
    const results: Array<Record<string, unknown>> = [];

    for (const order of pending) {
      const desc = norm((order.metadata as Record<string, any>)?.description);
      const createdMs = new Date(order.created_at as string).getTime();
      const cands = paid.filter((p) =>
        p.email === email && email &&
        p.orderName === desc && desc &&
        Math.abs(p.paidAtMs - createdMs) <= timeWindowMs &&
        p.cancelled === 0 && !used.has(p.id),
      );

      if (cands.length !== 1) {
        results.push({
          order_number: order.order_number,
          action: cands.length === 0 ? "no-paid-match" : "ambiguous",
          paymentId: null,
        });
        continue;
      }
      const match = cands[0];
      used.add(match.id);

      if (dryRun) {
        results.push({ order_number: order.order_number, action: "WOULD_RECOVER", paymentId: match.id });
        continue;
      }

      const nowIso = new Date().toISOString();
      const { error: updErr } = await service
        .from("orders")
        .update({
          status: "completed",
          payment_status: "paid",
          payment_provider: "portone",
          payment_method: "paypal",
          transaction_id: match.id,
          payment_confirmed_at: nowIso,
          updated_at: nowIso,
          metadata: {
            ...((order.metadata as Record<string, unknown>) ?? {}),
            portone_status: "PAID",
            portone_payment_id: match.id,
            reconciled_at: nowIso,
            reconciled_by: "admin-reconcile-order",
          },
        })
        .eq("id", order.id)
        .eq("payment_status", "pending");

      if (updErr) {
        results.push({ order_number: order.order_number, action: "update-failed", paymentId: match.id });
        continue;
      }

      const { data: items } = await service
        .from("order_items").select("drum_sheet_id, price").eq("order_id", order.id);
      if (items && items.length > 0) {
        const records = items.map((it: any) => ({
          user_id: order.user_id,
          drum_sheet_id: it.drum_sheet_id,
          order_id: order.id,
          price_paid: it.price ?? 0,
        }));
        const { error: purErr } = await service.from("purchases").insert(records);
        if (purErr && purErr.code !== "23505") {
          results.push({ order_number: order.order_number, action: "RECOVERED(purchases-warn)", paymentId: match.id });
          continue;
        }
      }
      results.push({ order_number: order.order_number, action: "RECOVERED", paymentId: match.id });
    }

    return json(200, { ok: true, orders: results });
  } catch (error) {
    console.error("[admin-reconcile-order]", error);
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Internal error" });
  }
});
