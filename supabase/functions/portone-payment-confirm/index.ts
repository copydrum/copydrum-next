import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const getCorsHeaders = (origin?: string) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  "Access-Control-Max-Age": "86400",
});

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const buildResponse = <T>(payload: T, status = 200, origin?: string) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });

interface PortOnePaymentResponse {
  id: string;
  status: string;
  amount: {
    total: number;
    currency: string;
  };
  orderId?: string;
  transactionId?: string;
  metadata?: Record<string, unknown>;
  customer?: {
    customerId?: string;
    email?: string;
    fullName?: string;
  };
  virtualAccount?: any;
  /** PortOne 채널/PG 제공자 정보 (결제수단 추론용) */
  pgProvider?: string;
  payMethod?: string;
  channelKey?: string;
}

async function getPortOneAccessToken(apiSecret: string): Promise<string> {
  const cleanSecret = apiSecret.replace(/[\s"']/g, "").trim();
  
  const response = await fetch("https://api.portone.io/login/api-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiSecret: cleanSecret }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[portone-payment-confirm] 토큰 발급 실패", { status: response.status, body: errorText });
    throw new Error(`Failed to login to PortOne: ${errorText}`);
  }

  const result = await response.json();
  return result.accessToken;
}

// PortOne V2 정식 단건 조회(/payments/{id})의 top-level status 를 권위 있는 값으로 사용.
// (주의: 아래 /v2/payments/{id} 는 transactions 배열을 반환하는데, PayPal 같은 비동기
//  결제에서 transactions[0] 이 비-primary(예: READY) 트랜잭션일 수 있어 실제 PAID 를
//  PENDING 으로 오판한다. 그래서 상태 판정은 항상 top-level status 로 한다.)
async function getAuthoritativeStatus(
  paymentId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.portone.io/payments/${encodeURIComponent(paymentId)}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!res.ok) {
      console.warn("[portone-payment-confirm] top-level status 조회 실패", {
        status: res.status,
      });
      return null;
    }
    const p = await res.json() as Record<string, any>;
    return p?.status ? String(p.status).toUpperCase() : null;
  } catch (e) {
    console.warn("[portone-payment-confirm] top-level status 조회 예외", e);
    return null;
  }
}

