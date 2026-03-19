import { NextResponse } from "next/server";

/**
 * Dodo Payments 고객 포털은 더 이상 사용하지 않습니다.
 * (저작권 이슈로 Dodo Payments 비활성화)
 */
export async function GET() {
  return NextResponse.json(
    { error: "Customer portal is no longer available." },
    { status: 503 }
  );
}
