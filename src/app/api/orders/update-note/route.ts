import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service Role Key로 Admin 권한 (RLS 우회)
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }
  return createClient(url, anonKey);
}

export async function POST(request: NextRequest) {
  try {
    const { orderId, note, noteType } = await request.json();

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'orderId는 필수입니다.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1. 기존 주문 조회
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, metadata, payment_note')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchError || !order) {
      console.warn('[update-note] 주문 찾지 못함:', orderId, fetchError);
      return NextResponse.json(
        { success: false, error: '주문을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 2. payment_note 업데이트
    const timestamp = new Date().toISOString();
    const noteEntry = {
      type: noteType || 'unknown', // 'cancel' | 'error' | 'system_error'
      message: note || '사유 없음',
      timestamp,
    };

    // metadata에 payment_notes 배열로 누적 저장 (여러 시도 기록 가능)
    const existingMetadata = order.metadata || {};
    const existingNotes = existingMetadata.payment_notes || [];
    existingNotes.push(noteEntry);

    const updatedMetadata = {
      ...existingMetadata,
      payment_notes: existingNotes,
    };

    // payment_note 컬럼 + metadata 모두 업데이트
    // payment_note 컬럼은 최신 사유만 기록 (간단 조회용)
    // metadata.payment_notes는 전체 이력 보관
    const latestNote = `[${noteType || 'unknown'}] ${note || '사유 없음'} (${timestamp})`;

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_note: latestNote,
        metadata: updatedMetadata,
      })
      .eq('id', orderId);

    if (updateError) {
      // payment_note 컬럼이 아직 없는 경우 metadata만 업데이트
      if (updateError.message?.includes('payment_note') || updateError.code === '42703') {
        console.warn('[update-note] payment_note 컬럼 없음, metadata만 업데이트');
        const { error: fallbackError } = await supabase
          .from('orders')
          .update({ metadata: updatedMetadata })
          .eq('id', orderId);

        if (fallbackError) {
          console.error('[update-note] metadata 업데이트도 실패:', fallbackError);
          return NextResponse.json(
            { success: false, error: 'payment_note 업데이트 실패' },
            { status: 500 }
          );
        }
      } else {
        console.error('[update-note] 업데이트 실패:', updateError);
        return NextResponse.json(
          { success: false, error: 'payment_note 업데이트 실패' },
          { status: 500 }
        );
      }
    }

    console.log('[update-note] ✅ payment_note 기록 완료:', {
      orderId,
      noteType,
      note,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[update-note] 🔥 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'payment_note 업데이트 중 오류',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
