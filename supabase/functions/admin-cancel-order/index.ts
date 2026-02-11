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
      .select("id, user_id, status, total_amount, order_number")
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

    if (doRefund && !REFUNDABLE_STATUSES.has(normalizedStatus)) {
      return new Response("Order is not refundable", { status: 409, headers: corsHeaders });
    }

    if (!doRefund && normalizedStatus && !CANCELLABLE_STATUSES.has(normalizedStatus)) {
      return new Response("Order cannot be cancelled from current status", { status: 409, headers: corsHeaders });
    }

    const nowIso = new Date().toISOString();

    if (doRefund) {
      const refundAmount = Math.max(0, order.total_amount ?? 0);

      if (refundAmount > 0) {
        const { data: userProfile, error: userProfileError } = await adminClient
          .from("profiles")
          .select("credits")
          .eq("id", order.user_id)
          .maybeSingle();

        if (userProfileError) {
          return new Response(JSON.stringify(userProfileError), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const currentCredits = userProfile?.credits ?? 0;
        const newCredits = currentCredits + refundAmount;

        const { error: updateCreditsError } = await adminClient
          .from("profiles")
          .update({ credits: newCredits })
          .eq("id", order.user_id);

        if (updateCreditsError) {
          return new Response(JSON.stringify(updateCreditsError), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error: transactionError } = await adminClient.from("cash_transactions").insert([
          {
            user_id: order.user_id,
            transaction_type: "admin_add",
            amount: refundAmount,
            bonus_amount: 0,
            balance_after: newCredits,
            description: `주문 환불: ${order.order_number ?? order.id}`,
            sheet_id: null,
            order_id: order.id,
            created_by: user.id,
            created_at: nowIso,
          },
        ]);

        if (transactionError) {
          return new Response(JSON.stringify(transactionError), {
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


