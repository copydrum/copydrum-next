import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { completeOrderAfterPayment } from '@/lib/payments/completeOrderAfterPayment';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderID, orderId } = body;

    if (!orderID || !orderId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    const apiUrl = process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com';

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, error: 'PayPal not configured' },
        { status: 500 }
      );
    }

    // Get PayPal access token
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(`${apiUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Capture PayPal order
    const captureResponse = await fetch(`${apiUrl}/v2/checkout/orders/${orderID}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const captureData = await captureResponse.json();

    if (!captureResponse.ok) {
      console.error('[PayPal Capture] Error:', captureData);
      return NextResponse.json(
        {
          success: false,
          error: captureData.message || 'Failed to capture PayPal payment',
        },
        { status: captureResponse.status }
      );
    }

    // completeOrderAfterPayment 사용 (예상 완료일 계산 및 저장 포함)
    try {
      await completeOrderAfterPayment(orderId, 'paypal' as any, {
        transactionId: orderID,
        paymentConfirmedAt: new Date().toISOString(),
        paymentProvider: 'paypal',
      });
      console.log('[PayPal Capture] ✅ completeOrderAfterPayment 처리 완료');
    } catch (completeError) {
      console.error('[PayPal Capture] ⚠️ completeOrderAfterPayment 실패, 직접 업데이트 시도:', completeError);
      
      // Fallback: completeOrderAfterPayment 실패 시 직접 업데이트
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'completed',
          payment_status: 'paid',
          payment_method: 'paypal',
          payment_id: orderID,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (updateError) {
        console.error('[PayPal] Database update error:', updateError);
        return NextResponse.json(
          { success: false, error: 'Failed to update order status' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      captureId: captureData.id,
      status: captureData.status,
    });
  } catch (error) {
    console.error('[PayPal Capture] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
