import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import {
  LEMON_SQUEEZY_API_BASE,
  getLemonSqueezyConfig,
  buildCheckoutName,
  buildCheckoutDescription,
  krwToStoreUnitAmount,
  resolveCheckoutItemTitle,
  type SanitizedOrderItem,
} from '@/lib/payments/lemonSqueezy';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  console.warn('[ls-checkout] ⚠️ Service Role Key 없음 → Anon Key 사용 (RLS 적용됨)');
  return createClient(url, anonKey);
}

/**
 * POST /api/payments/lemon-squeezy/create-checkout
 *
 * 해외 결제용 Lemon Squeezy 체크아웃을 생성하고 오버레이용 URL을 반환한다.
 *
 * 보안/정책 핵심:
 *  - 금액은 클라이언트를 신뢰하지 않고 서버 DB(orders.total_amount)에서 읽는다.
 *  - 본인 소유의 pending 주문만 결제 가능.
 *  - LS에는 앨범 자켓/이미지/실제 PDF를 절대 전달하지 않는다. (media: [], media:false)
 *  - 곡 제목은 sanitize 된 텍스트 템플릿으로만 전달.
 */
export async function POST(request: NextRequest) {
  try {
    const config = getLemonSqueezyConfig();
    if (!config) {
      console.error('[ls-checkout] ❌ Lemon Squeezy 환경변수 미설정');
      return NextResponse.json(
        { success: false, error: 'Lemon Squeezy가 설정되지 않았습니다.' },
        { status: 500 },
      );
    }

    const body = await request.json();
    const { orderId, locale } = body as { orderId?: string; locale?: string };

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: '주문 ID가 필요합니다.' },
        { status: 400 },
      );
    }

    // 🔒 세션 인증
    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 },
      );
    }

    const supabase = createAdminClient();

    // 주문 + 아이템(악보 제목/아티스트) 조회 — 서버가 신뢰하는 데이터만 사용
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        `
        id,
        user_id,
        total_amount,
        status,
        payment_status,
        order_number,
        order_items (
          drum_sheet_id,
          sheet_title,
          drum_sheets:drum_sheet_id ( title, artist, title_translations )
        )
      `,
      )
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      console.error('[ls-checkout] ❌ 주문 조회 실패:', orderError);
      return NextResponse.json(
        { success: false, error: '주문을 찾을 수 없습니다.' },
        { status: 404 },
      );
    }

    // 🔒 소유권 검증
    if (order.user_id !== authUser.id) {
      return NextResponse.json(
        { success: false, error: '권한이 없습니다.' },
        { status: 403 },
      );
    }

    // 이미 완료된 주문 차단
    if (order.status === 'completed' || order.payment_status === 'paid') {
      return NextResponse.json(
        { success: false, error: '이미 결제가 완료된 주문입니다.' },
        { status: 409 },
      );
    }

    const krwAmount = Math.round(Number(order.total_amount) || 0);
    if (krwAmount <= 0) {
      return NextResponse.json(
        { success: false, error: '주문 금액이 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    // LS 스토어 통화 최소단위(센트) 금액
    const customPrice = krwToStoreUnitAmount(krwAmount, config.storeCurrency, locale);
    if (customPrice <= 0) {
      return NextResponse.json(
        { success: false, error: '결제 금액 계산에 실패했습니다.' },
        { status: 400 },
      );
    }

    // sanitize 된 표시 정보 구성 (앨범 자켓·이미지 없음, 텍스트만)
    const rawItems = (order.order_items || []) as any[];
    const sanitizedItems: SanitizedOrderItem[] = rawItems.map((it) => {
      const koreanTitle = it.drum_sheets?.title || it.sheet_title || 'Drum Sheet';
      return {
        title: resolveCheckoutItemTitle(
          koreanTitle,
          it.drum_sheets?.title_translations,
          locale,
        ),
        artist: it.drum_sheets?.artist || null,
      };
    });
    if (sanitizedItems.length === 0) {
      sanitizedItems.push({ title: 'CopyDrum Drum Sheet', artist: null });
    }

    const checkoutName = buildCheckoutName(sanitizedItems);
    const checkoutDescription = buildCheckoutDescription(sanitizedItems);

    const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    const sheetIds = rawItems.map((it) => it.drum_sheet_id).filter(Boolean);

    // ── Lemon Squeezy Create Checkout API 호출 ──
    // 문서: https://docs.lemonsqueezy.com/api/checkouts/create-checkout
    // ⚠️ 선택 필드(description/redirect_url 등)는 "빈 값이면 아예 넣지 않는다".
    //    LS는 빈 문자열을 string 검증에서 거부할 수 있어, 값이 있을 때만 포함한다.
    const productOptions: Record<string, unknown> = {
      name: checkoutName,
      // 🚫 앨범 자켓 등 이미지 전달 안 함
      media: [],
      receipt_button_text: 'Back to CopyDrum',
    };
    // 장바구니(여러 곡)일 때만 곡 목록을 설명으로 전달 (단건은 생략)
    if (checkoutDescription) {
      productOptions.description = checkoutDescription;
    }
    if (appUrl) {
      // 결제 후 자체 안내 페이지로 이동
      productOptions.redirect_url = `${appUrl}/payment/success?orderId=${order.id}&method=lemonsqueezy`;
      productOptions.receipt_link_url = appUrl;
    }

    const checkoutOptions: Record<string, unknown> = {
      embed: true,    // 오버레이 결제 (사이트 이탈 없음)
      media: false,   // 🚫 체크아웃 이미지 숨김 (자켓 노출 차단)
      desc: sanitizedItems.length > 1, // 장바구니일 때만 설명 표시
    };

    const payload = {
      data: {
        type: 'checkouts',
        attributes: {
          // 이번 결제 금액 (스토어 통화 최소 단위 정수)
          custom_price: customPrice,
          product_options: productOptions,
          checkout_options: checkoutOptions,
          checkout_data: {
            email: authUser.email || undefined,
            custom: {
              // 웹훅에서 이 값으로 주문을 매칭한다 (LS는 custom 값을 문자열로 보관)
              order_id: String(order.id),
              user_id: String(order.user_id),
              order_number: String(order.order_number || ''),
              sheet_ids: sheetIds.join(','),
            },
          },
          // 테스트 모드 결제 여부 (라이브 전환 시 LEMON_SQUEEZY_TEST_MODE=false)
          test_mode: config.testMode,
        },
        relationships: {
          store: {
            data: { type: 'stores', id: String(config.storeId) },
          },
          variant: {
            data: { type: 'variants', id: String(config.variantId) },
          },
        },
      },
    };

    const lsResponse = await fetch(`${LEMON_SQUEEZY_API_BASE}/checkouts`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const lsResult = await lsResponse.json();

    if (!lsResponse.ok) {
      console.error('[ls-checkout] ❌ Lemon Squeezy 체크아웃 생성 실패:', {
        status: lsResponse.status,
        errors: lsResult?.errors,
      });
      return NextResponse.json(
        {
          success: false,
          error: '결제창 생성에 실패했습니다.',
          details: lsResult?.errors?.[0]?.detail,
        },
        { status: 502 },
      );
    }

    const checkoutUrl: string | undefined = lsResult?.data?.attributes?.url;
    if (!checkoutUrl) {
      console.error('[ls-checkout] ❌ 체크아웃 URL 누락:', lsResult);
      return NextResponse.json(
        { success: false, error: '결제창 주소를 받지 못했습니다.' },
        { status: 502 },
      );
    }

    console.log('[ls-checkout] ✅ 체크아웃 생성 완료:', {
      orderId: order.id,
      customPrice,
      currency: config.storeCurrency,
      testMode: config.testMode,
    });

    return NextResponse.json({ success: true, checkoutUrl });
  } catch (error) {
    console.error('[ls-checkout] 🔥 예외:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '결제창 생성 중 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }
}
