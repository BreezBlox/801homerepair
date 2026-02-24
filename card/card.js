"use strict";

function sanitizeSource(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

function getAttributionSource() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = sanitizeSource(params.get("src"));
  if (fromQuery) {
    window.localStorage.setItem("lead_source", fromQuery);
    return fromQuery;
  }

  const fromStorage = sanitizeSource(window.localStorage.getItem("lead_source"));
  return fromStorage || "card";
}

function routeWithSource(path, source, hash) {
  const url = new URL(path, window.location.origin);
  if (source) {
    url.searchParams.set("src", source);
  }
  if (hash) {
    url.hash = hash;
  }
  return url.pathname + url.search + url.hash;
}

function setupTrackedLinks(source) {
  const quoteBtn = document.getElementById("quoteBtn");
  const saveBtn = document.getElementById("saveBtn");
  const areasLink = document.getElementById("areasLink");
  const faqLink = document.getElementById("faqLink");
  const contactLink = document.getElementById("contactLink");
  const homeLink = document.getElementById("homeLink");

  if (quoteBtn) {
    quoteBtn.setAttribute("href", routeWithSource("/", source, "contact"));
  }
  if (saveBtn) {
    saveBtn.setAttribute("href", routeWithSource("/801-home-repair.vcf", source));
  }
  if (areasLink) {
    areasLink.setAttribute("href", routeWithSource("/", source, "areas"));
  }
  if (faqLink) {
    faqLink.setAttribute("href", routeWithSource("/", source, "faq"));
  }
  if (contactLink) {
    contactLink.setAttribute("href", routeWithSource("/", source, "contact"));
  }
  if (homeLink) {
    homeLink.setAttribute("href", routeWithSource("/", source));
  }
}

function setupTextMessage(source) {
  const textBtn = document.getElementById("textBtn");
  if (!textBtn) {
    return;
  }

  const href = textBtn.getAttribute("href") || "";
  const phone = href.replace(/^sms:/, "").split("?")[0];
  const body = "Hi Rob, I need help with [job type] in [city/zip]. Source: " + source;
  textBtn.setAttribute("href", "sms:" + phone + "?body=" + encodeURIComponent(body));
}

function setupCopyLink(source) {
  const copyBtn = document.getElementById("copyLinkBtn");
  if (!copyBtn) {
    return;
  }

  const linkToCopy = new URL(routeWithSource("/card/", source), window.location.origin).toString();

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(linkToCopy);
      const original = copyBtn.textContent;
      copyBtn.textContent = "Copied";
      window.setTimeout(() => {
        copyBtn.textContent = original || "Copy Card Link";
      }, 1400);
    } catch (error) {
      window.prompt("Copy this link:", linkToCopy);
    }
  });
}

function setupSourceNote(source) {
  const sourceNote = document.getElementById("sourceNote");
  if (!sourceNote) {
    return;
  }

  sourceNote.classList.remove("is-hidden");
  sourceNote.textContent = "Link source: " + source;
}

const source = getAttributionSource();
setupTrackedLinks(source);
setupTextMessage(source);
setupCopyLink(source);
setupSourceNote(source);
