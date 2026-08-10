import { createHmac } from "node:crypto";

const DUE_LIMIT = 8;
const PAID_ACTIONS = new Set(["create_ad", "update_ad"]);
const PAID_OPERATIONS = new Set(["create_ad", "update_ad", "pause_ad", "resume_ad"]);
const LIFECYCLE_ACTIONS = new Set(["pause_ad", "resume_ad"]);
const EXECUTION_MODES = new Set(["disabled", "dry_run", "live"]);

export const config = {
  schedule: "*/15 * * * *",
};

export default async () => {
  const env = requiredEnvironment();
  const actions = await dueActions(env);
  const results = [];

  for (const action of actions) {
    const claimed = await claimAction(env, action);
    if (!claimed) continue;
    try {
      results.push(await processAction(env, claimed));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown marketing worker error";
      await finishAction(env, claimed.id, "failed", { last_error: message });
      results.push({ id: claimed.id, status: "failed", reason: message });
    }
  }

  console.log("Marketing queue run", { processed: results.length, results });
};

export function validateMarketingAction({ action, campaign, content, settings, now = new Date(), publishedThisWeek = 0 }) {
  if (!campaign) return blocked("campaign_not_found");
  if (action.action_type === "pause_ad") {
    if (!["active", "paused", "completed", "archived"].includes(campaign.status)) return blocked("campaign_not_pauseable");
  } else if (campaign.status !== "active") {
    return blocked("campaign_not_active");
  }
  if (!campaign.approved_at || !campaign.approved_by) return blocked("campaign_not_approved");
  if (!campaign.channels?.includes(action.channel)) return blocked("channel_outside_envelope");
  if (action.requires_approval && !action.approved_at) return blocked("action_approval_missing");
  if (!action.requires_approval && campaign.automation_mode !== "bounded_auto") return blocked("campaign_not_autonomous");

  const timestamp = now.getTime();
  if (action.action_type !== "pause_ad") {
    if (!campaign.start_at || timestamp < new Date(campaign.start_at).getTime()) return blocked("campaign_not_started");
    if (!campaign.end_at || timestamp >= new Date(campaign.end_at).getTime()) return blocked("campaign_expired");
  }
  if (action.scheduled_for && timestamp < new Date(action.scheduled_for).getTime()) return blocked("action_not_due");

  if (action.action_type === "publish_content") {
    if (!content || content.campaign_id !== campaign.id) return blocked("content_outside_campaign");
    if (!["approved", "scheduled"].includes(content.status)) return blocked("content_not_approved");
    if (!["approved", "not_required"].includes(content.permission_status)) return blocked("content_permission_missing");
    if (!String(content.draft_copy || "").trim()) return blocked("content_copy_missing");
    if (settingValue(settings, "marketing_content_mode", "draft_only") !== "approved_campaigns") {
      return blocked("global_content_autonomy_disabled");
    }
    const globalCap = numberSetting(settings, "marketing_max_posts_per_week", 0);
    const campaignCap = Number(campaign.max_posts_per_week || 0);
    const caps = [globalCap, campaignCap].filter((value) => value > 0);
    const effectiveCap = caps.length ? Math.min(...caps) : 0;
    if (effectiveCap <= 0 || publishedThisWeek >= effectiveCap) return blocked("weekly_post_cap_reached");
  }

  if (action.action_type === "generate_content") {
    if (!content || content.campaign_id !== campaign.id) return blocked("content_outside_campaign");
    if (!["idea", "draft"].includes(content.status)) return blocked("content_not_draftable");
    if (!String(content.proof_summary || "").trim()) return blocked("content_proof_missing");
  }

  if (PAID_OPERATIONS.has(action.action_type)) {
    if (!campaign.paid) return blocked("paid_action_outside_paid_campaign");
    if (settingValue(settings, "marketing_paid_mode", "disabled") !== "approved_campaigns") {
      return blocked("global_paid_autonomy_disabled");
    }
    const approvedPaidChannels = parseSettingList(settingValue(settings, "marketing_paid_channels", ""));
    if (!approvedPaidChannels.includes(normalizeChannel(action.channel))) return blocked("global_paid_channel_not_approved");
    const approvedVendors = parseSettingList(settingValue(settings, "marketing_vendor_allowlist", ""));
    const actionVendor = normalizeChannel(action.payload?.vendor || "");
    if (!actionVendor || !approvedVendors.includes(actionVendor)) return blocked("paid_vendor_not_approved");
    if (LIFECYCLE_ACTIONS.has(action.action_type)) {
      const hasExternalReference = ["campaign_external_id", "ad_set_external_id", "ad_external_id"]
        .some((key) => String(action.payload?.[key] || "").trim());
      if (!hasExternalReference) return blocked("external_ad_reference_missing");
    }
    if (PAID_ACTIONS.has(action.action_type)) {
      const amount = Number(action.spend_amount || 0);
      if (amount <= 0) return blocked("paid_action_amount_missing");
      if (amount > Number(campaign.per_action_budget || 0)) return blocked("campaign_action_cap_exceeded");
      if (Number(campaign.spent_amount || 0) + Number(campaign.reserved_amount || 0) + amount > Number(campaign.total_budget || 0)) return blocked("campaign_budget_exceeded");
      if (amount > numberSetting(settings, "marketing_transaction_cap", 0)) return blocked("global_action_cap_exceeded");
      const currentCpl = Number(action.payload?.current_cpl || 0);
      const stopLoss = Math.min(
        ...[Number(campaign.stop_loss_cpl || 0), numberSetting(settings, "marketing_stop_loss_cpl", 0)]
          .filter((value) => value > 0),
      );
      if (Number.isFinite(stopLoss) && stopLoss > 0 && currentCpl > stopLoss) return blocked("stop_loss_cpl_exceeded");
    }
  }

  return { ok: true, reason: null };
}

