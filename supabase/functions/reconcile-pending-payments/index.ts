// ─────────────────────────────────────────────────────────────────────────────
// reconcile-pending-payments  (PortOne 역방향 매칭 버전)
//
// 배경:
//   PayPal은 "비동기 결제"라 PortOne이 READY 웹훅을 먼저 보내고, 최종 PAID 웹훅이
//   와야 주문이 완료된다. 그런데 이 PAID 웹훅이 누락/미전달되면 주문이 pending에
//   영구히 멈춘다. 실제로 멈춘 주문 다수는 transaction_id 조차 없어서(= confirm이
//   한 번도 안 돌아서) "주문 → PortOne 조회"로는 복구가 불가능하다.
//
// 그래서 방향을 반대로 한다:
//   PortOne의 "최근 PAID 결제 목록"을 가져와서 → 아직 pending 인 주문과 매칭한다.
//   매칭 키: 이메일(customer.email) + 상품명(orderName == orders.metadata.description)
//            + 결제시각(paidAt 이 주문 created_at ± timeWindow 이내)
//
// 안전장치:
//   1) 취소/환불(amount.cancelled > 0 또는 status != PAID)된 결제는 절대 복구 안 함.
//   2) 매칭 후보가 2개 이상이면(모호) 자동 복구하지 않고 ambiguous 로만 보고.
//   3) 한 PortOne 결제는 최대 1개의 주문에만 매칭(중복 사용 방지).
//   4) 자동 복구는 "최근 주문(autoCompleteMaxAgeHours, 기본 72h)"으로 제한.
//      더 오래된 PAID-멈춤 건은 needsReview 로만 보고(관리자 일괄 검토용).
//   5) dryRun=true 이면 DB 변경 없이 무엇을 할지만 리포트.
//   6) 동시성 가드: update 시 payment_status='pending' 조건을 함께 걸어
//      그 사이 완료/환불된 주문은 건드리지 않는다.
//   7) 호출 권한: Authorization: Bearer <SERVICE_ROLE_KEY> 필요.
//
// 호출 예:
//   POST /functions/v1/reconcile-pending-payments
//   헤더: Authorization: Bearer <SERVICE_ROLE_KEY>
//   바디(선택): { "dryRun": true, "windowDays": 30, "autoCompleteMaxAgeHours": 72,
//                "timeWindowHours": 72, "limit": 300 }
// ─────────────────────────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

