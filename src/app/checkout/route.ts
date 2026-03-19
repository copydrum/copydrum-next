import { NextRequest, NextResponse } from "next/server";

/**
 * Dodo Payments는 저작권 이슈로 더 이상 사용하지 않습니다.
 * 결제는 카카오페이, PayPal, 포인트 등으로 진행해 주세요.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: "Dodo Payments is no longer available. Please use KakaoPay, PayPal, or points.",
    },
    { status: 503 }
  );
}
