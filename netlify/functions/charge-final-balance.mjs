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

function paymentMethodId(paymentIntent) {
  const method = paymentIntent?.payment_method;

  if (typeof method === "string") {
    return method;
  }

  return method?.id || "";
}

function customerId(session) {
  if (typeof session.customer === "string") {
    return session.customer;
  }

  return session.customer?.id || "";
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

async function hasExistingFinalCharge(stripe, customer, checkoutSessionId) {
  const intents = await stripe.paymentIntents.list({
    customer,
    limit: 100
  });

  return intents.data.find((intent) => {
    const sameSession = intent.metadata?.source_checkout_session === checkoutSessionId;
    const finalBalance = intent.metadata?.payment_stage === "final_balance";
    const activeStatus = ["processing", "requires_capture", "succeeded"].includes(intent.status);
    return sameSession && finalBalance && activeStatus;
  });
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

  if (body.chargeConfirmation !== "CHARGE") {
    return json(400, { error: "Type CHARGE to confirm the final-balance charge." });
  }

  const checkoutSessionId = cleanText(body.checkoutSessionId);
  const estimateNumber = cleanText(body.estimateNumber);
  const completionNote = cleanText(body.completionNote);

  if (!checkoutSessionId || !checkoutSessionId.startsWith("cs_")) {
    return json(400, { error: "A valid Stripe Checkout Session ID is required." });
  }

  let finalCents;
  try {
    finalCents = amountToCents(body.finalAmount, "Final balance amount");
  } catch (error) {
    return json(400, { error: error.message });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
      expand: ["payment_intent.payment_method", "customer"]
    });

    if (session.payment_status !== "paid") {
      return json(409, {
        error: "The deposit checkout session is not marked paid in Stripe.",
        paymentStatus: session.payment_status
      });
    }

    const customer = customerId(session);
    const method = paymentMethodId(session.payment_intent);

    if (!customer || !method) {
      return json(409, {
        error: "Stripe did not return a reusable customer/payment method for this deposit session."
      });
    }

    const existingFinalCharge = await hasExistingFinalCharge(stripe, customer, checkoutSessionId);
    if (existingFinalCharge) {
      return json(409, {
        error: "A final-balance charge already exists for this deposit session.",
        alreadyCharged: true,
        paymentIntentId: existingFinalCharge.id,
        status: existingFinalCharge.status,
        amountCents: existingFinalCharge.amount
      });
    }

    const metadata = {
      estimate_number: estimateNumber || session.metadata?.estimate_number || "",
      source_checkout_session: checkoutSessionId,
      source_deposit_payment_intent:
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "",
      payment_stage: "final_balance",
      completion_note: completionNote
    };

    const intent = await stripe.paymentIntents.create(
      {
        amount: finalCents,
        currency: "usd",
        customer,
        payment_method: method,
        off_session: true,
        confirm: true,
        description: `Final balance - ${metadata.estimate_number || checkoutSessionId}`,
        receipt_email: session.customer_details?.email || undefined,
        metadata,
        expand: ["latest_charge"]
      },
      {
        idempotencyKey: `final-balance:${checkoutSessionId}:${finalCents}`
      }
    );

    const latestCharge = typeof intent.latest_charge === "string" ? null : intent.latest_charge;

    return json(200, {
      paymentIntentId: intent.id,
      status: intent.status,
      amountCents: intent.amount,
      receiptUrl: latestCharge?.receipt_url || "",
      estimateNumber: metadata.estimate_number
    });
  } catch (error) {
    const statusCode = error.code === "authentication_required" || error.type === "StripeCardError" ? 402 : 502;

    return json(statusCode, {
      error:
        error.code === "authentication_required"
          ? "The bank requires the customer to re-authorize this payment. Send a new payment link for the balance."
          : "Stripe could not charge the final balance.",
      detail: error.message,
      stripeCode: error.code || "",
      declineCode: error.decline_code || ""
    });
  }
};