async function getPortOneAccessToken(apiSecret: string): Promise<string> {
  const cleanSecret = apiSecret.replace(/[\s"']/g, "").trim();
  const res = await fetch("https://api.portone.io/login/api-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiSecret: cleanSecret }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PortOne login failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  return data.accessToken;
}

interface PaidPayment {
  id: string;
  email: string;
  orderName: string;
  paidAtMs: number;
  amountTotal: number;
  currency: string;
  pgProvider: string;
  cancelled: number;
}

// PortOne 결제 목록 조회 (GET /payments?requestBody=...). status=PAID 만 필터.
async function listPaidPayments(
  accessToken: string,
  fromIso: string,
  untilIso: string,
): Promise<PaidPayment[]> {
  const all: PaidPayment[] = [];
  for (let page = 0; page < 50; page++) {
    const body = {
      page: { number: page, size: 100 },
      filter: { from: fromIso, until: untilIso, status: ["PAID"] },
    };
    const res = await fetch(
      "https://api.portone.io/payments?requestBody=" +
        encodeURIComponent(JSON.stringify(body)),
      { method: "GET", headers: { "Authorization": `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`PortOne list error: ${res.status} ${t}`);
    }
    const data = await res.json() as Record<string, any>;
    const items: any[] = data.items ?? [];
    for (const p of items) {
      all.push({
        id: p.id,
        email: norm(p.customer?.email),
        orderName: norm(p.orderName),
        paidAtMs: p.paidAt ? new Date(p.paidAt).getTime() : 0,
        amountTotal: Number(p.amount?.total ?? 0),
        currency: String(p.currency ?? ""),
        pgProvider: String(p.channel?.pgProvider ?? ""),
        cancelled: Number(p.amount?.cancelled ?? 0),
      });
    }
    if (items.length < 100) break;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const portoneApiKey = requireEnv("PORTONE_API_KEY");

    // 권한 검증: 서비스 롤 키를 가진 호출자만 허용 (크론/관리자)
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearer !== serviceRoleKey) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const dryRun = body.dryRun === true;
    const windowDays = Number(body.windowDays ?? 30);
    const autoCompleteMaxAgeHours = Number(body.autoCompleteMaxAgeHours ?? 72);
    const timeWindowHours = Number(body.timeWindowHours ?? 72);
    const limit = Math.min(Number(body.limit ?? 300), 1000);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const sinceMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const sinceIso = new Date(sinceMs).toISOString();
    const untilIso = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h 여유
    const autoCompleteCutoffMs = Date.now() -
      autoCompleteMaxAgeHours * 60 * 60 * 1000;
    const timeWindowMs = timeWindowHours * 60 * 60 * 1000;

    // 1) 후보 주문: 결제대기 PayPal 주문 (최근 windowDays)
    const { data: pendingOrders, error: qErr } = await supabase
      .from("orders")
      .select(
        "id, user_id, order_number, status, payment_status, payment_method, total_amount, metadata, created_at, transaction_id",
      )
      .eq("payment_status", "pending")
      .eq("payment_method", "paypal")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (qErr) return json({ success: false, error: qErr.message }, 500);

    // 2) PortOne PAID 결제 목록 (PayPal 만)
    const accessToken = await getPortOneAccessToken(portoneApiKey);
    const paidAll = await listPaidPayments(accessToken, sinceIso, untilIso);
    const paypalPaid = paidAll.filter((p) => p.pgProvider.startsWith("PAYPAL"));

    // 3) 주문별 이메일 해석 (캐시)
    const emailCache = new Map<string, string>();
    const resolveEmail = async (userId: string): Promise<string> => {
      if (emailCache.has(userId)) return emailCache.get(userId)!;
      const { data } = await supabase.auth.admin.getUserById(userId);
      const email = norm(data?.user?.email);
      emailCache.set(userId, email);
      return email;
    };

    const results: Array<Record<string, unknown>> = [];
    const usedPaymentIds = new Set<string>();
    let recoveredCount = 0;
    let needsReviewCount = 0;
    let ambiguousCount = 0;

    for (const order of pendingOrders ?? []) {
      try {
        const email = await resolveEmail(order.user_id as string);
        const desc = norm((order.metadata as Record<string, unknown>)?.description);
        const createdMs = new Date(order.created_at as string).getTime();

        if (!email || !desc) {
          results.push({
            orderNumber: order.order_number,
            action: "skip(no-email-or-desc)",
          });
          continue;
        }

        // 매칭 후보: 이메일 + 상품명 + 시각(±timeWindow) + 미사용 + 미취소
        const candidates = paypalPaid.filter((p) =>
          p.email === email &&
          p.orderName === desc &&
          Math.abs(p.paidAtMs - createdMs) <= timeWindowMs &&
          p.cancelled === 0 &&
          !usedPaymentIds.has(p.id)
        );

        if (candidates.length === 0) {
          results.push({
            orderNumber: order.order_number,
            action: "skip(no-paid-match)",
          });
          continue;
        }
        if (candidates.length > 1) {
          ambiguousCount++;
          results.push({
            orderNumber: order.order_number,
            action: "ambiguous(multiple-paid-matches)",
            candidateCount: candidates.length,
          });
          continue;
        }

        const match = candidates[0];
        const isRecent = createdMs >= autoCompleteCutoffMs;

        if (!isRecent) {
          needsReviewCount++;
          results.push({
            orderNumber: order.order_number,
            paymentId: match.id,
            action: "needsReview(paid-but-old)",
            paidAt: new Date(match.paidAtMs).toISOString(),
          });
          continue;
        }

        if (dryRun) {
          usedPaymentIds.add(match.id);
          recoveredCount++;
          results.push({
            orderNumber: order.order_number,
            paymentId: match.id,
            action: "WOULD_RECOVER",
            paidAt: new Date(match.paidAtMs).toISOString(),
          });
          continue;
        }

        // ── 자동 복구: 주문 완료 + purchases 기록 ──
        const nowIso = new Date().toISOString();
        const { error: updErr } = await supabase
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
              reconciled_by: "reconcile-pending-payments",
              reconciled_match: {
                by: "email+orderName+paidAt",
                email,
                orderName: desc,
                paidAt: new Date(match.paidAtMs).toISOString(),
              },
            },
          })
          .eq("id", order.id)
          .eq("payment_status", "pending"); // 동시성 가드

        if (updErr) {
          results.push({
            orderNumber: order.order_number,
            paymentId: match.id,
            action: "update-failed",
            detail: updErr.message,
          });
          continue;
        }

        usedPaymentIds.add(match.id);

        // purchases 기록 (order_items 기준). 중복(23505)은 무시.
        const { data: items } = await supabase
          .from("order_items")
          .select("drum_sheet_id, price")
          .eq("order_id", order.id);

        if (items && items.length > 0) {
          const purchaseRecords = items.map((it: any) => ({
            user_id: order.user_id,
            drum_sheet_id: it.drum_sheet_id,
            order_id: order.id,
            price_paid: it.price ?? 0,
          }));
          const { error: purErr } = await supabase
            .from("purchases")
            .insert(purchaseRecords);
          if (purErr && purErr.code !== "23505") {
            recoveredCount++;
            results.push({
              orderNumber: order.order_number,
              paymentId: match.id,
              action: "RECOVERED(purchases-warn)",
              detail: purErr.message,
            });
            continue;
          }
        } else {
          results.push({
            orderNumber: order.order_number,
            paymentId: match.id,
            action: "RECOVERED(no-order-items)",
          });
          recoveredCount++;
          continue;
        }

        recoveredCount++;
        results.push({
          orderNumber: order.order_number,
          paymentId: match.id,
          action: "RECOVERED",
        });
      } catch (e) {
        results.push({
          orderNumber: order.order_number,
          action: "error",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return json({
      success: true,
      dryRun,
      windowDays,
      autoCompleteMaxAgeHours,
      timeWindowHours,
      scannedPendingPaypal: pendingOrders?.length ?? 0,
      portonePaidPaypal: paypalPaid.length,
      recovered: recoveredCount,
      needsReview: needsReviewCount,
      ambiguous: ambiguousCount,
      results,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      500,
    );
  }
}, { verifyJwt: false });