async function getPortOnePayment(
  paymentId: string,
  apiSecret: string
): Promise<PortOnePaymentResponse> {
  
  const accessToken = await getPortOneAccessToken(apiSecret);

  // 권위 있는 결제 상태(top-level)를 먼저 확보 (비동기 PayPal 오판 방지)
  const authoritativeStatus = await getAuthoritativeStatus(paymentId, accessToken);

  const url = `https://api.portone.io/v2/payments/${paymentId}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[portone-payment-confirm] API 조회 실패", { status: response.status, body: errorText });
    throw new Error(`PortOne API error: ${response.status} ${errorText}`);
  }

  const rawResult = await response.json();
  
  if (rawResult.payment && rawResult.payment.transactions && rawResult.payment.transactions.length > 0) {
    // 상세 정보(가상계좌/결제수단)는 primary 트랜잭션 우선, 없으면 첫 번째 사용
    const txs = rawResult.payment.transactions;
    const tx = txs.find((t: any) => t.is_primary === true || t.isPrimary === true) ?? txs[0];
    
    // 👇 [핵심 수정] 로그에서 발견된 깊은 경로(payment_method_detail) 탐색 추가
    const paymentMethodDetail = tx.payment_method_detail || tx.paymentMethodDetail;
    const deepVirtualAccount = paymentMethodDetail?.virtual_account || paymentMethodDetail?.virtualAccount;

    // 우선순위: 깊은 경로 -> 얕은 경로 -> 원본 payment 경로
    const foundVirtualAccount = 
      deepVirtualAccount || 
      tx.virtual_account || 
      tx.virtualAccount || 
      rawResult.payment.virtual_account || 
      rawResult.payment.virtualAccount;

    // 디버깅: 찾았는지 확인
    if (foundVirtualAccount) {
      console.log("[DEBUG] 가상계좌 정보 발견됨:", JSON.stringify(foundVirtualAccount));
    } else {
      console.log("[DEBUG] 가상계좌 정보 발견 실패 via path:", JSON.stringify(tx));
    }

    // PG 제공자 및 결제수단 정보 추출 (결제수단 추론용)
    const channel = rawResult.payment.channel || tx.channel || {};
    const pgProvider = (channel.pg_provider || channel.pgProvider || channel.type || '').toLowerCase();
    const payMethod = (tx.pay_method || tx.payMethod || rawResult.payment.pay_method || '').toUpperCase();
    const channelKey = channel.key || channel.channel_key || '';

    console.log("[portone-payment-confirm] PG/결제수단 정보:", {
      pgProvider,
      payMethod,
      channelKey: channelKey ? channelKey.substring(0, 20) + '...' : 'N/A',
    });

    return {
      id: rawResult.payment.id,
      transactionId: tx.id,
      // 상태 판정은 권위 있는 top-level status 우선 (비동기 PayPal 오판 방지),
      // 조회 실패 시에만 primary 트랜잭션 status 로 폴백
      status: authoritativeStatus ?? tx.status,
      amount: tx.amount,
      orderId: rawResult.payment.order_name,
      metadata: tx.metadata || rawResult.payment.metadata || {},
      customer: rawResult.payment.customer || {},
      virtualAccount: foundVirtualAccount,
      pgProvider,
      payMethod,
      channelKey,
    };
  }

  console.error("[portone-payment-confirm] 예상치 못한 응답 구조", rawResult);
  throw new Error("Invalid payment data structure from PortOne");
}

function compareAmounts(
  portoneAmount: number,
  portoneCurrency: string,
  orderAmountKRW: number
): boolean {
  let portoneAmountInKRW: number;
  if (portoneCurrency === "CURRENCY_USD" || portoneCurrency === "USD") {
    portoneAmountInKRW = (portoneAmount / 100) * 1300; 
  } else if (portoneCurrency === "CURRENCY_JPY" || portoneCurrency === "JPY") {
    portoneAmountInKRW = portoneAmount * 10;
  } else {
    portoneAmountInKRW = portoneAmount;
  }
  const tolerance = orderAmountKRW * 0.01;
  return Math.abs(portoneAmountInKRW - orderAmountKRW) <= tolerance;
}

serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: getCorsHeaders(origin) });

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const portoneApiKey = requireEnv("PORTONE_API_KEY");

    const payload = await req.json();
    const { paymentId, orderId } = payload;

    if (!paymentId) {
      return buildResponse({ success: false, error: { message: "paymentId is required" } }, 400, origin);
    }

    const portonePayment = await getPortOnePayment(paymentId, portoneApiKey);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let orderData = null;

    // ─────────────────────────────────────────────────────────────
    // 주문 매칭 도우미: 후보 주문이 "이 결제에 속한 주문"인지 검증
    //   - transaction_id가 NULL이면: 아직 결제가 매칭되지 않은 주문 → 사용 가능
    //   - transaction_id가 paymentId와 일치하면: 이 결제의 주문 → 사용 가능 (멱등 처리)
    //   - 그 외 (다른 paymentId가 이미 점유): 다른 결제의 주문 → 사용 불가
    //     (PayPal: 1차 결제가 PAY_PENDING인 동안 2차 결제가 같은 주문을 점유한 경우 등)
    // ─────────────────────────────────────────────────────────────
    const isOrderUsableForThisPayment = (candidate: any): boolean => {
      if (!candidate) return false;
      const candTxId = candidate.transaction_id;
      if (!candTxId) return true; // 아직 매칭 전
      if (candTxId === paymentId) return true; // 이 결제로 이미 매칭됨 (멱등)
      return false; // 다른 결제로 점유됨
    };

    // transaction_id로 찾기 (가장 정확한 매칭)
    const { data: byTxId, error: txError } = await supabase
      .from("orders")
      .select("*")
      .eq("transaction_id", paymentId)
      .maybeSingle();

    if (txError) {
      console.error("[portone-payment-confirm] transaction_id로 주문 조회 실패:", {
        error: txError,
        paymentId,
      });
    } else if (byTxId) {
      orderData = byTxId;
      console.log("[portone-payment-confirm] ✅ transaction_id로 주문 조회 성공:", byTxId.id);
    }

    // orderId(웹훅 페이로드)로 찾기 — 단, 다른 결제로 점유된 주문은 거부
    if (!orderData && orderId) {
      const { data: byOrderId, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (orderError) {
        console.error("[portone-payment-confirm] orderId로 주문 조회 실패:", {
          error: orderError,
          orderId,
        });
      } else if (byOrderId) {
        if (isOrderUsableForThisPayment(byOrderId)) {
          orderData = byOrderId;
          console.log("[portone-payment-confirm] ✅ orderId로 주문 조회 성공:", byOrderId.id);
        } else {
          // 같은 ID의 주문이 이미 다른 결제(transaction_id)로 점유됨
          // → 이 결제는 별도의 새 주문으로 처리해야 함 (orphaned 결제 보호)
          console.warn("[portone-payment-confirm] ⚠️ orderId 매칭됐으나 다른 결제가 이미 점유 — 새 주문으로 분리 처리:", {
            orderId,
            existingTxId: byOrderId.transaction_id,
            incomingPaymentId: paymentId,
            existingStatus: byOrderId.status,
          });
        }
      }
    }

    // metadata.clientOrderId(PortOne API에서 가져온 원본 주문 ID)로 찾기
    // → 일부 웹훅 페이로드에는 orderId가 누락될 수 있어, metadata도 폴백으로 검사
    if (!orderData) {
      const metadataClientOrderId =
        (portonePayment.metadata?.clientOrderId as string | undefined) ||
        (portonePayment.metadata?.supabaseOrderId as string | undefined) ||
        null;

      if (metadataClientOrderId) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(metadataClientOrderId)) {
          const { data: byMetaId, error: metaErr } = await supabase
            .from("orders")
            .select("*")
            .eq("id", metadataClientOrderId)
            .maybeSingle();

          if (metaErr) {
            console.error("[portone-payment-confirm] metadata.clientOrderId로 주문 조회 실패:", {
              error: metaErr,
              metadataClientOrderId,
            });
          } else if (byMetaId) {
            if (isOrderUsableForThisPayment(byMetaId)) {
              orderData = byMetaId;
              console.log("[portone-payment-confirm] ✅ metadata.clientOrderId로 주문 조회 성공:", byMetaId.id);
            } else {
              console.warn("[portone-payment-confirm] ⚠️ metadata.clientOrderId 매칭됐으나 다른 결제가 이미 점유 — 새 주문으로 분리 처리:", {
                metadataClientOrderId,
                existingTxId: byMetaId.transaction_id,
                incomingPaymentId: paymentId,
                existingStatus: byMetaId.status,
              });
            }
          }
        }
      }
    }

    // 주문이 없으면 포트원 API에서 주문 정보를 가져와서 생성
    if (!orderData) {
      console.error("[portone-payment-confirm] ⚠️ 주문이 DB에 없음. 포트원 API 조회하여 주문 생성 시도:", {
        paymentId,
        orderId: orderId || "없음",
      });

      try {
        // metadata에서 clientOrderId 또는 supabaseOrderId 추출
        const metadata = portonePayment.metadata || {};
        const clientOrderId = metadata.clientOrderId || metadata.supabaseOrderId || orderId;
        const customerId = 
          portonePayment.customer?.customerId || 
          metadata.userId || 
          metadata.customerId ||
          null;

        if (!clientOrderId) {
          console.error("[portone-payment-confirm] ❌ metadata에 clientOrderId 없음. 주문 생성 불가:", {
            paymentId,
            metadata,
          });
          return buildResponse(
            { 
              success: false, 
              error: { message: "Order not found and cannot create order: missing clientOrderId in metadata" } 
            },
            404,
            origin
          );
        }

        if (!customerId) {
          console.error("[portone-payment-confirm] ❌ customerId 없음. 주문 생성 불가:", {
            paymentId,
            metadata,
          });
          return buildResponse(
            { 
              success: false, 
              error: { message: "Order not found and cannot create order: missing customerId" } 
            },
            404,
            origin
          );
        }

        // UUID 형식 검증 (RFC 4122 표준: 8-4-4-4-12 형식)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isValidUUID = uuidRegex.test(clientOrderId);

        // UUID가 아닌 경우 새로운 UUID 생성 (과거 코드에서 넘어온 요청 대비)
        let finalOrderId: string;
        let originalClientOrderId: string | undefined;
        let idConflictReason: string | undefined; // 디버깅용: 새 UUID로 전환된 이유

        if (isValidUUID) {
          // ⚠️ 추가 안전장치: 같은 ID의 주문이 이미 DB에 존재하면 새 UUID 발급
          //   (PayPal: 1차 결제가 PAY_PENDING 상태에서 사용자가 같은 주문 ID로 2차 결제를 진행해
          //    2차 결제가 그 주문을 점유한 경우, 1차 결제의 lazy creation이 unique violation으로
          //    실패해 결제가 통째로 유실되는 것을 방지)
          const { data: conflicting } = await supabase
            .from("orders")
            .select("id, transaction_id, status")
            .eq("id", clientOrderId)
            .maybeSingle();

          if (conflicting) {
            finalOrderId = crypto.randomUUID();
            originalClientOrderId = clientOrderId;
            idConflictReason = `existing order ${conflicting.id} already taken by tx_id=${conflicting.transaction_id} (status=${conflicting.status})`;
            console.warn("[portone-payment-confirm] ⚠️ clientOrderId가 이미 다른 결제로 점유됨 — 새 UUID 발급하여 분리된 주문 생성:", {
              originalClientOrderId: clientOrderId,
              newOrderId: finalOrderId,
              conflictingTxId: conflicting.transaction_id,
              conflictingStatus: conflicting.status,
              incomingPaymentId: paymentId,
            });
          } else {
            finalOrderId = clientOrderId;
            console.log("[portone-payment-confirm] ✅ clientOrderId가 유효한 UUID 형식이고 충돌 없음:", finalOrderId);
          }
        } else {
          // UUID가 아니면 새로 생성하고 원본을 보존
          finalOrderId = crypto.randomUUID();
          originalClientOrderId = clientOrderId;
          idConflictReason = "clientOrderId is not a valid UUID";
          console.warn("[portone-payment-confirm] ⚠️ clientOrderId가 UUID 형식이 아님. 새 UUID 생성:", {
            original: clientOrderId,
            new: finalOrderId,
          });
        }

        // 주문 금액 계산 (포트원 금액을 KRW로 변환)
        const portoneAmount = portonePayment.amount?.total || portonePayment.amount || 0;
        const portoneCurrency = portonePayment.amount?.currency || "CURRENCY_KRW";
        let amountKRW = portoneAmount;
        
        if (portoneCurrency === "CURRENCY_USD" || portoneCurrency === "USD") {
          amountKRW = Math.round((portoneAmount / 100) * 1300); // USD 센트 → KRW
        } else if (portoneCurrency === "CURRENCY_JPY" || portoneCurrency === "JPY") {
          amountKRW = Math.round(portoneAmount * 10); // JPY → KRW (대략)
        }

        // 주문 생성
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        const orderNumber = `ORDER-${dateStr}-${randomStr}`;

        // metadata에 원본 clientOrderId 보존 (UUID가 아니거나 ID 충돌로 새 UUID 발급된 경우)
        const orderMetadata: Record<string, unknown> = {
          type: "sheet_purchase",
          description: portonePayment.orderId || "포트원 결제",
          created_from: "portone_payment_confirm_lazy_creation",
          portone_payment_id: paymentId,
          portone_metadata: metadata,
        };

        // 새 UUID로 전환된 경우 원본 clientOrderId와 사유를 metadata에 보존 (운영 추적용)
        if (originalClientOrderId) {
          orderMetadata.original_client_order_id = originalClientOrderId;
          orderMetadata.uuid_converted = true;
          if (idConflictReason) {
            orderMetadata.id_conflict_reason = idConflictReason;
          }
        }

        const { data: newOrder, error: createError } = await supabase
          .from("orders")
          .insert({
            id: finalOrderId, // UUID 형식 검증된 ID 사용
            user_id: customerId,
            order_number: orderNumber,
            total_amount: amountKRW,
            status: "pending",
            payment_status: "pending",
            payment_method: null, // 나중에 업데이트
            order_type: "product",
            transaction_id: paymentId,
            metadata: orderMetadata,
          })
          .select()
          .single();

        if (createError || !newOrder) {
          console.error("[portone-payment-confirm] ❌ 주문 생성 실패:", {
            error: createError,
            code: createError?.code,
            message: createError?.message,
            details: createError?.details,
            hint: createError?.hint,
            paymentId,
            clientOrderId,
            customerId,
            amountKRW,
          });
          return buildResponse(
            { 
              success: false, 
              error: { 
                message: "Order not found and failed to create order",
                details: createError?.message,
                code: createError?.code,
              } 
            },
            500,
            origin
          );
        }

        orderData = newOrder;
        console.log("[portone-payment-confirm] ✅ 주문 생성 성공 (Lazy Creation):", {
          orderId: orderData.id,
          orderNumber: orderData.order_number,
          paymentId,
        });
      } catch (createErr) {
        console.error("[portone-payment-confirm] ❌ 주문 생성 중 예외:", {
          error: createErr,
          message: createErr instanceof Error ? createErr.message : String(createErr),
          paymentId,
          orderId: orderId || "없음",
        });
        return buildResponse(
          { 
            success: false, 
            error: { 
              message: "Order not found and failed to create order",
              details: createErr instanceof Error ? createErr.message : String(createErr),
            } 
          },
          500,
          origin
        );
      }
    }

    const order = orderData;
    const paymentStatus = portonePayment.status;
    const isVirtualAccountIssued = paymentStatus === "VIRTUAL_ACCOUNT_ISSUED";
    const isPaid = paymentStatus === "PAID";

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [PAYMENT STATUS VALIDATION] 결제 상태 3단계 분기 처리
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const FAILED_STATUSES = ["FAILED", "CANCELLED", "PARTIAL_CANCELLED"];
    const PENDING_STATUSES = ["PENDING", "READY", "PAY_PENDING"];

    // [Case 2] 명백한 실패 (FAILED, CANCELLED 등)
    if (FAILED_STATUSES.includes(paymentStatus)) {
      console.error("[portone-payment-confirm] ❌ 결제 실패/취소 상태 감지 — 주문 승인 거부:", {
        paymentId,
        paymentStatus,
        orderId: order.id,
      });

      // 주문 상태를 FAILED로 업데이트
      const { error: failUpdateError } = await supabase
        .from("orders")
        .update({
          status: "failed",
          payment_status: "failed",
          updated_at: new Date().toISOString(),
          metadata: {
            ...(order.metadata || {}),
            portone_status: paymentStatus,
            portone_payment_id: paymentId,
            failed_at: new Date().toISOString(),
          },
        })
        .eq("id", order.id);

      if (failUpdateError) {
        console.error("[portone-payment-confirm] 주문 FAILED 업데이트 실패:", failUpdateError);
      }

      return buildResponse(
        {
          success: false,
          error: {
            message: "결제에 실패했습니다. 카드 잔고나 상태를 확인 후 다시 시도해 주세요.",
            errorCode: "PAYMENT_FAILED",
            paymentStatus,
          },
        },
        400,
        origin
      );
    }

    // [Case 3] 처리 중 (PENDING, READY 등) — 해외 결제 지연 등
    if (PENDING_STATUSES.includes(paymentStatus)) {
      console.log("[portone-payment-confirm] ⏳ 결제 처리 대기 중:", {
        paymentId,
        paymentStatus,
        orderId: order.id,
      });

      // 주문 상태를 pending으로 유지
      const { error: pendingUpdateError } = await supabase
        .from("orders")
        .update({
          transaction_id: paymentId,
          payment_provider: "portone",
          updated_at: new Date().toISOString(),
          metadata: {
            ...(order.metadata || {}),
            portone_status: paymentStatus,
            portone_payment_id: paymentId,
          },
        })
        .eq("id", order.id);

      if (pendingUpdateError) {
        console.error("[portone-payment-confirm] 주문 PENDING 업데이트 실패:", pendingUpdateError);
      }

      return buildResponse(
        {
          success: false,
          pending: true,
          message: "결제 승인 대기 중입니다. 처리가 완료되면 자동으로 업데이트됩니다.",
          errorCode: "PAYMENT_PENDING",
          data: {
            order,
            status: paymentStatus,
            paymentId,
          },
        },
        200,
        origin
      );
    }

    // [Unknown] PAID도, VIRTUAL_ACCOUNT_ISSUED도, FAILED도, PENDING도 아닌 상태 → 안전을 위해 거부
    if (!isPaid && !isVirtualAccountIssued) {
      console.error("[portone-payment-confirm] ❌ 알 수 없는 결제 상태 — 주문 승인 거부:", {
        paymentId,
        paymentStatus,
      });
      return buildResponse(
        {
          success: false,
          error: {
            message: `결제 상태를 확인할 수 없습니다 (${paymentStatus}). 고객센터에 문의해 주세요.`,
            errorCode: "PAYMENT_UNKNOWN_STATUS",
            paymentStatus,
          },
        },
        400,
        origin
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [Case 1] ✅ 결제 완료 확인 (PAID 또는 VIRTUAL_ACCOUNT_ISSUED)
    // 여기서부터는 결제가 확실히 완료/가상계좌 발급된 경우만 처리
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("[portone-payment-confirm] ✅ 결제 상태 확인 완료:", {
      paymentId,
      paymentStatus,
      orderId: order.id,
    });

    // 가상계좌 정보 추출 및 매핑
    const va = portonePayment.virtualAccount;
    const virtualAccountInfo = va ? {
      // 로그에 나온 bank_code 대응 추가
      bankName: va.bankName || va.bank_name || va.bank || va.bankCode || va.bank_code || null,
      accountNumber: va.accountNumber || va.account_number || null,
      accountHolder: va.accountHolder || va.account_holder || va.remittee_name || null,
      expiresAt: va.expiresAt || va.expires_at || va.expired_at || va.valid_until || null,
    } : null;

    // DB 업데이트
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      transaction_id: paymentId,
      payment_provider: "portone",
      payment_confirmed_at: nowIso,
      metadata: {
        ...(order.metadata || {}),
        portone_status: paymentStatus,
        portone_payment_id: paymentId,
      },
    };

    // payment_method가 비어있으면 PortOne 응답 정보로 추론하여 설정
    if (!order.payment_method) {
      if (isVirtualAccountIssued || virtualAccountInfo) {
        updatePayload.payment_method = "virtual_account";
      } else if (isPaid) {
        // PortOne PG 제공자 / 결제수단 정보로 정확한 결제수단 판별
        const pg = portonePayment.pgProvider || '';
        const method = portonePayment.payMethod || '';
        
        if (pg.includes('kakaopay') || pg.includes('kakao')) {
          updatePayload.payment_method = "kakaopay";
        } else if (method === 'EASY_PAY' && pg.includes('kakao')) {
          updatePayload.payment_method = "kakaopay";
        } else if (pg.includes('paypal')) {
          updatePayload.payment_method = "paypal";
        } else if (method === 'TRANSFER') {
          updatePayload.payment_method = "transfer";
        } else {
          // 기본값: 카드 결제
          updatePayload.payment_method = "card";
        }
        
        console.log("[portone-payment-confirm] 결제수단 추론:", {
          pgProvider: pg,
          payMethod: method,
          resolved: updatePayload.payment_method,
        });
      }
    }

    if (isPaid) {
      updatePayload.payment_status = "paid";
      updatePayload.status = "completed";
    } else if (isVirtualAccountIssued) {
      updatePayload.payment_status = "awaiting_deposit";
      updatePayload.status = "pending";
      if (virtualAccountInfo) {
        updatePayload.virtual_account_info = virtualAccountInfo;
      }
    }

    const { error: updateError, data: updatedOrder } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", order.id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error("[portone-payment-confirm] ❌ DB 업데이트 실패:", {
        error: updateError,
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
        orderId: order.id,
        paymentId,
      });
      throw updateError;
    }

    const responseOrder = updatedOrder || order;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [추가] PAID 상태일 때 purchases 테이블에 구매 기록 삽입
    // → 웹훅으로만 주문이 완료되는 경우 (PayPal PAY_PENDING → PAID 전환 시)
    //   purchases 레코드가 없으면 사용자가 구매한 악보를 볼 수 없으므로
    //   여기서도 purchases를 생성해야 함
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (isPaid) {
      try {
        const { data: orderItems, error: itemsError } = await supabase
          .from("order_items")
          .select("id, drum_sheet_id, price")
          .eq("order_id", order.id);

        if (itemsError) {
          console.error("[portone-payment-confirm] ❌ order_items 조회 실패:", {
            error: itemsError,
            orderId: order.id,
          });
        } else if (orderItems && orderItems.length > 0) {
          const purchaseRecords = orderItems.map((item: any) => ({
            user_id: order.user_id,
            drum_sheet_id: item.drum_sheet_id,
            order_id: order.id,
            price_paid: item.price ?? 0,
          }));

          const { error: purchasesError } = await supabase
            .from("purchases")
            .insert(purchaseRecords);

          if (purchasesError && purchasesError.code !== "23505") {
            // 23505 = unique_violation (이미 purchases에 기록 존재 → 중복 무시)
            console.error("[portone-payment-confirm] ❌ purchases 기록 실패:", {
              error: purchasesError,
              code: purchasesError.code,
              message: purchasesError.message,
              orderId: order.id,
            });
          } else {
            console.log("[portone-payment-confirm] ✅ purchases 기록 완료:", orderItems.length, "건");
          }
        } else {
          console.warn("[portone-payment-confirm] ⚠️ order_items가 없음 (Lazy Creation 주문일 수 있음):", {
            orderId: order.id,
          });
        }
      } catch (purchaseErr) {
        console.error("[portone-payment-confirm] ❌ purchases 기록 중 예외:", {
          error: purchaseErr,
          message: purchaseErr instanceof Error ? purchaseErr.message : String(purchaseErr),
          orderId: order.id,
        });
      }
    }

    // 최종 결과 반환
    return buildResponse({
      success: true,
      data: {
        order: responseOrder,
        status: paymentStatus,
        paymentId,
        virtualAccountInfo, // 이제 여기에 데이터가 들어갑니다!
      },
    }, 200, origin);

  } catch (error) {
    console.error("[portone-payment-confirm] ❌ 오류:", {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return buildResponse(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Internal server error",
          details: error 
        },
      },
      500,
      origin
    );
  }
});