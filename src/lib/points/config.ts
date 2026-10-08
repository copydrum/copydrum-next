/**
 * 적립 포인트 정책 (DB 함수 points_earn_rate / points_signup_bonus 와 값을 맞춘다)
 * 캐쉬(profiles.credits)와 별개의 잔액이며, 결제 시 포인트를 먼저 차감한다.
 */
export const POINT_EARN_RATE = 0.03;
export const POINT_SIGNUP_BONUS = 1000;
export const POINT_VALID_DAYS = 365;
/** 마이페이지에서 "곧 소멸" 으로 안내하는 기간 */
export const POINT_EXPIRY_NOTICE_DAYS = 30;

/** 결제할 금액(포인트 차감 후) 기준 적립 예정 포인트 */
export function calcEarnPoints(paidAmountKrw: number, rate: number = POINT_EARN_RATE): number {
  return Math.max(0, Math.floor(Math.max(0, paidAmountKrw) * rate));
}
