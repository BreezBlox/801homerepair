import { createHmac, timingSafeEqual } from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_POSTS_BASE_URL = "https://mybusiness.googleapis.com/v4";

export default {
  async fetch(request) {
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "POST" } });

    const body = await request.text();
    const secret = process.env.MARKETING_CONNECTOR_WEBHOOK_SECRET || "";
    if (!hasValidSignature(body, request.headers.get("x-home-repair-slc-signature"), secret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (payload?.action?.type !== "publish_content" || payload?.action?.channel !== "google_business") {
      return Response.json({ error: "Unsupported action" }, { status: 422 });
    }
    if (Number(payload?.action?.spend_authorization || 0) !== 0) {
      return Response.json({ error: "Google Business posts cannot authorize spend" }, { status: 422 });
    }

    const copy = String(payload?.content?.draft_copy || "").trim();
    if (!copy) return Response.json({ error: "Approved draft copy is required" }, { status: 422 });

    try {
      const result = await publishGoogleBusinessPost({
        copy,
        ctaUrl: process.env.GOOGLE_BUSINESS_CTA_URL || "",
        accountId: requiredEnv("GOOGLE_BUSINESS_ACCOUNT_ID"),
        locationId: requiredEnv("GOOGLE_BUSINESS_LOCATION_ID"),
        clientId: requiredEnv("GOOGLE_BUSINESS_OAUTH_CLIENT_ID"),
        clientSecret: requiredEnv("GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET"),
        refreshToken: requiredEnv("GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN"),
      });
      return Response.json({ ok: true, external_id: result.name || null, published_url: result.searchUrl || null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Business publisher failed";
      console.error("Google Business publisher failed", { message });
      return Response.json({ ok: false, error: message }, { status: 502 });
    }
  },
};

export async function publishGoogleBusinessPost({ copy, ctaUrl, accountId, locationId, clientId, clientSecret, refreshToken }) {
  const accessToken = await refreshAccessToken({ clientId, clientSecret, refreshToken });
  const post = {
    languageCode: "en-US",
    summary: String(copy).trim(),
    topicType: "STANDARD",
  };
  const approvedCta = approvedWebsiteUrl(ctaUrl);
  if (approvedCta) post.callToAction = { actionType: "LEARN_MORE", url: approvedCta };

  const response = await fetch(`${GOOGLE_POSTS_BASE_URL}/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/localPosts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(post),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google Business API rejected post (${response.status}): ${googleErrorMessage(result)}`);
  return result;
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) throw new Error(`Google OAuth refresh failed (${response.status}): ${googleErrorMessage(result)}`);
  return result.access_token;
}

function hasValidSignature(body, signature, secret) {
  if (!secret || !signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const received = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

function approvedWebsiteUrl(value) {
  if (!String(value || "").trim()) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("GOOGLE_BUSINESS_CTA_URL must be a valid HTTPS Home Repair SLC URL.");
  }
  if (parsed.protocol !== "https:" || !["homerepairslc.com", "www.homerepairslc.com"].includes(parsed.hostname)) {
    throw new Error("GOOGLE_BUSINESS_CTA_URL must use the Home Repair SLC HTTPS domain.");
  }
  return parsed.toString();
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function googleErrorMessage(result) {
  return String(result?.error?.message || result?.error_description || result?.message || "unknown error").slice(0, 600);
}
