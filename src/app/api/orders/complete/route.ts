import { NextResponse } from 'next/server';

/**
 * ⚠️ DEPRECATED / DISABLED — POST /api/orders/complete
 *
 * 이 엔드포인트는 PG 결제 증명 없이 클라이언트가 보낸 orderId 만으로
 * 주문을 결제 완료(paid) 처리할 수 있어 결제 우회 취약점이 있었다.
 * (예: success 페이지 URL 파라미터만으로 무료 다운로드 가능)
 *
 * 정상적인 결제 완료 처리는 모두 서버 측 결제 검증을 거치는 경로로 일원화한다:
 *  - PortOne: src/app/api/payments/portone/verify/route.ts
 *  - PayPal:  src/app/api/payments/paypal/capture-order/route.ts
 *  - 포인트:   src/app/api/payments/points/pay/route.ts
 *  - 관리자 수동 확인: 관리자 패널 / admin-complete-order Edge Function
 *
 * 따라서 이 HTTP 엔드포인트는 비활성화한다.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'This endpoint has been disabled. Orders are completed only after server-side payment verification.',
    },
    { status: 410 }
  );
}
