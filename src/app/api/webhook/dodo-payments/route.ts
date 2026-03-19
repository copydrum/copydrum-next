import { NextRequest, NextResponse } from "next/server";

/**
 * Dodo Payments 웹훅은 더 이상 사용하지 않습니다.
 * (저작권 이슈로 Dodo Payments 비활성화)
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "Dodo Payments webhook is no longer active." },
    { status: 503 }
  );
}
