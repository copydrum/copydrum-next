import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ✅ Service Role Key가 있으면 Admin 권한으로 RLS 우회
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }

  console.warn('[product-update] ⚠️ Service Role Key 없음 → Anon Key 사용 (RLS 적용됨)');
  return createClient(url, anonKey);
}

/**
 * PATCH /api/admin/products/[id]
 * 
 * 상품 정보를 업데이트합니다.
 * PDF가 새로 추가되고 상품이 PREORDER 상태인 경우, 자동으로 완료 처리를 수행합니다.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productId } = await params;
    const updateData = await request.json();

    if (!productId) {
      return NextResponse.json(
        { success: false, error: '상품 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // ============================================================
    // 1단계: 기존 상품 정보 조회
    // ============================================================
    const { data: existingProduct, error: fetchError } = await supabase
      .from('drum_sheets')
      .select('id, sales_type, pdf_url, title, artist')
      .eq('id', productId)
      .single();

    if (fetchError || !existingProduct) {
      console.error('[product-update] ❌ 상품 조회 실패:', fetchError);
      return NextResponse.json(
        {
          success: false,
          error: '상품을 찾을 수 없습니다.',
          details: fetchError?.message,
        },
        { status: 404 }
      );
    }

    const wasPreorder = existingProduct.sales_type === 'PREORDER';
    const hadPdfUrl = !!existingProduct.pdf_url;
    const newPdfUrl = updateData.pdf_url;

    // ============================================================
    // 2단계: 상품 정보 업데이트
    // ============================================================
    const finalUpdateData: any = { ...updateData };

    // PDF가 새로 추가되었고, 기존에 PREORDER였던 경우 → INSTANT로 전환
    if (wasPreorder && !hadPdfUrl && newPdfUrl && newPdfUrl.trim()) {
      finalUpdateData.sales_type = 'INSTANT';
      console.log(`[product-update] 🔄 PREORDER → INSTANT 전환: ${productId} (${existingProduct.title})`);
    }

    const { data: updatedProduct, error: updateError } = await supabase
      .from('drum_sheets')
      .update(finalUpdateData)
      .eq('id', productId)
      .select('id, title, artist, sales_type, pdf_url')
      .single();

    if (updateError) {
      console.error('[product-update] ❌ 상품 업데이트 실패:', updateError);
      return NextResponse.json(
        {
          success: false,
          error: '상품 업데이트에 실패했습니다.',
          details: updateError.message,
        },
        { status: 500 }
      );
    }

    if (!updatedProduct) {
      return NextResponse.json(
        {
          success: false,
          error: '상품 업데이트 후 데이터를 가져올 수 없습니다.',
        },
        { status: 500 }
      );
    }

    // ============================================================
    // 3단계: 선주문 완료 처리 (PDF가 새로 추가되고 PREORDER였던 경우)
    // ============================================================
    if (wasPreorder && !hadPdfUrl && newPdfUrl && newPdfUrl.trim()) {
      console.log(`[product-update] 🎉 선주문 완료 처리 시작: ${productId}`);

      try {
        // 3-1. 해당 상품을 구매한 주문 아이템 찾기
        // 결제 완료된 주문 중에서 해당 상품을 포함한 주문만 찾기
        const { data: orderItems, error: orderItemsError } = await supabase
          .from('order_items')
          .select(`
            id,
            order_id,
            drum_sheet_id,
            orders!inner (
              id,
              user_id,
              status,
              payment_status
            )
          `)
          .eq('drum_sheet_id', productId)
          .eq('orders.payment_status', 'paid'); // 결제 완료된 주문만

        // 사용자 이메일 조회 (별도 쿼리)
        let userEmailsMap = new Map<string, string>(); // user_id -> email
        if (orderItems && orderItems.length > 0) {
          const userIds = [...new Set(orderItems.map((item: any) => item.orders?.user_id).filter(Boolean))];
          
          if (userIds.length > 0) {
            const { data: profiles, error: profilesError } = await supabase
              .from('profiles')
              .select('id, email')
              .in('id', userIds);

            if (!profilesError && profiles) {
              profiles.forEach((profile: any) => {
                if (profile.email) {
                  userEmailsMap.set(profile.id, profile.email);
                }
              });
            }
          }
        }

        if (orderItemsError) {
          console.error('[product-update] ❌ 주문 아이템 조회 실패:', orderItemsError);
          // 주문 조회 실패해도 상품 업데이트는 성공했으므로 계속 진행
        } else if (orderItems && orderItems.length > 0) {
          // 3-2. 주문 상태를 COMPLETED로 업데이트
          const orderIds = [...new Set(orderItems.map((item: any) => item.order_id))];
          
          const { error: ordersUpdateError } = await supabase
            .from('orders')
            .update({ status: 'completed' })
            .in('id', orderIds);

          if (ordersUpdateError) {
            console.error('[product-update] ❌ 주문 상태 업데이트 실패:', ordersUpdateError);
          } else {
            console.log(`[product-update] ✅ ${orderIds.length}개 주문 상태를 COMPLETED로 업데이트 완료`);
          }

          // 3-3. 이메일 발송 (백그라운드, 비동기)
          // 고유한 사용자 이메일 수집
          const userEmails = new Set<string>();
          orderItems.forEach((item: any) => {
            const userId = item.orders?.user_id;
            if (userId) {
              const email = userEmailsMap.get(userId);
              if (email && email.trim()) {
                userEmails.add(email.trim());
              }
            }
          });

          // 이메일 발송은 백그라운드에서 비동기로 처리 (응답을 블로킹하지 않음)
          if (userEmails.size > 0) {
            sendCompletionEmails(
              Array.from(userEmails),
              existingProduct.title || '악보',
              existingProduct.artist || ''
            ).catch((emailError) => {
              console.error('[product-update] ❌ 이메일 발송 실패:', emailError);
              // 이메일 발송 실패는 치명적이지 않으므로 로그만 남김
            });
          }
        }
      } catch (fulfillmentError) {
        console.error('[product-update] ❌ 선주문 완료 처리 중 오류:', fulfillmentError);
        // 완료 처리 실패해도 상품 업데이트는 성공했으므로 계속 진행
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedProduct,
      message: wasPreorder && !hadPdfUrl && newPdfUrl
        ? '상품이 업데이트되었고, 선주문 완료 처리가 완료되었습니다.'
        : '상품이 업데이트되었습니다.',
    });

  } catch (error) {
    console.error('[product-update] 🔥 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: '상품 업데이트 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * 이메일 발송 함수 (비동기, 백그라운드 처리)
 */
