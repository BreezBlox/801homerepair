import { createHash } from "node:crypto";

const FORM_NAME = "quote-request";
const NETLIFY_FORM_SOURCE = "netlify_form";
const WEBSITE_FUNCTION_SOURCE = "website_function";
const WEBSITE_LEAD_TAG = "website_lead";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, {
        status: 405,
        headers: { Allow: "POST" },
      });
    }

    if (!sameSiteOrigin(request)) {
      return Response.json({ error: "Cross-site requests are not accepted." }, { status: 403 });
    }

    const data = await requestData(request);
    if (cleanText(data["bot-field"])) {
      return new Response(null, { status: 204 });
    }
    if (cleanText(data["form-name"]) !== FORM_NAME) {
      return Response.json({ error: "Unknown form." }, { status: 404 });
    }

    const lead = extractLead(data);
    if (!lead.name || !lead.phone || !lead.scope) {
      return Response.json({ error: "Name, phone, and project details are required." }, { status: 400 });
    }

    await syncWebsiteLead(data, {}, WEBSITE_FUNCTION_SOURCE);
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/thank-you.html",
        "Cache-Control": "no-store",
      },
    });
  },

  async formSubmitted(event) {
    const data = event?.data ?? {};
    const formName = cleanText(data["form-name"] || data.form_name || data.formName);
    if (formName && formName !== FORM_NAME) return;
    await syncWebsiteLead(data, event, NETLIFY_FORM_SOURCE);
  },
};

async function syncWebsiteLead(data, event, externalSource) {
  const lead = extractLead(data, event);
  if (!lead.name || !lead.phone || !lead.scope) {
    console.warn("Website lead skipped because required lead fields were missing.");
    return { status: "skipped" };
  }

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const userId = requiredEnv("MARKETING_SYNC_USER_ID");

  const existing = await findJobByExternalId({
    supabaseUrl,
    serviceRoleKey,
    userId,
    externalId: lead.externalId,
    externalSource,
  });
  if (existing) {
    console.log("Website lead already synced", { externalId: lead.externalId, jobId: existing.id });
    return { status: "duplicate", job: existing };
  }

  const customer = await findOrCreateCustomer({ supabaseUrl, serviceRoleKey, userId, lead });
  const job = await createLeadJob({
    supabaseUrl,
    serviceRoleKey,
    userId,
    lead,
    customerId: customer?.id ?? null,
    externalSource,
  });

  console.log("Website lead synced", {
    externalId: lead.externalId,
    jobId: job?.id ?? null,
    source: lead.source,
    externalSource,
  });
  return { status: "created", job };
}

export function extractLead(data, event = {}) {
  const name = cleanText(data.name, 160);
  const phone = cleanText(data.phone, 80);
  const email = cleanText(data.email, 200) || null;
  const address = cleanText(data.job_address_or_city, 300) || null;
  const scope = cleanText(data.project_description, 4000);
  const materialsStatus = cleanText(data.materials_status, 300) || null;
  const preferredDeadline = validDate(data.preferred_deadline) ? data.preferred_deadline : null;
  const source = cleanText(data.source || data.utm_source || "Website direct", 160) || "Website direct";
  const submittedAt = validTimestamp(data.submitted_at) ? data.submitted_at : null;
  const platformId = cleanText(event.id || event.submission?.id || event.submissionId, 200);
  const fingerprint = [submittedAt || "no-client-time", name, phone, email || "", scope].join("|");
  const externalId = platformId || createHash("sha256").update(fingerprint).digest("hex").slice(0, 40);

  return {
    externalId,
    name,
    phone,
    email,
    address,
    scope,
    materialsStatus,
    preferredDeadline,
    source,
    submittedAt,
    attribution: {
      source,
      first_touch_source: cleanText(data.first_touch_source, 160) || null,
      first_touch_at: validTimestamp(data.first_touch_at) ? data.first_touch_at : null,
      utm_source: cleanText(data.utm_source, 160) || null,
      utm_medium: cleanText(data.utm_medium, 160) || null,
      utm_campaign: cleanText(data.utm_campaign, 240) || null,
      utm_content: cleanText(data.utm_content, 240) || null,
      utm_term: cleanText(data.utm_term, 240) || null,
      referrer_host: cleanText(data.referrer_host, 240) || null,
      landing_path: cleanText(data.landing_path, 240) || null,
    },
  };
}

