import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REFUNDABLE_STATUSES = new Set(["payment_confirmed", "completed"]);
const CANCELLABLE_STATUSES = new Set(["pending", "awaiting_deposit", "payment_confirmed", "completed"]);

serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response("Server configuration error", {
        status: 500,
        headers: corsHeaders,
      });
    }

    const { orderId, doRefund } = await req.json();

    if (!orderId || typeof doRefund !== "boolean") {
      return new Response("Invalid request body", { status: 400, headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization") ?? "";

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return new Response(JSON.stringify(profileError), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profile || profile.role !== "admin") {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const { data: order, error: orderError } = await adminClient
      .from("orders")
      .select("id, user_id, status, payment_status, total_amount, points_used, order_number, order_type, metadata")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      return new Response(JSON.stringify(orderError), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!order) {
      return new Response("Order not found", { status: 404, headers: corsHeaders });
    }

    const normalizedStatus = (order.status ?? "").toLowerCase();

    if (normalizedStatus === "refunded") {
      return new Response("Order already refunded", { status: 409, headers: corsHeaders });
    }

    if (normalizedStatus === "cancelled" && !doRefund) {
      return new Response("Order already cancelled", { status: 409, headers: corsHeaders });
    }

    // 충전 주문의 '환불'은 캐쉬를 더 넣는 셈이 되고, 완료된 충전을 취소하면 캐쉬만 남는다.
    // 충전 캐쉬 환불은 회원 캐쉬 관리의 충전 캐쉬 환불(wallet_refund_charge)로 처리한다.
    const isCashCharge =
      order.order_type === "cash" ||
      order.metadata?.type === "cash_charge" ||
      order.metadata?.purpose === "cash_charge";
    const isChargePaid = normalizedStatus === "completed" || order.payment_status === "paid";
    if (isCashCharge && (doRefund || isChargePaid)) {
      return new Response(
        JSON.stringify({
          error: "CASH_CHARGE_ORDER",
          message: "캐쉬 충전 주문은 회원 캐쉬 관리의 '충전 캐쉬 환불'로 처리해 주세요.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (doRefund && !REFUNDABLE_STATUSES.has(normalizedStatus)) {
      return new Response("Order is not refundable", { status: 409, headers: corsHeaders });
    }

    if (!doRefund && normalizedStatus && !CANCELLABLE_STATUSES.has(normalizedStatus)) {
      return new Response("Order cannot be cancelled from current status", { status: 409, headers: corsHeaders });
    }

    const nowIso = new Date().toISOString();

    if (doRefund) {
      // 포인트로 낸 부분은 주문 상태가 refunded 로 바뀔 때 DB 트리거가 포인트로 되돌린다.
      const refundAmount = Math.max(0, (order.total_amount ?? 0) - (order.points_used ?? 0));

      if (refundAmount > 0) {
        const { error: refundError } = await adminClient.rpc("wallet_apply_cash", {
          p_user_id: order.user_id,
          p_amount: refundAmount,
          p_bonus: 0,
          p_type: "refund",
          p_description: `주문 환불: ${order.order_number ?? order.id}`,
          p_order_id: order.id,
          p_sheet_id: null,
          p_created_by: user.id,
        });

        if (refundError && refundError.code !== "23505") {
          return new Response(JSON.stringify(refundError), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const { error: deleteItemsError } = await adminClient.from("order_items").delete().eq("order_id", order.id);
      if (deleteItemsError) {
        return new Response(JSON.stringify(deleteItemsError), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateOrderError } = await adminClient
        .from("orders")
        .update({
          status: "refunded",
          total_amount: 0,
          updated_at: nowIso,
        })
        .eq("id", order.id);

      if (updateOrderError) {
        return new Response(JSON.stringify(updateOrderError), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { error: deleteItemsError } = await adminClient.from("order_items").delete().eq("order_id", order.id);
      if (deleteItemsError) {
        return new Response(JSON.stringify(deleteItemsError), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: updateOrderError } = await adminClient
        .from("orders")
        .update({
          status: "cancelled",
          updated_at: nowIso,
        })
        .eq("id", order.id);

      if (updateOrderError) {
        return new Response(JSON.stringify(updateOrderError), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    try {
      await adminClient.rpc("pgrst_notify_reload");
    } catch {
      // optional, ignore errors
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: doRefund ? "refunded" : "cancelled",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("admin-cancel-order error:", error);
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
});