async function sendCompletionEmails(
  emails: string[],
  title: string,
  artist: string
): Promise<void> {
  // Supabase Edge Function을 사용하거나, 직접 이메일 서비스 호출
  // 여기서는 Supabase Edge Function을 호출하는 방식으로 구현
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.warn('[product-update] ⚠️ Supabase 설정이 없어 이메일 발송을 건너뜁니다.');
    return;
  }

  try {
    // 각 이메일로 발송 (배치 처리)
    const emailPromises = emails.map(async (email) => {
      try {
        // Supabase Edge Function 호출 (또는 직접 이메일 서비스 API 호출)
        const response = await fetch(`${supabaseUrl}/functions/v1/send-preorder-completion-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({
            email,
            title,
            artist,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`이메일 발송 실패: ${errorText}`);
        }

        console.log(`[product-update] ✅ 이메일 발송 완료: ${email}`);
      } catch (emailError) {
        console.error(`[product-update] ❌ 이메일 발송 실패 (${email}):`, emailError);
        // 개별 이메일 실패는 무시하고 계속 진행
      }
    });

    await Promise.allSettled(emailPromises);
    console.log(`[product-update] 📧 이메일 발송 처리 완료: ${emails.length}개`);
  } catch (error) {
    console.error('[product-update] ❌ 이메일 발송 함수 오류:', error);
    throw error;
  }
}
