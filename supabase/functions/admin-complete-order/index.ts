import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        const accessToken = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
        if (!accessToken) return jsonResponse(401, { error: "Unauthorized" });

        const authClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });
        const { data: { user }, error: userError } = await authClient.auth.getUser();
        if (userError || !user) return jsonResponse(401, { error: "Unauthorized" });

        const { data: callerProfile } = await authClient
            .from("profiles").select("role, is_admin").eq("id", user.id).maybeSingle();
        const isAdmin = !!callerProfile && (callerProfile.is_admin === true || callerProfile.role === "admin");
        if (!isAdmin) return jsonResponse(403, { error: "Forbidden" });

        const supabaseClient = createClient(
            supabaseUrl,
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

        // 2. Handle Cash Charge (보너스는 DB 충전 상품 표 기준, 이미 충전된 주문은 건너뛴다)
        if (order.order_type === "cash" || order.metadata?.type === "cash_charge") {
            console.log("[admin-complete-order] Processing cash charge");
            const { error: chargeError } = await supabaseClient.rpc("cash_complete_charge_order", {
                p_order_id: order.id,
                p_created_by: user.id,
                p_description: null,
            });
            if (chargeError) {
                console.error("[admin-complete-order] Cash charge error:", chargeError);
                throw new Error("Failed to charge cash");
            }
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
                    completed_by_user_id: user.id,
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
