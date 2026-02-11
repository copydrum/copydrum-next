/**
 * legacy: PayAction 자동입금 확인 시스템용 Edge Function
 * 
 * 현재는 사용하지 않으며, 무통장 입금은 관리자가 수동으로 확인합니다.
 * 나중에 PayAction을 다시 사용할 경우를 대비해 코드는 유지합니다.
 * 
 * @deprecated 현재 미사용 - 관리자 수동 입금 확인으로 대체됨
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requireEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

type PayactionWebhookPayload = {
  orderId?: string;
  status?: string;
  depositorName?: string;
  amount?: number;
  [key: string]: unknown;
};

const buildResponse = <T>(payload: T, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const payload = (await req.json()) as PayactionWebhookPayload;
    const orderId = payload.orderId ?? payload.order_id ?? payload.order_no ?? null;

    if (!orderId) {
      return buildResponse(
        {
          success: false,
          error: { message: 'orderId가 누락되었습니다. 페이액션 연동 설정을 확인해주세요.' },
        },
        400,
      );
    }

    const status = (payload.status ?? '').toString().toUpperCase();
    const isDepositConfirmed = ['DEPOSIT_CONFIRMED', 'SUCCESS', 'OK'].includes(status) || !status;

    if (!isDepositConfirmed) {
      return buildResponse({
        success: true,
        message: `상태 ${status}는 입금 확인으로 처리되지 않았습니다.`,
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: order,
      error: orderError,
    } = await supabase
      .from('orders')
      .select('id,user_id,total_amount,status,payment_status,transaction_id,metadata,virtual_account_info,order_items(id)')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      throw orderError;
    }

    if (!order) {
      return buildResponse({
        success: false,
        error: { message: `주문 ${orderId}을(를) 찾을 수 없습니다.` },
      }, 404);
    }

    const normalizedStatus = (order.status ?? '').toLowerCase();
    const normalizedPaymentStatus = (order.payment_status ?? '').toLowerCase();

    if (normalizedPaymentStatus === 'paid' || normalizedStatus === 'completed') {
      return buildResponse({
        success: true,
        message: '이미 입금이 확인된 주문입니다.',
      });
    }

    const nowIso = new Date().toISOString();
    const manualTransactionId =
      order.transaction_id && order.transaction_id.trim().length > 0
        ? order.transaction_id
        : `payaction-${Date.now()}`;

    const isCashCharge =
      ((order.metadata as Record<string, unknown> | null)?.type === 'cash_charge' ||
        (order.metadata as Record<string, unknown> | null)?.purpose === 'cash_charge') &&
      Array.isArray(order.order_items) &&
      order.order_items.length === 0;

    if (isCashCharge) {
      const chargeAmount = Math.max(0, order.total_amount ?? 0);
      const bonusAmount = Number(
        (order.metadata as Record<string, unknown> | null)?.bonusAmount ?? 0,
      );

      const {
        data: profile,
        error: profileError,
      } = await supabase.from('profiles').select('credits').eq('id', order.user_id).single();

      if (profileError) {
        throw profileError;
      }

      const currentCredits = profile?.credits ?? 0;
      const newCredits = currentCredits + chargeAmount + bonusAmount;

      const { error: updateProfileError } = await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', order.user_id);

      if (updateProfileError) {
        throw updateProfileError;
      }

      const { error: cashTxError } = await supabase.from('cash_transactions').insert([
        {
          user_id: order.user_id,
          transaction_type: 'charge',
          amount: chargeAmount,
          bonus_amount: bonusAmount,
          balance_after: newCredits,
          description: '페이액션 자동 입금 확인',
          created_by: order.user_id,
          order_id: order.id,
        },
      ]);

      if (cashTxError) {
        throw cashTxError;
      }
    }

    const updatedVirtualAccount = (() => {
      const current = (order.virtual_account_info as Record<string, unknown> | null) ?? {};
      return {
        ...current,
        confirmedAt: nowIso,
        confirmedBy: 'payaction',
        webhookDepositor: payload.depositorName ?? payload.depositor_name ?? null,
        webhookPayload: payload,
      };
    })();

    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        payment_status: 'paid',
        payment_confirmed_at: nowIso,
        transaction_id: manualTransactionId,
        virtual_account_info: updatedVirtualAccount,
        depositor_name: payload.depositorName ?? payload.depositor_name ?? order.depositor_name ?? null,
      })
      .eq('id', order.id);

    if (orderUpdateError) {
      throw orderUpdateError;
    }

    const { error: paymentLogError } = await supabase
      .from('payment_transactions')
      .update({
        status: 'paid',
        pg_transaction_id: manualTransactionId,
        raw_response: payload,
        updated_at: nowIso,
      })
      .eq('order_id', order.id);

    if (paymentLogError) {
      console.warn('payment_transactions 업데이트 실패:', paymentLogError);
    }

    return buildResponse({
      success: true,
      message: '입금 확인 처리가 완료되었습니다.',
    });
  } catch (error) {
    console.error('[payaction-webhook] Unexpected error', error);
    return buildResponse(
      {
        success: false,
        error: {
          message: '웹훅 처리 중 오류가 발생했습니다.',
          details: error?.message ?? error,
        },
      },
      500,
    );
  }
});








