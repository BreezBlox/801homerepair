"use strict";

/*
  ======================================================
  EDIT BUSINESS DETAILS HERE
  ======================================================
  Required placeholders:
  - BUSINESS_NAME
  - SECONDARY_NAME (optional)
  - OWNER_NAME
  - PHONE
  - SMS
  - EMAIL
  - SERVICE_AREAS
  - LICENSED_INSURED_TOGGLE (default false)
  - PRIMARY_ACCENT
  - SECONDARY_ACCENT
  - SITE_URL
*/
const CONFIG = {
  BUSINESS_NAME: "801 Home Repair",
  SECONDARY_NAME: "801TechniCA",
  OWNER_NAME: "Rob K.",
  PHONE: "+13854399031",
  SMS: "+13854399031",
  EMAIL: "hello@example.com",
  SERVICE_AREAS: [
    "Midvale",
    "Salt Lake County",
    "Park City",
    "Utah County"
  ],
  LICENSED_INSURED_TOGGLE: false,
  PRIMARY_ACCENT: "#1d4ed8",
  SECONDARY_ACCENT: "#f97316",
  SITE_URL: "https://www.homerepairslc.com"
};

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function toE164(value) {
  const digits = normalizeDigits(value);
  if (digits.length === 10) {
    return "+1" + digits;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return "+" + digits;
  }
  return value ? String(value).trim() : "";
}

function formatPhoneDisplay(value) {
  const digits = normalizeDigits(value);
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length === 10) {
    return "(" + ten.slice(0, 3) + ") " + ten.slice(3, 6) + "-" + ten.slice(6);
  }
  return value ? String(value) : "";
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((node) => {
    node.textContent = value;
  });
}

function setLinks(selector, href) {
  document.querySelectorAll(selector).forEach((node) => {
    node.setAttribute("href", href);
  });
}

function sanitizeSource(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function applyThemeColors() {
  const hexColor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  if (hexColor.test(CONFIG.PRIMARY_ACCENT)) {
    document.documentElement.style.setProperty("--primary", CONFIG.PRIMARY_ACCENT);
  }
  if (hexColor.test(CONFIG.SECONDARY_ACCENT)) {
    document.documentElement.style.setProperty("--secondary", CONFIG.SECONDARY_ACCENT);
  }
}

function applyBusinessContent() {
  const phoneE164 = toE164(CONFIG.PHONE);
  const smsE164 = toE164(CONFIG.SMS || CONFIG.PHONE);
  const phoneDisplay = formatPhoneDisplay(phoneE164 || CONFIG.PHONE);

  setText("[data-business-name]", CONFIG.BUSINESS_NAME);

  document.querySelectorAll("[data-secondary-name]").forEach((node) => {
    if (CONFIG.SECONDARY_NAME) {
      node.textContent = CONFIG.SECONDARY_NAME;
    } else {
      node.classList.add("is-hidden");
    }
  });

  setText("[data-owner-name]", CONFIG.OWNER_NAME);
  setText("[data-phone-display]", phoneDisplay || CONFIG.PHONE);
  setText("[data-email-display]", CONFIG.EMAIL);
  setText("[data-service-areas]", CONFIG.SERVICE_AREAS.join(", "));
  setText("[data-current-year]", String(new Date().getFullYear()));

  if (phoneE164) {
    setLinks("[data-phone-link]", "tel:" + phoneE164);
  }
  if (smsE164) {
    setLinks("[data-sms-link]", "sms:" + smsE164);
  }
  if (CONFIG.EMAIL) {
    setLinks("[data-email-link]", "mailto:" + CONFIG.EMAIL);
  }

  const showCredentials = Boolean(CONFIG.LICENSED_INSURED_TOGGLE);
  ["legalBadge", "licenseBlock"].forEach((id) => {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }
    if (showCredentials) {
      node.classList.remove("is-hidden");
    } else {
      node.classList.add("is-hidden");
    }
  });
}

function updateSeoTags() {
  const normalizedUrl = CONFIG.SITE_URL ? CONFIG.SITE_URL.replace(/\/+$/, "") + "/" : "";
  if (!normalizedUrl) {
    return;
  }

  const pathName = window.location.pathname || "/";
  const canonicalPath = pathName.endsWith("index.html")
    ? pathName.slice(0, -10) || "/"
    : pathName;
  const pageUrl = new URL(canonicalPath, normalizedUrl).toString();

  document.querySelectorAll("link[rel='canonical']").forEach((node) => {
    node.setAttribute("href", pageUrl);
  });

  document.querySelectorAll("meta[property='og:url']").forEach((node) => {
    node.setAttribute("content", pageUrl);
  });

  const jsonLdNode = document.getElementById("jsonLdLocalBusiness");
  if (!jsonLdNode) {
    return;
  }

  try {
    const jsonLd = JSON.parse(jsonLdNode.textContent);
    jsonLd.name = CONFIG.BUSINESS_NAME;
    jsonLd.alternateName = CONFIG.SECONDARY_NAME || undefined;
    jsonLd.url = normalizedUrl;
    jsonLd.telephone = toE164(CONFIG.PHONE);
    jsonLd.email = CONFIG.EMAIL;
    jsonLd.founder = {
      "@type": "Person",
      "name": CONFIG.OWNER_NAME
    };
    jsonLd.areaServed = CONFIG.SERVICE_AREAS.map((area) => ({
      "@type": "AdministrativeArea",
      "name": area
    }));
    jsonLdNode.textContent = JSON.stringify(jsonLd);
  } catch (error) {
    console.warn("Unable to parse JSON-LD block.", error);
  }
}

function getLeadSource() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = sanitizeSource(params.get("src"));

  if (fromQuery) {
    window.localStorage.setItem("lead_source", fromQuery);
    return fromQuery;
  }

  const fromStorage = sanitizeSource(window.localStorage.getItem("lead_source"));
  return fromStorage || "direct";
}

function applyLeadSource() {
  const source = getLeadSource();
  const sourceInput = document.getElementById("leadSource");
  if (sourceInput) {
    sourceInput.value = source;
  }
}

function setupNavToggle() {
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("primary-nav");
  if (!navToggle || !nav) {
    return;
  }

  const closeNav = () => {
    nav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  };

  navToggle.addEventListener("click", () => {
    const expanded = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!expanded));
    nav.classList.toggle("open");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 900px)").matches) {
        closeNav();
      }
    });
  });

  document.addEventListener("click", (event) => {
    if (!window.matchMedia("(max-width: 900px)").matches) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && !nav.contains(target) && !navToggle.contains(target)) {
      closeNav();
    }
  });
}

function setupCopyPhoneButton() {
  const button = document.getElementById("copyPhoneBtn");
  if (!button) {
    return;
  }

  const phoneText = formatPhoneDisplay(CONFIG.PHONE) || CONFIG.PHONE;
  if (!phoneText) {
    button.classList.add("is-hidden");
    return;
  }

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(phoneText);
      const original = button.textContent;
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = original || "Copy Phone";
      }, 1400);
    } catch (error) {
      window.prompt("Copy this number:", phoneText);
    }
  });
}

function setupFormUX() {
  const form = document.getElementById("quoteForm");
  if (!form) {
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  form.addEventListener("submit", () => {
    if (!submitButton) {
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
  });
}

applyThemeColors();
applyBusinessContent();
updateSeoTags();
applyLeadSource();
setupNavToggle();
setupCopyPhoneButton();
setupFormUX();
