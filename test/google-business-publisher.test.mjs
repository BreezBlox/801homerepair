import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import publisher, { publishGoogleBusinessPost } from "../netlify/functions/google-business-publisher.mjs";

test("Google Business publisher refreshes OAuth and creates only a zero-spend standard post", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "test-access-token" });
    if (String(url).includes("/accounts/account-1/locations/location-1/localPosts")) {
      return Response.json({ name: "accounts/account-1/locations/location-1/localPosts/post-1", searchUrl: "https://google.example/post-1" });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const result = await publishGoogleBusinessPost({
      copy: "Completed repair update.",
      ctaUrl: "https://www.homerepairslc.com/?utm_source=google_business",
      accountId: "account-1",
      locationId: "location-1",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
    });
    assert.equal(result.name.endsWith("post-1"), true);
    assert.equal(calls.length, 2);
    const post = JSON.parse(calls[1].options.body);
    assert.deepEqual(post, {
      languageCode: "en-US",
      summary: "Completed repair update.",
      topicType: "STANDARD",
      callToAction: { actionType: "LEARN_MORE", url: "https://www.homerepairslc.com/?utm_source=google_business" },
    });
    assert.equal(calls[1].options.headers.authorization, "Bearer test-access-token");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Google Business endpoint rejects unsigned, wrong-action, and nonzero-spend requests before OAuth", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;
  const body = JSON.stringify({
    action: { type: "publish_content", channel: "google_business", spend_authorization: 1 },
    content: { draft_copy: "Completed repair update." },
  });
  try {
    process.env.MARKETING_CONNECTOR_WEBHOOK_SECRET = "connector-secret";
    global.fetch = async () => { throw new Error("OAuth must not be called"); };
    const unsigned = await publisher.fetch(new Request("https://site.test/.netlify/functions/google-business-publisher", { method: "POST", body }));
    assert.equal(unsigned.status, 401);

    const signature = `sha256=${createHmac("sha256", "connector-secret").update(body).digest("hex")}`;
    const signed = await publisher.fetch(new Request("https://site.test/.netlify/functions/google-business-publisher", {
      method: "POST",
      headers: { "x-home-repair-slc-signature": signature },
      body,
    }));
    assert.equal(signed.status, 422);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    global.fetch = originalFetch;
  }
});
