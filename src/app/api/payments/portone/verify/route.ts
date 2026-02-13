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
    let order: any = null;

    // 1. 주문 정보 조회 (orderId가 있으면 먼저 조회)
    if (orderId) {
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

    // 3. 주문이 여전히 없으면 포트원 API를 조회해서 주문 생성 시도
    if (!order) {
      console.error('[verify] ⚠️ 주문이 DB에 없음. 포트원 API 조회하여 주문 생성 시도:', {
        paymentId,
        orderId: orderId || '없음',
      });

      try {
        const portoneApiKey = process.env.PORTONE_API_KEY;
        if (!portoneApiKey) {
          console.error('[verify] ❌ PORTONE_API_KEY 환경변수 없음');
          return NextResponse.json(
            { success: false, error: '포트원 API 키가 설정되지 않았습니다.' },
            { status: 500 }
          );
        }

        const portonePayment = await getPortOnePayment(paymentId, portoneApiKey);
        console.log('[verify] 포트원 API 조회 결과:', {
          paymentId: portonePayment.id,
          status: portonePayment.status,
          amount: portonePayment.amount,
          metadata: portonePayment.metadata,
        });

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
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isValidUUID = uuidRegex.test(clientOrderId);
        
        // UUID가 아닌 경우 새로운 UUID 생성 (과거 코드에서 넘어온 요청 대비)
        let finalOrderId: string;
        let originalClientOrderId: string | undefined;
        
        if (isValidUUID) {
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
        console.error('[verify] ❌ 포트원 API 조회 또는 주문 생성 실패:', {
          error: portoneError,
          message: portoneError instanceof Error ? portoneError.message : String(portoneError),
          paymentId,
          orderId: orderId || '없음',
        });
        return NextResponse.json(
          { 
            success: false, 
            error: '포트원 API 조회 또는 주문 생성에 실패했습니다.',
            details: portoneError instanceof Error ? portoneError.message : String(portoneError),
          },
          { status: 500 }
        );
      }
    }

    // 4. 이미 완료된 주문인지 확인
    if (order.status === 'completed') {
      console.log('[verify] ✅ 이미 완료된 주문:', order.id);
      return NextResponse.json({
        success: true,
        message: '이미 처리된 주문입니다.',
        order,
      });
    }

    // 5. 주문 상태 업데이트 (payment_method 포함)
    const resolvedPaymentMethod = paymentMethod || order.payment_method || 'paypal';
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        payment_method: resolvedPaymentMethod, // ✅ 결제수단 명시적 업데이트
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

    console.log('[verify] ✅ 결제 검증 완료:', {
      orderId: updatedOrder.id,
      paymentId,
      paymentMethod: resolvedPaymentMethod,
    });

    // 6. purchases 테이블에 구매 기록 삽입
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