export async function processAction(env, action) {
  const [campaign, content, settings, publishedThisWeek] = await Promise.all([
    one(env, "marketing_campaigns", action.campaign_id),
    action.content_id ? one(env, "marketing_content", action.content_id) : Promise.resolve(null),
    listSettings(env),
    countPublishedThisWeek(env, action.campaign_id),
  ]);
  const validation = validateMarketingAction({ action, campaign, content, settings, publishedThisWeek });
  if (!validation.ok) {
    await finishAction(env, action.id, "blocked", { last_error: validation.reason });
    return { id: action.id, status: "blocked", reason: validation.reason };
  }

  const executionMode = executionModeForAction(action, env);
  if (executionMode === "disabled") {
    await finishAction(env, action.id, "blocked", { last_error: "execution_mode_disabled" });
    return { id: action.id, status: "blocked", reason: "execution_mode_disabled" };
  }

  if (executionMode === "dry_run") {
    const result = {
      ok: true,
      dry_run: true,
      action_type: action.action_type,
      channel: action.channel,
      would_reserve: PAID_ACTIONS.has(action.action_type) ? Number(action.spend_amount || 0) : 0,
      checked_at: new Date().toISOString(),
    };
    await finishAction(env, action.id, "succeeded", { result, last_error: null });
    return { id: action.id, status: "succeeded", dry_run: true };
  }

  const webhookUrl = connectorUrl(action, env);
  if (!webhookUrl) {
    await finishAction(env, action.id, "blocked", { last_error: "connector_not_configured" });
    return { id: action.id, status: "blocked", reason: "connector_not_configured" };
  }

  let budgetReserved = false;
  if (PAID_ACTIONS.has(action.action_type)) {
    const reservation = await rpc(env, "reserve_marketing_action_budget", { p_action_id: action.id });
    if (!reservation.ok) {
      await finishAction(env, action.id, "blocked", { last_error: reservation.reason || "budget_reservation_failed" });
      return { id: action.id, status: "blocked", reason: reservation.reason || "budget_reservation_failed" };
    }
    budgetReserved = true;
  }

  let result;
  try {
    const body = JSON.stringify(buildConnectorPayload(action, campaign, content));
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-home-repair-slc-signature": connectorSignature(body, env),
        "x-idempotency-key": action.idempotency_key,
      },
      body,
    });
    result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true) throw new Error(`Connector rejected action (${response.status}).`);
  } catch (error) {
    if (budgetReserved) {
      await rpc(env, "release_marketing_action_budget", {
        p_action_id: action.id,
        p_reason: "connector_failed_before_activation",
      });
    }
    throw error;
  }

  if (action.action_type === "collect_metrics" && action.payload?.budget_action_id && Number(result.spend_increment || 0) > 0) {
    const spendResult = await rpc(env, "record_marketing_action_spend", {
      p_action_id: action.payload.budget_action_id,
      p_amount: Number(result.spend_increment),
      p_idempotency_key: String(result.spend_idempotency_key || `metrics:${action.id}:${result.measured_at || action.attempts}`),
    });
    if (!spendResult.ok) throw new Error(`Spend settlement failed: ${spendResult.reason || "unknown"}.`);
  }

  if ((action.action_type === "pause_ad" || result.release_remaining === true) && action.payload?.budget_action_id) {
    const releaseResult = await rpc(env, "release_marketing_action_budget", {
      p_action_id: action.payload.budget_action_id,
      p_reason: String(result.release_reason || "ad_paused_or_completed"),
    });
    if (!releaseResult.ok) throw new Error(`Budget release failed: ${releaseResult.reason || "unknown"}.`);
  }

  await finishAction(env, action.id, "succeeded", { result, last_error: null });
  if (content && action.action_type === "generate_content") {
    const generatedCopy = String(result.draft_copy || "").trim();
    if (!generatedCopy) throw new Error("Generator returned no draft_copy.");
    await patchRows(env, "marketing_content", {
      status: "draft",
      draft_copy: generatedCopy.slice(0, 5000),
      proof_summary: result.proof_summary ? String(result.proof_summary).trim().slice(0, 2000) : content.proof_summary,
      call_to_action: result.call_to_action ? String(result.call_to_action).trim().slice(0, 1000) : content.call_to_action,
      notes: [content.notes, `AI draft generated by action ${action.id}; human or envelope approval is still required.`].filter(Boolean).join("\n"),
    }, { id: `eq.${content.id}`, user_id: `eq.${env.userId}` });
  }
  if (content && action.action_type === "publish_content") {
    await patchRows(env, "marketing_content", {
      status: "published",
      published_at: new Date().toISOString(),
      published_url: result.published_url || null,
      external_post_id: result.external_id || null,
      publish_attempts: Number(content.publish_attempts || 0) + 1,
      last_publish_error: null,
    }, { id: `eq.${content.id}`, user_id: `eq.${env.userId}` });
  }
  return { id: action.id, status: "succeeded", budget_reserved: budgetReserved };
}

