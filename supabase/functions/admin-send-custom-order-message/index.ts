import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return jsonResponse(500, { error: "Missing Supabase configuration" });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace("Bearer ", "").trim();

    if (!accessToken) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const { data: profile, error: profileError } = await authClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Failed to fetch profile:", profileError);
      return jsonResponse(500, { error: "Failed to verify profile" });
    }

    if (!profile || profile.role !== "admin") {
      return jsonResponse(403, { error: "Forbidden" });
    }

    let payload: { customOrderId?: string; custom_order_id?: string; message?: string } = {};
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, { error: "Invalid JSON payload" });
    }

    const customOrderId = (payload.customOrderId ?? payload.custom_order_id ?? "").trim();
    const message = (payload.message ?? "").trim();

    if (!customOrderId || !message) {
      return jsonResponse(400, { error: "Missing required fields" });
    }

    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: order, error: orderError } = await serviceClient
      .from("custom_orders")
      .select("id")
      .eq("id", customOrderId)
      .maybeSingle();

    if (orderError) {
      console.error("Failed to fetch order:", orderError);
      return jsonResponse(500, { error: "Failed to verify order" });
    }

    if (!order) {
      return jsonResponse(404, { error: "Custom order not found" });
    }

    const { error: insertError } = await serviceClient.from("custom_order_messages").insert({
      custom_order_id: customOrderId,
      sender_id: user.id,
      sender_type: "admin",
      message,
    });

    if (insertError) {
      console.error("Failed to insert message:", insertError);
      return jsonResponse(500, { error: "Failed to send message" });
    }

    const { error: updateError } = await serviceClient
      .from("custom_orders")
      .update({
        admin_reply: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", customOrderId);

    if (updateError) {
      console.error("Failed to update order:", updateError);
      return jsonResponse(500, { error: "Failed to update order" });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error("Unhandled error:", error);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
