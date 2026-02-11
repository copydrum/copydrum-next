import { NextRequest, NextResponse } from 'next/server';

/**
 * DODO Payments 결제 URL 생성 API
 *
 * 환경 변수 필요:
 * - DODO_PAYMENTS_SECRET_KEY: DODO Payments Secret Key
 * - DODO_PAYMENTS_PUBLISHABLE_KEY: DODO Payments Publishable Key (선택)
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount, orderName, customerEmail, customerName } = body;

    // 필수 파라미터 검증
    if (!orderId || !amount || !orderName) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 환경 변수 확인
    const secretKey = process.env.DODO_PAYMENTS_SECRET_KEY;
    if (!secretKey) {
      console.error('[dodo-payments] DODO_PAYMENTS_SECRET_KEY가 설정되지 않았습니다.');
      return NextResponse.json(
        { success: false, error: 'DODO Payments가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // DODO Payments API 엔드포인트
    const DODO_API_URL = process.env.DODO_PAYMENTS_API_URL || 'https://api.dodopayments.com';

    // 결제 완료 후 리다이렉트 URL
    const origin = request.headers.get('origin') || 'http://localhost:3000';
    const successUrl = `${origin}/payment/success?orderId=${orderId}`;
    const cancelUrl = `${origin}/payments/${orderId}`;

    // DODO Payments API 호출
    const dodoResponse = await fetch(`${DODO_API_URL}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        amount,
        currency: 'KRW',
        order_id: orderId,
        order_name: orderName,
        customer_email: customerEmail,
        customer_name: customerName,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          source: 'copydrum',
          order_id: orderId,
        },
      }),
    });

    if (!dodoResponse.ok) {
      const errorData = await dodoResponse.json().catch(() => ({}));
      console.error('[dodo-payments] API 호출 실패:', errorData);
      return NextResponse.json(
        {
          success: false,
          error: errorData.message || 'DODO Payments API 호출에 실패했습니다.',
        },
        { status: dodoResponse.status }
      );
    }

    const dodoData = await dodoResponse.json();

    // 결제 URL이 없는 경우
    if (!dodoData.payment_url && !dodoData.checkout_url) {
      console.error('[dodo-payments] 결제 URL이 없습니다:', dodoData);
      return NextResponse.json(
        { success: false, error: '결제 URL을 받지 못했습니다.' },
        { status: 500 }
      );
    }

    // 성공 응답
    return NextResponse.json({
      success: true,
      payment_url: dodoData.payment_url || dodoData.checkout_url,
      payment_id: dodoData.id || dodoData.payment_id,
      data: dodoData,
    });
  } catch (error) {
    console.error('[dodo-payments] 결제 생성 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'DODO Payments 결제 생성 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