export function buildConnectorPayload(action, campaign, content) {
  return {
    schema_version: 1,
    action: {
      id: action.id,
      type: action.action_type,
      channel: action.channel,
      idempotency_key: action.idempotency_key,
      spend_authorization: PAID_ACTIONS.has(action.action_type) ? Number(action.spend_amount || 0) : 0,
      payload: safeActionPayload(action),
    },
    campaign: safeCampaign(campaign),
    content: content ? safeContent(content) : null,
  };
}

function safeActionPayload(action) {
  const payload = action.payload && typeof action.payload === "object" ? action.payload : {};
  const allowedByType = {
    generate_content: ["variation_count", "format", "tone"],
    publish_content: ["format", "media_asset_ids"],
    create_ad: ["vendor", "ad_name", "objective", "destination_url", "headline", "primary_text", "description", "creative_asset_ids", "audience", "start_at", "end_at"],
    update_ad: ["vendor", "campaign_external_id", "ad_set_external_id", "ad_external_id", "headline", "primary_text", "description", "creative_asset_ids", "audience", "current_cpl"],
    pause_ad: ["vendor", "budget_action_id", "campaign_external_id", "ad_set_external_id", "ad_external_id", "reason"],
    resume_ad: ["vendor", "campaign_external_id", "ad_set_external_id", "ad_external_id", "reason"],
    collect_metrics: ["vendor", "budget_action_id", "campaign_external_id", "ad_set_external_id", "ad_external_id", "since", "until"],
  };
  return Object.fromEntries(
    (allowedByType[action.action_type] || [])
      .filter((key) => payload[key] !== undefined)
      .map((key) => [key, payload[key]]),
  );
}

function safeCampaign(campaign) {
  return {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    channels: campaign.channels,
    audience: campaign.audience,
    service_area: campaign.service_area,
    offer: campaign.offer,
    call_to_action: campaign.call_to_action,
    approved_claims: campaign.approved_claims,
    blocked_claims: campaign.blocked_claims,
    start_at: campaign.start_at,
    end_at: campaign.end_at,
  };
}

function safeContent(content) {
  return {
    id: content.id,
    title: content.title,
    channel: content.channel,
    service: content.service,
    city: content.city,
    proof_summary: content.proof_summary,
    draft_copy: content.draft_copy,
    call_to_action: content.call_to_action,
    asset_photo_ids: content.asset_photo_ids,
  };
}

