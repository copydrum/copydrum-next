// ─────────────────────────────────────────────────────────────────────────────
// payment-recovery-email
//
// 배경(최근 1개월 페이팔 결제내역 분석):
//   - 페이팔 실패 29건 중 "승인 미완료(Payer has not yet approved)" 9건, 카드 거절 7건,
//     사용자 취소 13건. 이 중 상당수 고객이 끝내 재결제하지 않고 이탈했다.
//   - 결제 버튼 렌더링 시점에 orders 가 pending 으로 생성되므로, "결제를 시작했으나
//     완료하지 못한" 주문은 payment_status='pending'(또는 'failed') 상태로 남는다.
//
// 목적:
//   장바구니/결제를 시도했으나 완료하지 못한 고객에게 "결제를 마저 완료해 주세요"
//   안내 메일을 1회 발송하여 회복(재결제)을 유도한다.
//
// 안전장치:
//   1) 발송 대상: payment_method='paypal' AND payment_status IN ('pending','failed')
//      AND 생성시각이 [now-maxAgeHours, now-minAgeHours] 구간.
//      (minAgeHours: reconcile-pending-payments / 웹훅 지연을 충분히 기다린 뒤 발송)
//   2) 이미 한 번 보낸 주문은 재발송 금지 (metadata.recovery_email_sent_at).
//   3) 같은 사용자가 이 주문 이후 '완료' 주문이 있으면(=이미 재결제 성공) 발송 안 함.
//   4) RESEND_API_KEY 미설정 시 발송을 건너뛰되 대상은 리포트한다(기존 함수와 동일).
//   5) dryRun=true 이면 DB/메일 변경 없이 무엇을 할지만 리포트.
//   6) 호출 권한: Authorization: Bearer <SERVICE_ROLE_KEY> 필요 (크론/관리자 전용).
//
// 호출 예:
//   POST /functions/v1/payment-recovery-email
//   헤더: Authorization: Bearer <SERVICE_ROLE_KEY>
//   바디(선택): { "dryRun": true, "minAgeHours": 2, "maxAgeHours": 48, "limit": 200 }
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

interface RecoveryEmailContent {
  subject: string;
  html: string;
}

