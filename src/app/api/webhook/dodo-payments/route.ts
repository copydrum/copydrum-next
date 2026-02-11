import { Webhooks } from "@dodopayments/nextjs";

/**
 * Dodo Payments 웹훅 핸들러
 *
 * 결제 성공, 환불, 구독 변경 등의 이벤트를 수신하고 처리합니다.
 *
 * 환경 변수 필요:
 * - DODO_WEBHOOK_SECRET: Dodo Payments 웹훅 시크릿 키
 *
 * 엔드포인트: POST /api/webhook/dodo-payments
 *
 * 보안:
 * - webhook-id, webhook-signature, webhook-timestamp 헤더로 서명 검증
 * - 검증 실패 시 401 반환
 * - 잘못된 페이로드 시 400 반환
 */
export const POST = Webhooks({
  webhookKey: process.env.DODO_WEBHOOK_SECRET!,
  onPayload: async (payload) => {
    // 수신된 웹훅 페이로드 로깅
    console.log("[dodo-webhook] Received event:", payload.type);

    // 이벤트 타입별 처리
    switch (payload.type) {
      case "payment.succeeded":
        console.log("[dodo-webhook] Payment succeeded:", payload);
        // TODO: 주문 상태를 'paid'로 업데이트
        // TODO: 사용자에게 구매 확인 이메일 발송
        break;

      case "payment.failed":
        console.log("[dodo-webhook] Payment failed:", payload);
        // TODO: 주문 상태를 'failed'로 업데이트
        break;

      case "refund.succeeded":
        console.log("[dodo-webhook] Refund succeeded:", payload);
        // TODO: 환불 처리 로직
        break;

      default:
        console.log("[dodo-webhook] Unhandled event type:", payload.type);
        break;
    }
  },
});