function connectorUrl(action, env) {
  if (action.action_type === "generate_content") return env.generatorWebhookUrl;
  if (action.action_type === "collect_metrics") return env.metricsWebhookUrl;
  const channel = String(action.channel || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return env.channelWebhookUrls[channel] || "";
}

function connectorSignature(body, env) {
  const secret = env.connectorSecret;
  if (!secret) throw new Error("MARKETING_CONNECTOR_WEBHOOK_SECRET is required.");
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function executionModeForAction(action, env) {
  const paid = PAID_OPERATIONS.has(action.action_type) || (action.action_type === "collect_metrics" && action.payload?.budget_action_id);
  const mode = paid ? env.paidExecutionMode : env.organicExecutionMode;
  return EXECUTION_MODES.has(mode) ? mode : "disabled";
}

function blocked(reason) {
  return { ok: false, reason };
}

function settingValue(settings, key, fallback) {
  const raw = settings.find((setting) => setting.key === key)?.value;
  if (raw && typeof raw === "object" && "value" in raw) return String(raw.value ?? fallback);
  return raw === undefined || raw === null ? fallback : String(raw);
}

function numberSetting(settings, key, fallback) {
  const value = Number(settingValue(settings, key, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function parseSettingList(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map(normalizeChannel)
    .filter(Boolean);
}

function normalizeChannel(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function requiredEnvironment() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.MARKETING_SYNC_USER_ID;
  if (!supabaseUrl || !serviceRoleKey || !userId) {
    throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and MARKETING_SYNC_USER_ID are required.");
  }
  const channelWebhookUrls = Object.fromEntries(
    Object.entries(process.env)
      .filter(([key, value]) => key.startsWith("MARKETING_") && key.endsWith("_WEBHOOK_URL") && value)
      .map(([key, value]) => [key.slice("MARKETING_".length, -"_WEBHOOK_URL".length), value]),
  );
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    serviceRoleKey,
    userId,
    connectorSecret: process.env.MARKETING_CONNECTOR_WEBHOOK_SECRET || "",
    organicExecutionMode: process.env.MARKETING_ORGANIC_EXECUTION_MODE || "disabled",
    paidExecutionMode: process.env.MARKETING_PAID_EXECUTION_MODE || "disabled",
    generatorWebhookUrl: process.env.MARKETING_GENERATOR_WEBHOOK_URL || "",
    metricsWebhookUrl: process.env.MARKETING_METRICS_WEBHOOK_URL || "",
    channelWebhookUrls,
  };
}

async function dueActions(env) {
  const now = encodeURIComponent(new Date().toISOString());
  const path = `/rest/v1/marketing_actions?user_id=eq.${encodeURIComponent(env.userId)}&status=eq.queued&or=(scheduled_for.is.null,scheduled_for.lte.${now})&order=created_at.asc&limit=${DUE_LIMIT}`;
  return request(env, path);
}

async function claimAction(env, action) {
  const rows = await patchRows(env, "marketing_actions", {
    status: "running",
    started_at: new Date().toISOString(),
    attempts: Number(action.attempts || 0) + 1,
    last_error: null,
  }, { id: `eq.${action.id}`, user_id: `eq.${env.userId}`, status: "eq.queued" });
  return rows[0] || null;
}

async function finishAction(env, id, status, patch = {}) {
  return patchRows(env, "marketing_actions", {
    status,
    completed_at: new Date().toISOString(),
    ...patch,
  }, { id: `eq.${id}`, user_id: `eq.${env.userId}` });
}

async function one(env, table, id) {
  const rows = await request(env, `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(env.userId)}&limit=1`);
  return rows[0] || null;
}

async function listSettings(env) {
  return request(env, `/rest/v1/settings?user_id=eq.${encodeURIComponent(env.userId)}&select=key,value`);
}

async function countPublishedThisWeek(env, campaignId) {
  const start = new Date();
  const day = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - day);
  start.setUTCHours(0, 0, 0, 0);
  const path = `/rest/v1/marketing_actions?campaign_id=eq.${encodeURIComponent(campaignId)}&action_type=eq.publish_content&status=eq.succeeded&completed_at=gte.${encodeURIComponent(start.toISOString())}&select=id`;
  const rows = await request(env, path);
  return rows.length;
}

async function patchRows(env, table, body, filters) {
  const query = Object.entries(filters).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
  return request(env, `/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
}

async function rpc(env, functionName, body) {
  return request(env, `/rest/v1/rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function request(env, path, options = {}) {
  const response = await fetch(`${env.supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: env.serviceRoleKey,
      authorization: `Bearer ${env.serviceRoleKey}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${JSON.stringify(payload)}`);
  return payload || [];
}