function buildRecoveryEmail(siteUrl: string, orderDescription: string): RecoveryEmailContent {
  const cartUrl = `${siteUrl}/cart`;
  const subject = "Your CopyDrum payment didn't go through — finish in one click";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#111827;">Your payment wasn't completed</h2>
      <p>Hi,</p>
      <p>We noticed your recent PayPal checkout for
        <strong>${orderDescription || "your drum sheet"}</strong>
        didn't finish — this usually happens when the PayPal approval window is closed too early
        or a card is declined.</p>
      <p>Good news: you can complete it in just one click. Your items are still waiting in your cart.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${cartUrl}"
           style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block;">
          Complete my payment
        </a>
      </p>
      <p style="font-size:13px;color:#6b7280;">
        Tip: if a card was declined, try your PayPal balance or a different card.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="font-size:12px;color:#9ca3af;">
        결제가 완료되지 않았습니다. 위 버튼을 눌러 결제를 마저 완료해 주세요.<br/>
        If you've already completed your purchase, please ignore this email.<br/>
        — CopyDrum Team
      </p>
    </div>
  `.trim();
  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // 권한 검증: 서비스 롤 키 보유 호출자만 허용 (크론/관리자)
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
    const minAgeHours = Number(body.minAgeHours ?? 2);
    const maxAgeHours = Number(body.maxAgeHours ?? 48);
    const limit = Math.min(Number(body.limit ?? 200), 1000);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = Date.now();
    const newestIso = new Date(now - minAgeHours * 60 * 60 * 1000).toISOString();
    const oldestIso = new Date(now - maxAgeHours * 60 * 60 * 1000).toISOString();

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const siteUrl = Deno.env.get("SITE_URL") || "https://copydrum.com";
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@copydrum.com";

    // 후보: 미완료 페이팔 주문 (생성 [oldest, newest] 구간)
    const { data: candidates, error: qErr } = await supabase
      .from("orders")
      .select("id, user_id, order_number, status, payment_status, payment_method, metadata, created_at")
      .eq("payment_method", "paypal")
      .in("payment_status", ["pending", "failed"])
      .gte("created_at", oldestIso)
      .lte("created_at", newestIso)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (qErr) return json({ success: false, error: qErr.message }, 500);

    const emailCache = new Map<string, string>();
    const resolveEmail = async (userId: string): Promise<string> => {
      if (emailCache.has(userId)) return emailCache.get(userId)!;
      const { data } = await supabase.auth.admin.getUserById(userId);
      const email = String(data?.user?.email ?? "").trim();
      emailCache.set(userId, email);
      return email;
    };

    const results: Array<Record<string, unknown>> = [];
    let sentCount = 0;
    let skippedCount = 0;

    for (const order of candidates ?? []) {
      try {
        const metadata = (order.metadata as Record<string, unknown>) ?? {};

        // 2) 이미 발송한 주문은 건너뜀
        if (metadata.recovery_email_sent_at) {
          skippedCount++;
          results.push({ orderNumber: order.order_number, action: "skip(already-sent)" });
          continue;
        }

        const userId = order.user_id as string;
        if (!userId) {
          skippedCount++;
          results.push({ orderNumber: order.order_number, action: "skip(no-user)" });
          continue;
        }

        // 3) 이 주문 이후 '완료' 주문이 있으면(=재결제 성공) 발송 안 함
        const { data: completedAfter } = await supabase
          .from("orders")
          .select("id")
          .eq("user_id", userId)
          .eq("status", "completed")
          .gte("created_at", order.created_at as string)
          .limit(1);

        if (completedAfter && completedAfter.length > 0) {
          skippedCount++;
          results.push({ orderNumber: order.order_number, action: "skip(already-recovered)" });
          continue;
        }

        const email = await resolveEmail(userId);
        if (!email) {
          skippedCount++;
          results.push({ orderNumber: order.order_number, action: "skip(no-email)" });
          continue;
        }

        const orderDescription = String(metadata.description ?? "your drum sheet");

        if (dryRun) {
          results.push({ orderNumber: order.order_number, email, action: "WOULD_SEND" });
          sentCount++;
          continue;
        }

        // 4) 메일 발송 (RESEND_API_KEY 없으면 건너뜀)
        let emailStatus = "skipped(no-resend-key)";
        if (resendApiKey) {
          const { subject, html } = buildRecoveryEmail(siteUrl, orderDescription);
          const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ from: fromEmail, to: [email], subject, html }),
          });
          if (!resendRes.ok) {
            const errText = await resendRes.text();
            results.push({
              orderNumber: order.order_number,
              email,
              action: "send-failed",
              detail: errText,
            });
            continue;
          }
          emailStatus = "sent";
        }

        // 5) 발송 마킹 (동시성 가드: 여전히 미완료 상태일 때만)
        const nowIso = new Date().toISOString();
        const { error: updErr } = await supabase
          .from("orders")
          .update({
            metadata: {
              ...metadata,
              recovery_email_sent_at: nowIso,
              recovery_email_status: emailStatus,
            },
          })
          .eq("id", order.id)
          .in("payment_status", ["pending", "failed"]);

        if (updErr) {
          results.push({
            orderNumber: order.order_number,
            email,
            action: "mark-failed",
            detail: updErr.message,
          });
          continue;
        }

        sentCount++;
        results.push({ orderNumber: order.order_number, email, action: `SENT(${emailStatus})` });
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
      minAgeHours,
      maxAgeHours,
      resendConfigured: !!resendApiKey,
      scannedCandidates: candidates?.length ?? 0,
      sent: sentCount,
      skipped: skippedCount,
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
