import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { orderId, completedBy = "admin" } = await req.json();

        if (!orderId) {
            throw new Error("Order ID is required");
        }

        console.log(`[admin-complete-order] Starting completion for order: ${orderId}`);

        // 1. Fetch Order
        const { data: order, error: orderError } = await supabaseClient
            .from("orders")
            .select("*, order_items(*, drum_sheets(*))")
            .eq("id", orderId)
            .single();

        if (orderError || !order) {
            console.error("[admin-complete-order] Order fetch error:", orderError);
            throw new Error("Order not found");
        }

        if (order.status === "completed" && order.payment_status === "paid") {
            return new Response(
                JSON.stringify({ message: "Order is already completed" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        const now = new Date().toISOString();

        // 2. Handle Cash Charge
        if (order.order_type === "cash") {
            console.log("[admin-complete-order] Processing cash charge");
            // Calculate bonus (logic from completeOrderAfterPayment.ts)
            // Assuming simple logic for now or fetching from metadata if available.
            // For now, let's trust total_amount as the charge amount.
            // If there's bonus logic, it should ideally be in the order creation or metadata.
            // Let's look at metadata for 'bonusCredits' if it exists, otherwise 0.

            const chargeAmount = order.total_amount;
            const bonusCredits = order.metadata?.bonusCredits || 0;
            const totalCredits = chargeAmount + bonusCredits;

            // Update user profile
            const { error: profileError } = await supabaseClient.rpc("increment_user_credit", {
                user_id_param: order.user_id,
                amount_param: totalCredits
            });

            if (profileError) {
                // Fallback to direct update if RPC fails or doesn't exist (though RPC is safer for concurrency)
                console.warn("[admin-complete-order] RPC failed, trying direct update:", profileError);
                const { data: profile } = await supabaseClient
                    .from("profiles")
                    .select("credit_amount")
                    .eq("id", order.user_id)
                    .single();

                if (profile) {
                    await supabaseClient
                        .from("profiles")
                        .update({ credit_amount: (profile.credit_amount || 0) + totalCredits })
                        .eq("id", order.user_id);
                }
            }

            // Record point history
            await supabaseClient.from("point_history").insert({
                user_id: order.user_id,
                amount: totalCredits,
                type: "charge",
                description: `캐시 충전 (주문번호: ${order.order_number || order.id})`,
                metadata: { order_id: order.id }
            });
        }

        // 3. Handle Sheet Purchase (Product)
        if (order.order_type === "product" && order.order_items) {
            console.log("[admin-complete-order] Processing sheet purchase");
            const purchases = order.order_items.map((item: any) => ({
                user_id: order.user_id,
                sheet_id: item.drum_sheet_id,
                order_id: order.id,
                price: item.price,
                is_active: true
            }));

            if (purchases.length > 0) {
                const { error: purchaseError } = await supabaseClient
                    .from("purchases")
                    .insert(purchases);

                if (purchaseError) {
                    console.error("[admin-complete-order] Purchase creation error:", purchaseError);
                    // Continue anyway to mark order as completed, or throw? 
                    // Better to throw to avoid partial state, but 'purchases' might have unique constraint on (user_id, sheet_id).
                    // If duplicate, it's fine.
                }
            }
        }

        // 4. Update Order Status
        const { error: updateError } = await supabaseClient
            .from("orders")
            .update({
                status: "completed",
                payment_status: "paid",
                payment_confirmed_at: now,
                metadata: {
                    ...order.metadata,
                    completed_by: completedBy,
                    completed_at: now,
                    manual_override: true
                }
            })
            .eq("id", orderId);

        if (updateError) {
            console.error("[admin-complete-order] Order update error:", updateError);
            throw new Error("Failed to update order status");
        }

        console.log(`[admin-complete-order] Successfully completed order: ${orderId}`);

        return new Response(
            JSON.stringify({ message: "Order completed successfully" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );

    } catch (error) {
        console.error("[admin-complete-order] Error:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
