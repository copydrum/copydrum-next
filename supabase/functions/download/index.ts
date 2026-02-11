import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS 헤더를 넉넉하게 열어줌
const baseCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // 개발 중이니 * 로, 나중에 도메인으로 바꿔도 됨
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-auth, x-supabase-client",
};

const normalizeStoragePath = (rawPath: string | null | undefined, bucket: string): string | null => {
  if (!rawPath) {
    return null;
  }

  let path = rawPath.trim();
  if (!path) {
    return null;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const url = new URL(path);
      const segments = url.pathname.split("/").filter(Boolean);
      const bucketIndex = segments.findIndex((segment) => segment === bucket);
      if (bucketIndex >= 0 && bucketIndex < segments.length - 1) {
        path = segments.slice(bucketIndex + 1).join("/");
      } else if (segments.length > 0) {
        path = segments.slice(-1)[0];
      }
    } catch {
      // ignore and fall back to original path
    }
  }

  return path.replace(/^\/+/, "");
};

serve(async (req) => {
  // ------- 1. OPTIONS (preflight) 먼저 처리 -------
  if (req.method === "OPTIONS") {
    const reqHeaders = req.headers.get("Access-Control-Request-Headers") ?? "";
    return new Response("ok", {
      headers: {
        ...baseCorsHeaders,
        // 브라우저가 요청한 헤더를 그대로 허용 (최대한 관대하게)
        ...(reqHeaders ? { "Access-Control-Allow-Headers": reqHeaders } : {}),
      },
    });
  }

  // 실제 다운로드는 POST 만 허용 (프론트도 반드시 POST로 호출해야 함)
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: baseCorsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response("Server configuration error", {
        status: 500,
        headers: baseCorsHeaders,
      });
    }

    const { orderId, orderItemId } = await req.json();
    if (!orderId || !orderItemId) {
      return new Response("Missing parameters", {
        status: 400,
        headers: baseCorsHeaders,
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response("Unauthorized", {
        status: 401,
        headers: baseCorsHeaders,
      });
    }

    const { data: row, error: queryError } = await adminClient
      .from("order_items")
      .select(
        `
        id,
        order_id,
        price,
        download_attempt_count,
        last_downloaded_at,
        order:orders!inner (
          id,
          user_id,
          status
        ),
        sheet:drum_sheets (
          id,
          title,
          artist,
          pdf_url
        )
      `,
      )
      .eq("id", orderItemId)
      .eq("order_id", orderId)
      .maybeSingle();

    if (queryError || !row) {
      const message = queryError?.message ? `Query failed: ${queryError.message}` : "Order item not found";
      return new Response(message, {
        status: 404,
        headers: baseCorsHeaders,
      });
    }

    if (row.order.user_id !== user.id) {
      return new Response("Forbidden", {
        status: 403,
        headers: baseCorsHeaders,
      });
    }

    const allowStatuses = new Set(["completed", "payment_confirmed"]);
    const orderStatus = (row.order.status ?? "").toLowerCase();

    if (!allowStatuses.has(orderStatus)) {
      return new Response("Download not allowed for this order status", {
        status: 403,
        headers: baseCorsHeaders,
      });
    }

    const bucket = Deno.env.get("SHEET_PDF_BUCKET") ?? "drum-sheets";
    const pdfPath = normalizeStoragePath(row.sheet?.pdf_url as string | null, bucket);

    if (!pdfPath) {
      return new Response("File path not configured", {
        status: 404,
        headers: baseCorsHeaders,
      });
    }

    const ipCandidates = [
      req.headers.get("cf-connecting-ip"),
      req.headers.get("x-forwarded-for"),
      req.headers.get("x-real-ip"),
      req.headers.get("x-client-ip"),
      req.headers.get("x-appengine-user-ip"),
    ];
    const requesterIp = ipCandidates.find((value) => Boolean(value && value.trim())) ?? null;
    const nowIso = new Date().toISOString();

    const { error: updateError } = await adminClient
      .from("order_items")
      .update({
        download_attempt_count: (row.download_attempt_count ?? 0) + 1,
        last_downloaded_at: nowIso,
        ...(requesterIp ? { last_download_ip: requesterIp.split(",")[0].trim() } : {}),
      })
      .eq("id", row.id);

    if (updateError) {
      console.error("Failed to record download attempt", updateError);
    }

    // 다운로드 파일명 생성 (아티스트 - 제목.pdf)
    const sheetTitle = (row.sheet?.title as string) ?? "";
    const sheetArtist = (row.sheet?.artist as string) ?? "";
    const nameParts = [sheetArtist, sheetTitle].filter(Boolean).join(" - ");
    const downloadName = nameParts
      ? `${nameParts.replace(/[\\/:*?"<>|]+/g, "_")}.pdf`
      : `sheet-${orderItemId.slice(0, 8)}.pdf`;

    // download 옵션: Content-Disposition: attachment 헤더를 붙여
    // 아이폰(Safari), 갤럭시(Chrome) 모두에서 강제 다운로드 처리
    const { data: signed, error: signedError } = await adminClient.storage
      .from(bucket)
      .createSignedUrl(pdfPath, 60, { download: downloadName });

    if (signedError || !signed?.signedUrl) {
      return new Response("Failed to sign url", {
        status: 500,
        headers: baseCorsHeaders,
      });
    }

    return new Response(JSON.stringify({ url: signed.signedUrl }), {
      headers: {
        ...baseCorsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Download function error:", error);
    return new Response("Internal Server Error", {
      status: 500,
      headers: baseCorsHeaders,
    });
  }
});




