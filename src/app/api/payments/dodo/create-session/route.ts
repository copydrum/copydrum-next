import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount, orderName, customerEmail, customerName } = body;

    if (!orderId || !amount) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const secretKey = process.env.DODO_PAYMENTS_SECRET_KEY;
    const apiUrl = process.env.DODO_PAYMENTS_API_URL || 'https://api.dodopayments.com';

    if (!secretKey) {
      return NextResponse.json(
        { success: false, error: 'DODO Payments not configured' },
        { status: 500 }
      );
    }

    // DODO Payments API로 checkout session 생성
    const response = await fetch(`${apiUrl}/checkout-sessions/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment_link_id: null, // 직접 결제
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success?orderId=${orderId}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/cancel?orderId=${orderId}`,
        metadata: {
          orderId,
          source: 'copydrum_checkout',
        },
        product_cart: [
          {
            product_name: orderName,
            quantity: 1,
            unit_price: amount,
            currency: 'KRW',
          },
        ],
        customer: {
          email: customerEmail,
          name: customerName,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('[DODO API] Error:', result);
      return NextResponse.json(
        {
          success: false,
          error: result.message || 'Failed to create checkout session',
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId: result.id,
      payment_url: result.payment_url,
    });
  } catch (error) {
    console.error('[DODO API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
