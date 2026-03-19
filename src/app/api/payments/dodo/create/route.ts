import { NextRequest, NextResponse } from 'next/server';

/**
 * Dodo Payments는 더 이상 사용하지 않습니다.
 * (저작권 이슈로 비활성화)
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { success: false, error: 'DODO Payments가 더 이상 제공되지 않습니다.' },
    { status: 503 }
  );
}