async function findOrCreateCustomer({ supabaseUrl, serviceRoleKey, userId, lead }) {
  const existing = await findCustomer({ supabaseUrl, serviceRoleKey, userId, lead });
  if (existing) return existing;

  const rows = await supabaseRequest({
    supabaseUrl,
    serviceRoleKey,
    path: "/rest/v1/customers",
    method: "POST",
    body: {
      user_id: userId,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      lead_source: lead.source,
      customer_type: ["lead", WEBSITE_LEAD_TAG],
      notes: "Created from a verified HomeRepairSLC.com quote request.",
    },
    prefer: "return=representation",
  });
  return rows[0] ?? null;
}

async function findCustomer({ supabaseUrl, serviceRoleKey, userId, lead }) {
  for (const [field, value] of [["email", lead.email], ["phone", lead.phone]]) {
    if (!value) continue;
    const rows = await supabaseGet({
      supabaseUrl,
      serviceRoleKey,
      table: "customers",
      filters: { user_id: `eq.${userId}`, [field]: `eq.${value}` },
      limit: 1,
    });
    if (rows[0]) return rows[0];
  }
  return null;
}

async function findJobByExternalId({ supabaseUrl, serviceRoleKey, userId, externalId, externalSource }) {
  const rows = await supabaseGet({
    supabaseUrl,
    serviceRoleKey,
    table: "jobs",
    filters: {
      user_id: `eq.${userId}`,
      external_source: `eq.${externalSource}`,
      external_id: `eq.${externalId}`,
    },
    limit: 1,
  });
  return rows[0] ?? null;
}

async function createLeadJob({ supabaseUrl, serviceRoleKey, userId, lead, customerId, externalSource }) {
  const notes = [
    "Created from a verified HomeRepairSLC.com quote request.",
    lead.materialsStatus ? `Materials: ${lead.materialsStatus}.` : "",
    `Attribution: ${JSON.stringify(lead.attribution)}.`,
  ].filter(Boolean).join("\n");
  const rows = await supabaseRequest({
    supabaseUrl,
    serviceRoleKey,
    path: "/rest/v1/jobs",
    method: "POST",
    body: {
      user_id: userId,
      customer_id: customerId,
      client_name: lead.name,
      phone: lead.phone,
      email: lead.email,
      address: lead.address,
      lead_source: lead.source,
      first_touch_source: lead.attribution.first_touch_source,
      first_touch_at: lead.attribution.first_touch_at,
      utm_source: lead.attribution.utm_source,
      utm_medium: lead.attribution.utm_medium,
      utm_campaign: lead.attribution.utm_campaign,
      utm_content: lead.attribution.utm_content,
      utm_term: lead.attribution.utm_term,
      referrer_host: lead.attribution.referrer_host,
      landing_path: lead.attribution.landing_path,
      job_type: "Website quote request",
      tags: [WEBSITE_LEAD_TAG],
      scope_summary: lead.scope,
      stage: "funnel",
      priority: "normal",
      deadline: lead.preferredDeadline,
      next_action: "Review website request and respond.",
      follow_up_date: denverDate(),
      assigned_to_next_step: "me",
      estimate_status: "not_started",
      deposit_status: "not_needed",
      invoice_status: "not_started",
      external_source: externalSource,
      external_id: lead.externalId,
      external_updated_at: lead.submittedAt || new Date().toISOString(),
      booking_status: "lead_received",
      booking_raw: {
        attribution: lead.attribution,
        materials_status: lead.materialsStatus,
        preferred_deadline: lead.preferredDeadline,
      },
      notes,
    },
    prefer: "return=representation",
  });
  return rows[0] ?? null;
}

async function requestData(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  }
  return Object.fromEntries(new URLSearchParams(await request.text()).entries());
}

function sameSiteOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin
    || origin === "https://www.homerepairslc.com"
    || origin === "https://homerepairslc.com";
}

function denverDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function cleanText(value, maxLength = 450) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function validTimestamp(value) {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for verified website lead sync.`);
  return value;
}

async function supabaseGet({ supabaseUrl, serviceRoleKey, table, filters, limit }) {
  const params = new URLSearchParams({ select: "*" });
  for (const [key, value] of Object.entries(filters)) params.set(key, value);
  if (limit) params.set("limit", String(limit));
  return supabaseRequest({
    supabaseUrl,
    serviceRoleKey,
    path: `/rest/v1/${table}?${params}`,
    method: "GET",
  });
}

async function supabaseRequest({ supabaseUrl, serviceRoleKey, path, method, body, prefer }) {
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : [];
  if (!response.ok) {
    throw new Error(`Supabase ${method} ${path} failed: ${parsed.message || response.status}`);
  }
  return Array.isArray(parsed) ? parsed : [parsed];
}
