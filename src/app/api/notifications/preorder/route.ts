import { NextRequest, NextResponse } from 'next/server';
import { sendPreorderNotification } from '@/lib/email/sendPreorderNotification';

/**
 * 선주문 알림 이메일 전송 API
 * 클라이언트 사이드 코드(cashPurchases 등)에서 nodemailer를 직접 import하면
 * 브라우저 번들에 포함되어 빌드 에러가 발생하므로, 서버 사이드 API route로 분리.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      orderId,
      orderNumber,
      userId,
      userEmail,
      totalAmount,
      paymentMethod,
      items,
      expectedCompletionDate,
      paymentConfirmedAt,
    } = body;

    if (!orderId || !userId || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 },
      );
    }

    await sendPreorderNotification({
      orderId,
      orderNumber,
      userId,
      userEmail,
      totalAmount: totalAmount ?? 0,
      paymentMethod: paymentMethod ?? 'unknown',
      items,
      expectedCompletionDate: expectedCompletionDate ?? null,
      paymentConfirmedAt,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API /notifications/preorder] 알림 전송 실패:', error);
    return NextResponse.json(
      { success: false, error: '알림 전송 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
