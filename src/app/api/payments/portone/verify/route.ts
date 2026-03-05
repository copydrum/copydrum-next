import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ✅ Service Role Key로 Admin 클라이언트 생성 (RLS 우회)
// API Route는 서버에서 실행되므로 인증 세션이 없음 → anon key로는 업데이트 실패 가능
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  console.warn('[verify] ⚠️ Service Role Key 없음 → Anon Key 사용 (RLS 적용됨)');
  return createClient(url, anonKey);
}

// 포트원 API 액세스 토큰 발급
async function getPortOneAccessToken(apiSecret: string): Promise<string> {
  const cleanSecret = apiSecret.replace(/[\s"']/g, "").trim();
  
  const response = await fetch("https://api.portone.io/login/api-secret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiSecret: cleanSecret }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[verify] 포트원 토큰 발급 실패", { status: response.status, body: errorText });
    throw new Error(`Failed to login to PortOne: ${errorText}`);
  }

  const result = await response.json();
  return result.accessToken;
}

// 포트원 API로 결제 정보 조회
async function getPortOnePayment(paymentId: string, apiSecret: string): Promise<any> {
  const accessToken = await getPortOneAccessToken(apiSecret);
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
    console.error("[verify] 포트원 API 조회 실패", { status: response.status, body: errorText });
    throw new Error(`PortOne API error: ${response.status} ${errorText}`);
  }

  const rawResult = await response.json();
  
  if (rawResult.payment && rawResult.payment.transactions && rawResult.payment.transactions.length > 0) {
    const tx = rawResult.payment.transactions[0];
    return {
      id: rawResult.payment.id,
      transactionId: tx.id,
      status: tx.status,
      amount: tx.amount,
      orderName: rawResult.payment.order_name,
      metadata: tx.metadata || rawResult.payment.metadata || {},
      customer: rawResult.payment.customer || {},
    };
  }

  console.error("[verify] 예상치 못한 포트원 응답 구조", rawResult);
  throw new Error("Invalid payment data structure from PortOne");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 포트원 V2 결제 상태값 분류 (엄격한 화이트리스트 방식)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const PAID_STATUSES = ['PAID'] as const;
const FAILED_STATUSES = ['FAILED', 'CANCELLED', 'PARTIAL_CANCELLED'] as const;
const PENDING_STATUSES = ['PENDING', 'READY', 'PAY_PENDING', 'VIRTUAL_ACCOUNT_ISSUED'] as const;

function classifyPaymentStatus(status: string): 'PAID' | 'FAILED' | 'PENDING' | 'UNKNOWN' {
  if ((PAID_STATUSES as readonly string[]).includes(status)) return 'PAID';
  if ((FAILED_STATUSES as readonly string[]).includes(status)) return 'FAILED';
  if ((PENDING_STATUSES as readonly string[]).includes(status)) return 'PENDING';
  return 'UNKNOWN';
}

// 기존 주문이 있으면 상태를 업데이트하는 헬퍼 함수
async function updateOrderStatusIfExists(
  supabase: ReturnType<typeof createClient>,
  orderId: string | undefined,
  paymentId: string,
  status: string,
  paymentStatus: string,
): Promise<void> {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let order: any = null;

  // orderId로 조회
  if (orderId && uuidRegex.test(orderId)) {
    const { data } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .maybeSingle();
    order = data;
  }

  // transaction_id로 조회
  if (!order) {
    const { data } = await supabase
      .from('orders')
      .select('id')
      .eq('transaction_id', paymentId)
      .maybeSingle();
    order = data;
  }

  if (order) {
    const { error } = await supabase
      .from('orders')
      .update({
        status,
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (error) {
      console.error(`[verify] 주문 상태(${status}) 업데이트 실패:`, { orderId: order.id, error });
    } else {
      console.log(`[verify] 주문 상태 → ${status} 업데이트 완료:`, { orderId: order.id });
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentId, orderId, paymentMethod } = body;

    if (!paymentId) {
      console.error('[verify] ❌ paymentId 누락:', body);
      return NextResponse.json(
        { success: false, error: '결제 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [CRITICAL STEP] 포트원 API로 결제 상태를 무조건 먼저 검증
    // 결제가 실제로 PAID 상태인지 확인하지 않으면 절대 주문을 완료하지 않음
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const portoneApiKey = process.env.PORTONE_API_KEY;
    if (!portoneApiKey) {
      console.error('[verify] ❌ PORTONE_API_KEY 환경변수 없음');
      return NextResponse.json(
        { success: false, error: '서버 설정 오류: 결제 검증을 수행할 수 없습니다.' },
        { status: 500 }
      );
    }

    let portonePayment: any;
    try {
      portonePayment = await getPortOnePayment(paymentId, portoneApiKey);
      console.log('[verify] 🔍 포트원 결제 단건 조회 결과:', {
        paymentId: portonePayment.id,
        status: portonePayment.status,
        amount: portonePayment.amount,
      });
    } catch (portoneError) {
      console.error('[verify] ❌ 포트원 API 결제 조회 실패 — 결제 검증 불가, 주문 승인 거부:', {
        error: portoneError instanceof Error ? portoneError.message : String(portoneError),
        paymentId,
      });
      // 포트원 API 조회 자체가 실패하면 결제 상태를 확인할 수 없으므로 절대 승인하지 않음
      return NextResponse.json(
        {
          success: false,
          error: '결제 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
          errorCode: 'PAYMENT_VERIFICATION_FAILED',
        },
        { status: 502 }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [PAYMENT STATUS VALIDATION] 결제 상태 3단계 분기 처리
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const portoneStatus = portonePayment.status;
    const statusCategory = classifyPaymentStatus(portoneStatus);

    // ────────────────────────────────────────────────────────────────
    // [Case 2] 명백한 실패 (FAILED, CANCELLED 등) 또는 PG사 에러
    // → 주문을 절대 승인하지 않음. 주문 상태를 'FAILED'로 처리.
    // ────────────────────────────────────────────────────────────────
    if (statusCategory === 'FAILED') {
      console.error('[verify] ❌ 결제 실패/취소 상태 감지 — 주문 승인 거부:', {
        paymentId,
        portoneStatus,
      });

      // 기존 주문이 있으면 FAILED로 업데이트
      await updateOrderStatusIfExists(supabase, orderId, paymentId, 'failed', 'failed');

      return NextResponse.json(
        {
          success: false,
          error: '결제에 실패했습니다. 카드 잔고나 상태를 확인 후 다시 시도해 주세요.',
          errorCode: 'PAYMENT_FAILED',
          paymentStatus: portoneStatus,
        },
        { status: 400 }
      );
    }

    // ────────────────────────────────────────────────────────────────
    // [Case 3] 처리 중 (PENDING, READY, PAY_PENDING, VIRTUAL_ACCOUNT_ISSUED)
    // → 해외 결제 지연 등으로 아직 처리 중일 수 있음.
    //   무작정 에러를 던지지 않고, 주문 상태를 PENDING으로 유지.
    //   이후 Webhook을 통해 최종 성공/실패 여부를 업데이트.
    // ────────────────────────────────────────────────────────────────
    if (statusCategory === 'PENDING') {
      console.log('[verify] ⏳ 결제 처리 대기 중 — 주문 승인 보류:', {
        paymentId,
        portoneStatus,
      });

      // 기존 주문이 있으면 pending 상태 유지 확인
      await updateOrderStatusIfExists(supabase, orderId, paymentId, 'pending', 'pending');

      return NextResponse.json({
        success: false,
        pending: true,
        message: '결제 승인 대기 중입니다. 처리가 완료되면 자동으로 업데이트됩니다.',
        errorCode: 'PAYMENT_PENDING',
        paymentStatus: portoneStatus,
      });
    }

    // ────────────────────────────────────────────────────────────────
    // [Unknown] 알 수 없는 상태 → 안전을 위해 거부 (화이트리스트 방식)
    // ────────────────────────────────────────────────────────────────
    if (statusCategory === 'UNKNOWN') {
      console.error('[verify] ❌ 알 수 없는 결제 상태 — 안전을 위해 주문 승인 거부:', {
        paymentId,
        portoneStatus,
      });

      return NextResponse.json(
        {
          success: false,
          error: '결제 상태를 확인할 수 없습니다. 고객센터에 문의해 주세요.',
          errorCode: 'PAYMENT_UNKNOWN_STATUS',
          paymentStatus: portoneStatus,
        },
        { status: 400 }
      );
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // [Case 1] ✅ 결제 완료 확인 (PAID)
    // 여기서부터는 결제가 확실히 PAID인 경우만 주문 완료 처리 진행
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('[verify] ✅ 포트원 결제 PAID 확인 완료 — 주문 완료 처리 진행:', {
      paymentId,
      portoneStatus,
      amount: portonePayment.amount,
    });

    // ─── 주문 조회 시작 ───
    let order: any = null;

    // 1. 주문 정보 조회 (orderId가 있으면 먼저 조회)
    // UUID 형식 검증 (DB의 id 컬럼이 UUID 타입이므로 non-UUID 전달 시 PostgreSQL 에러 발생)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUUID = orderId ? uuidRegex.test(orderId) : false;

    if (orderId && isValidUUID) {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError) {
        console.error('[verify] ❌ 주문 조회 실패 (orderId:', orderId, '):', {
          error: orderError,
          code: orderError.code,
          message: orderError.message,
          details: orderError.details,
          hint: orderError.hint,
        });
      } else if (orderData) {
        order = orderData;
        console.log('[verify] ✅ 주문 조회 성공 (orderId:', orderId, ')');
      }
    } else if (orderId && !isValidUUID) {
      console.warn('[verify] ⚠️ orderId가 UUID 형식이 아님, 건너뜀:', orderId);
    }

    // 2. 주문이 없으면 transaction_id로 조회 시도
    if (!order) {
      console.log('[verify] 주문이 없음, transaction_id로 조회 시도:', paymentId);
      const { data: orderByTxId, error: txError } = await supabase
        .from('orders')
        .select('*')
        .eq('transaction_id', paymentId)
        .maybeSingle();

      if (txError) {
        console.error('[verify] ❌ transaction_id로 주문 조회 실패:', {
          error: txError,
          code: txError.code,
          message: txError.message,
        });
      } else if (orderByTxId) {
        order = orderByTxId;
        console.log('[verify] ✅ transaction_id로 주문 조회 성공');
      }
    }

    // 3. 주문이 여전히 없으면 포트원 결제 정보로 주문 생성 시도 (Lazy Creation)
    //    (포트원 결제 정보는 이미 위에서 조회 완료 & PAID 확인됨)
    if (!order) {
      console.error('[verify] ⚠️ 주문이 DB에 없음. 포트원 결제 정보로 주문 생성 시도:', {
        paymentId,
        orderId: orderId || '없음',
      });

      try {
        // metadata에서 clientOrderId 또는 supabaseOrderId 추출
        const metadata = portonePayment.metadata || {};
        const clientOrderId = metadata.clientOrderId || metadata.supabaseOrderId || orderId;
        const customerId = portonePayment.customer?.customerId || metadata.userId;

        if (!clientOrderId) {
          console.error('[verify] ❌ metadata에 clientOrderId 없음. 주문 생성 불가:', {
            paymentId,
            metadata,
          });
          return NextResponse.json(
            { success: false, error: '주문 정보를 찾을 수 없습니다. metadata에 주문 ID가 없습니다.' },
            { status: 404 }
          );
        }

        if (!customerId) {
          console.error('[verify] ❌ customerId 없음. 주문 생성 불가:', {
            paymentId,
            customer: portonePayment.customer,
            metadata,
          });
          return NextResponse.json(
            { success: false, error: '사용자 정보를 찾을 수 없습니다.' },
            { status: 404 }
          );
        }

        // UUID 형식 검증 (RFC 4122 표준: 8-4-4-4-12 형식)
        const lazyUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isLazyValidUUID = lazyUuidRegex.test(clientOrderId);
        
        // UUID가 아닌 경우 새로운 UUID 생성 (과거 코드에서 넘어온 요청 대비)
        let finalOrderId: string;
        let originalClientOrderId: string | undefined;
        
        if (isLazyValidUUID) {
          finalOrderId = clientOrderId;
          console.log('[verify] ✅ clientOrderId가 유효한 UUID 형식:', finalOrderId);
        } else {
          // UUID가 아니면 새로 생성하고 원본을 보존
          finalOrderId = crypto.randomUUID();
          originalClientOrderId = clientOrderId;
          console.warn('[verify] ⚠️ clientOrderId가 UUID 형식이 아님. 새 UUID 생성:', {
            original: clientOrderId,
            new: finalOrderId,
          });
        }

        // 주문 금액 계산 (포트원 금액을 KRW로 변환)
        const portoneAmount = portonePayment.amount?.total || portonePayment.amount || 0;
        const portoneCurrency = portonePayment.amount?.currency || 'CURRENCY_KRW';
        let amountKRW = portoneAmount;
        
        if (portoneCurrency === 'CURRENCY_USD' || portoneCurrency === 'USD') {
          amountKRW = Math.round((portoneAmount / 100) * 1300); // USD 센트 → KRW
        } else if (portoneCurrency === 'CURRENCY_JPY' || portoneCurrency === 'JPY') {
          amountKRW = Math.round(portoneAmount * 10); // JPY → KRW (대략)
        }

        // 주문 생성
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
        const orderNumber = `ORDER-${dateStr}-${randomStr}`;

        // metadata에 원본 clientOrderId 보존 (UUID가 아닌 경우)
        const orderMetadata: any = {
          type: 'sheet_purchase',
          description: portonePayment.orderName || 'PayPal 결제',
          created_from: 'verify_api_lazy_creation',
          portone_payment_id: paymentId,
          portone_metadata: metadata,
        };

        // UUID가 아니어서 새로 생성한 경우, 원본 clientOrderId를 metadata에 보존
        if (originalClientOrderId) {
          orderMetadata.original_client_order_id = originalClientOrderId;
          orderMetadata.uuid_converted = true;
        }

        const { data: newOrder, error: createError } = await supabase
          .from('orders')
          .insert({
            id: finalOrderId, // UUID 형식 검증된 ID 사용
            user_id: customerId,
            order_number: orderNumber,
            total_amount: amountKRW,
            status: 'pending',
            payment_status: 'pending',
            payment_method: paymentMethod || 'paypal',
            order_type: 'product',
            transaction_id: paymentId,
            metadata: orderMetadata,
          })
          .select()
          .single();

        if (createError || !newOrder) {
          console.error('[verify] ❌ 주문 생성 실패:', {
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
          return NextResponse.json(
            { 
              success: false, 
              error: '주문 생성에 실패했습니다.',
              details: createError?.message,
              code: createError?.code,
            },
            { status: 500 }
          );
        }

        order = newOrder;
        console.log('[verify] ✅ 주문 생성 성공 (Lazy Creation):', {
          orderId: order.id,
          orderNumber: order.order_number,
          paymentId,
        });
      } catch (portoneError) {
        console.error('[verify] ❌ 주문 생성 실패:', {
          error: portoneError,
          message: portoneError instanceof Error ? portoneError.message : String(portoneError),
          paymentId,
          orderId: orderId || '없음',
        });
        return NextResponse.json(
          { 
            success: false, 
            error: '주문 생성에 실패했습니다.',
            details: portoneError instanceof Error ? portoneError.message : String(portoneError),
          },
          { status: 500 }
        );
      }
    }

    // 4. 이미 완료된 주문인지 확인
    if (order.status === 'completed' && order.payment_status === 'paid') {
      console.log('[verify] ✅ 이미 완료된 주문:', order.id);
      return NextResponse.json({
        success: true,
        message: '이미 처리된 주문입니다.',
        order,
      });
    }

    // 5. completeOrderAfterPayment 호출 (예상 완료일 계산 및 저장 포함, 주문 상태 업데이트도 처리)
    //    ※ 여기에 도달했다는 것은 포트원 결제 상태가 확실히 PAID임을 의미함
    const resolvedPaymentMethod = paymentMethod || order.payment_method || 'paypal';
    try {
      const { completeOrderAfterPayment } = await import('@/lib/payments/completeOrderAfterPayment');
      await completeOrderAfterPayment(order.id, resolvedPaymentMethod as any, {
        transactionId: paymentId,
        paymentConfirmedAt: new Date().toISOString(),
        paymentProvider: 'portone',
      });
      console.log('[verify] ✅ completeOrderAfterPayment 처리 완료');
    } catch (completeError) {
      console.error('[verify] ⚠️ completeOrderAfterPayment 처리 실패, 직접 업데이트 시도:', completeError);
      
      // Fallback: completeOrderAfterPayment 실패 시 직접 업데이트
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'completed',
          payment_status: 'paid',
          payment_method: resolvedPaymentMethod,
          transaction_id: paymentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
        .select()
        .single();

      if (updateError) {
        console.error('[verify] ❌ 주문 업데이트 실패:', {
          error: updateError,
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          orderId: order.id,
          paymentId,
        });
        return NextResponse.json(
          { 
            success: false, 
            error: '주문 업데이트에 실패했습니다.',
            details: updateError.message,
            code: updateError.code,
          },
          { status: 500 }
        );
      }
    }

    // 주문 정보 다시 조회 (completeOrderAfterPayment가 업데이트했을 수 있음)
    const { data: updatedOrder } = await supabase
      .from('orders')
      .select()
      .eq('id', order.id)
      .single();

    console.log('[verify] ✅ 결제 검증 완료:', {
      orderId: updatedOrder?.id || order.id,
      paymentId,
      paymentMethod: resolvedPaymentMethod,
      portoneStatus,
    });

    // 7. purchases 테이블에 구매 기록 삽입 (중복 방지를 위해 completeOrderAfterPayment 이후에)
    try {
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('id, drum_sheet_id, price')
        .eq('order_id', updatedOrder.id);

      if (itemsError) {
        console.error('[verify] ❌ order_items 조회 실패:', {
          error: itemsError,
          orderId: updatedOrder.id,
        });
      } else if (orderItems && orderItems.length > 0) {
        const purchaseRecords = orderItems.map((item: any) => ({
          user_id: updatedOrder.user_id,
          drum_sheet_id: item.drum_sheet_id,
          order_id: updatedOrder.id,
          price_paid: item.price ?? 0,
        }));

        const { error: purchasesError } = await supabase
          .from('purchases')
          .insert(purchaseRecords);

        if (purchasesError && purchasesError.code !== '23505') {
          console.error('[verify] ❌ purchases 기록 실패:', {
            error: purchasesError,
            code: purchasesError.code,
            message: purchasesError.message,
            orderId: updatedOrder.id,
          });
        } else {
          console.log('[verify] ✅ purchases 기록 완료:', orderItems.length, '건');
        }
      } else {
        console.warn('[verify] ⚠️ order_items가 없음 (주문 아이템 정보 없음):', {
          orderId: updatedOrder.id,
        });
      }
    } catch (purchaseErr) {
      console.error('[verify] ❌ purchases 기록 중 예외:', {
        error: purchaseErr,
        message: purchaseErr instanceof Error ? purchaseErr.message : String(purchaseErr),
        orderId: updatedOrder.id,
      });
    }

    return NextResponse.json({
      success: true,
      message: '결제가 확인되었습니다.',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('[verify] ❌ 결제 검증 오류:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '결제 검증 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
