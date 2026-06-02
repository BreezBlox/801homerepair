import Stripe from "stripe";
import { timingSafeEqual } from "node:crypto";

let stripeClient;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch (error) {
    return null;
  }
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAdmin(event, body) {
  const expected = process.env.PAYMENT_ADMIN_TOKEN;
  const provided = body?.adminToken || event.headers["x-admin-token"];

  if (!expected) {
    return { ok: false, status: 500, message: "PAYMENT_ADMIN_TOKEN is not configured." };
  }

  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, message: "Admin token is missing or invalid." };
  }

  return { ok: true };
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 450);
}

function amountToCents(value, label) {
  const normalized = String(value ?? "").replace(/[$,\s]/g, "");
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than 0.`);
  }

  return Math.round(amount * 100);
}

function baseUrlFrom(event) {
  const configured = process.env.SITE_URL || process.env.URL;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const host = event.headers.host;
  const protocol = host?.includes("localhost") ? "http" : "https";
  return host ? `${protocol}://${host}` : "http://localhost:8888";
}

function compactMetadata(values) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => [key, String(value).slice(0, 450)])
  );
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST." });
  }

  const stripe = getStripe();
  if (!stripe) {
    return json(500, { error: "STRIPE_SECRET_KEY is not configured." });
  }

  const body = parseBody(event);
  if (!body) {
    return json(400, { error: "Request body must be valid JSON." });
  }

  const admin = requireAdmin(event, body);
  if (!admin.ok) {
    return json(admin.status, { error: admin.message });
  }

  if (body.authorizationAccepted !== true) {
    return json(400, {
      error: "Confirm the estimate includes saved-payment authorization before creating a deposit link."
    });
  }

  const estimateNumber = cleanText(body.estimateNumber);
  const customerEmail = cleanText(body.customerEmail).toLowerCase();
  const customerName = cleanText(body.customerName);
  const projectTitle = cleanText(body.projectTitle, "Home repair job");

  if (!estimateNumber) {
    return json(400, { error: "Estimate number is required." });
  }

  if (!customerEmail || !customerEmail.includes("@")) {
    return json(400, { error: "A valid customer email is required." });
  }

  let depositCents;
  let totalCents;
  let balanceCents;

  try {
    depositCents = amountToCents(body.depositAmount, "Deposit amount");
    totalCents = amountToCents(body.totalAmount, "Total amount");
    balanceCents = Math.max(0, totalCents - depositCents);
  } catch (error) {
    return json(400, { error: error.message });
  }

  if (depositCents >= totalCents) {
    return json(400, { error: "Deposit amount must be less than the total amount for this workflow." });
  }

  const siteUrl = baseUrlFrom(event);
  const successParams = new URLSearchParams({
    status: "success",
    estimate: estimateNumber
  });
  const cancelParams = new URLSearchParams({
    status: "cancelled",
    estimate: estimateNumber
  });

  const metadata = compactMetadata({
    estimate_number: estimateNumber,
    customer_name: customerName,
    project_title: projectTitle,
    total_amount_cents: totalCents,
    deposit_amount_cents: depositCents,
    balance_amount_cents: balanceCents,
    payment_stage: "deposit"
  });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      customer_email: customerEmail,
      client_reference_id: estimateNumber,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: depositCents,
            product_data: {
              name: `Deposit - ${estimateNumber}`,
              description: projectTitle
            }
          }
        }
      ],
      metadata,
      payment_intent_data: {
        setup_future_usage: "off_session",
        description: `Deposit - ${estimateNumber}`,
        metadata
      },
      custom_text: {
        submit: {
          message:
            "By paying this deposit, you authorize 801 Home Repair to securely save this payment method with Stripe and charge the remaining approved balance when the job is complete."
        }
      },
      success_url: `${siteUrl}/payment-status.html?${successParams.toString()}`,
      cancel_url: `${siteUrl}/payment-status.html?${cancelParams.toString()}`
    });

    return json(200, {
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
      estimateNumber,
      customerEmail,
      totalAmountCents: totalCents,
      depositAmountCents: depositCents,
      balanceAmountCents: balanceCents
    });
  } catch (error) {
    return json(502, {
      error: "Stripe could not create the deposit checkout session.",
      detail: error.message
    });
  }
};
