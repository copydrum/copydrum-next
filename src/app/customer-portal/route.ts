import { CustomerPortal } from "@dodopayments/nextjs";

/**
 * Dodo Payments 고객 포털 핸들러
 *
 * 인증된 사용자를 Dodo Payments 고객 포털로 리다이렉트합니다.
 *
 * 환경 변수 필요:
 * - DODO_PAYMENTS_API_KEY: Dodo Payments Bearer Token
 * - DODO_PAYMENTS_ENVIRONMENT: "test_mode" | "live_mode"
 *
 * 쿼리 파라미터:
 * - customer_id (필수): 고객 ID (예: ?customer_id=cus_123)
 * - send_email (선택, boolean): true일 경우 고객에게 포털 링크 이메일 발송
 *
 * 엔드포인트: GET /customer-portal?customer_id=cus_123
 */
export const GET = CustomerPortal({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: process.env.DODO_PAYMENTS_ENVIRONMENT || "test_mode",
});
