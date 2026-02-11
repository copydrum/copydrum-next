import { NextRequest, NextResponse } from 'next/server';
import { requestKakaoPayPayment } from '@/lib/payments/portone';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, amount, orderName, userEmail } = body;

    if (!orderId || !amount || !orderName) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // PortOne을 통한 카카오페이 결제 준비
    const result = await requestKakaoPayPayment({
      orderId,
      amount,
      orderName,
      customerEmail: userEmail,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to prepare Kakao Pay payment' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      next_redirect_pc_url: result.redirectUrl,
      next_redirect_mobile_url: result.redirectUrl,
    });
  } catch (error) {
    console.error('[KakaoPay API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
