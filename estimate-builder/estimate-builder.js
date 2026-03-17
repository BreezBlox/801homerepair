const STORAGE_KEY = "estimate-builder-v1";
const SAVED_ESTIMATES_KEY = "estimate-builder-library-v1";
const ACTIVE_ESTIMATE_KEY = "estimate-builder-active-v1";

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function addDays(dateString, days) {
  const date = dateString ? new Date(dateString + "T00:00:00") : new Date();
  date.setDate(date.getDate() + days);
  return formatDateForInput(date);
}

function buildEstimateNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return "EST-" + y + m + d + "-001";
}

function createItem(overrides = {}) {
  return {
    id: "item-" + Date.now() + "-" + Math.random().toString(16).slice(2),
    description: "",
    details: "",
    qty: 1,
    unit: "ea",
    unitPrice: 0,
    showEstimate: true,
    showShopping: false,
    ...overrides
  };
}

function createDefaultState() {
  const today = formatDateForInput(new Date());
  return {
    documentTitle: "Estimate",
    seller: {
      name: "",
      phone: "",
      email: "",
      address1: "",
      address2: ""
    },
    customer: {
      name: "",
      phone: "",
      email: "",
      address1: "",
      address2: ""
    },
    meta: {
      estimateNumber: buildEstimateNumber(),
      estimateDate: today,
      validUntil: addDays(today, 14),
      projectTitle: "",
      projectLocation: ""
    },
    financial: {
      currencySymbol: "$",
      discount: 0,
      taxRate: 0,
      depositRate: 0
    },
    notes: "Scope includes the labor, materials, and tasks listed above unless noted otherwise.",
    terms: "This estimate is based on visible site conditions only. Additional work, hidden conditions, or requested scope changes may require a revised price.",
    items: [createItem()]
  };
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPath(target, path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), target);
}

function setPath(target, path, value) {
  const keys = path.split(".");
  let current = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    current = current[keys[index]];
  }
  current[keys[keys.length - 1]] = value;
}

function hydrateState(source) {
  const fallback = createDefaultState();
  const parsed = source && typeof source === "object" ? source : {};
  const nextState = {
    ...fallback,
    ...parsed,
    seller: { ...fallback.seller, ...(parsed.seller || {}) },
    customer: { ...fallback.customer, ...(parsed.customer || {}) },
    meta: { ...fallback.meta, ...(parsed.meta || {}) },
    financial: { ...fallback.financial, ...(parsed.financial || {}) }
  };

  const importedItems = Array.isArray(parsed.items) ? parsed.items : [];
  nextState.items = importedItems.length
    ? importedItems.map((item) =>
        createItem({
          ...item,
          id: item.id || createItem().id,
          qty: normalizeNumber(item.qty),
          unitPrice: normalizeNumber(item.unitPrice),
          showEstimate: item.showEstimate !== false,
          showShopping: item.showShopping === true
        })
      )
    : [createItem()];

  return nextState;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultState();
    }

    return hydrateState(JSON.parse(raw));
  } catch (error) {
    return createDefaultState();
  }
}

function loadActiveEstimateId() {
  try {
    return localStorage.getItem(ACTIVE_ESTIMATE_KEY) || "";
  } catch (error) {
    return "";
  }
}

function setCurrentEstimateId(id) {
  currentEstimateId = id || "";
  if (currentEstimateId) {
    localStorage.setItem(ACTIVE_ESTIMATE_KEY, currentEstimateId);
  } else {
    localStorage.removeItem(ACTIVE_ESTIMATE_KEY);
  }
}

function createSavedEstimateId() {
  return "estimate-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function normalizeSavedEstimate(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const sourceState = entry.state && typeof entry.state === "object" ? entry.state : entry;
  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : createSavedEstimateId(),
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : new Date().toISOString(),
    state: hydrateState(sourceState)
  };
}

function loadSavedEstimates() {
  try {
    const raw = localStorage.getItem(SAVED_ESTIMATES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeSavedEstimate)
      .filter(Boolean)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  } catch (error) {
    return [];
  }
}

function saveSavedEstimates(estimates) {
  localStorage.setItem(SAVED_ESTIMATES_KEY, JSON.stringify(estimates));
}

function describeEstimate(sourceState) {
  const title = (sourceState.meta.projectTitle || "").trim()
    || (sourceState.customer.name || "").trim()
    || (sourceState.meta.estimateNumber || "").trim()
    || "Untitled estimate";
  const meta = [
    (sourceState.meta.estimateNumber || "").trim(),
    (sourceState.customer.name || "").trim(),
    (sourceState.meta.estimateDate || "").trim()
  ].filter(Boolean).join(" | ");

  return {
    title,
    meta: meta || "No project info yet"
  };
}

function formatSavedEstimateDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "Saved just now";
  }

  return "Saved " + parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildSavedEstimateRecord(estimateId) {
  return {
    id: estimateId,
    updatedAt: new Date().toISOString(),
    state: deepCopy(state)
  };
}

function upsertSavedEstimate(estimateId) {
  const entries = loadSavedEstimates();
  const nextId = estimateId || createSavedEstimateId();
  const nextRecord = buildSavedEstimateRecord(nextId);
  const index = entries.findIndex((entry) => entry.id === nextId);

  if (index >= 0) {
    entries[index] = nextRecord;
  } else {
    entries.unshift(nextRecord);
  }

  saveSavedEstimates(entries);
  setCurrentEstimateId(nextId);
  return index >= 0;
}

function syncCurrentSavedEstimate() {
  if (!currentEstimateId) {
    return false;
  }

  const entries = loadSavedEstimates();
  const index = entries.findIndex((entry) => entry.id === currentEstimateId);
  if (index === -1) {
    setCurrentEstimateId("");
    return false;
  }

  entries[index] = buildSavedEstimateRecord(currentEstimateId);
  saveSavedEstimates(entries);
  return true;
}

function storeWorkingDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (currentEstimateId) {
    localStorage.setItem(ACTIVE_ESTIMATE_KEY, currentEstimateId);
  } else {
    localStorage.removeItem(ACTIVE_ESTIMATE_KEY);
  }
}

function openSavedEstimate(estimateId) {
  const entry = loadSavedEstimates().find((savedEstimate) => savedEstimate.id === estimateId);
  if (!entry) {
    updateSaveStatus("Saved estimate not found", false);
    renderSavedEstimates();
    return;
  }

  state = hydrateState(entry.state);
  setCurrentEstimateId(entry.id);
  renderAll();
  updateSaveStatus("Saved estimate opened", true);
}

function deleteSavedEstimate(estimateId) {
  const entries = loadSavedEstimates();
  const filtered = entries.filter((entry) => entry.id !== estimateId);
  if (filtered.length === entries.length) {
    return;
  }

  saveSavedEstimates(filtered);
  const removedActiveEstimate = currentEstimateId === estimateId;
  if (removedActiveEstimate) {
    setCurrentEstimateId("");
    storeWorkingDraft();
  }

  renderSavedEstimates();
  updateSaveStatus(
    removedActiveEstimate ? "Saved estimate deleted; draft kept open" : "Saved estimate deleted",
    true
  );
}

function renderSavedEstimates() {
  const list = document.getElementById("saved-estimates-list");
  const caption = document.getElementById("saved-estimate-caption");
  const saveButton = document.getElementById("save-estimate-button");
  if (!list || !caption || !saveButton) {
    return;
  }

  const entries = loadSavedEstimates();
  const activeEntry = currentEstimateId ? entries.find((entry) => entry.id === currentEstimateId) : null;
  if (currentEstimateId && !activeEntry) {
    setCurrentEstimateId("");
  }

  saveButton.textContent = activeEntry ? "Update Saved Draft" : "Save Current Draft";
  caption.textContent = activeEntry
    ? "Editing a saved draft. Changes save back to this item automatically."
    : "Current draft stays on this device. Save it here or export the editable draft (.json) to move it to another device.";

  list.innerHTML = "";
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "saved-estimate-empty";
    empty.textContent = "No saved estimates yet.";
    list.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const details = describeEstimate(entry.state);
    const card = document.createElement("div");
    card.className = "saved-estimate-card" + (entry.id === currentEstimateId ? " is-active" : "");
    card.innerHTML = `
      <p class="saved-estimate-title"></p>
      <p class="saved-estimate-meta"></p>
      <div class="saved-estimate-actions">
        <button class="secondary" type="button" data-action="open">Open</button>
        <button class="danger" type="button" data-action="delete">Delete</button>
      </div>
    `;

    card.querySelector(".saved-estimate-title").textContent = details.title;
    const metaParts = [
      entry.id === currentEstimateId ? "Currently editing" : "",
      details.meta,
      formatSavedEstimateDate(entry.updatedAt)
    ].filter(Boolean);
    card.querySelector(".saved-estimate-meta").textContent = metaParts.join(" | ");

    card.querySelector('[data-action="open"]').addEventListener("click", () => {
      openSavedEstimate(entry.id);
    });

    card.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (!window.confirm("Delete this saved estimate from the local list?")) {
        return;
      }
      deleteSavedEstimate(entry.id);
    });

    list.appendChild(card);
  });
}

let state = loadState();
let currentView = "estimate";
let currentEstimateId = loadActiveEstimateId();

function saveState() {
  storeWorkingDraft();
  syncCurrentSavedEstimate();
  renderSavedEstimates();
  updateSaveStatus("Saved locally", true);
}

function updateSaveStatus(message, success) {
  const element = document.getElementById("save-status");
  element.textContent = message;
  element.style.background = success ? "rgba(223, 240, 221, 0.18)" : "rgba(255, 214, 204, 0.14)";
  element.style.color = success ? "#d8f2d4" : "#ffd7cf";
}

function formatMoney(value) {
  const symbol = state.financial.currencySymbol || "$";
  return symbol + normalizeNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function lineAmount(item) {
  return normalizeNumber(item.qty) * normalizeNumber(item.unitPrice);
}

function itemHasContent(item) {
  return Boolean(item.description || item.details || normalizeNumber(item.unitPrice) > 0);
}

function getVisibleItems(mode) {
  const flag = mode === "shopping" ? "showShopping" : "showEstimate";
  return state.items.filter((item) => item[flag] && itemHasContent(item));
}

function calculateTotals(items) {
  const subtotal = items.reduce((sum, item) => sum + lineAmount(item), 0);
  const discount = Math.max(0, normalizeNumber(state.financial.discount));
  const discountedSubtotal = Math.max(0, subtotal - discount);
  const tax = discountedSubtotal * (Math.max(0, normalizeNumber(state.financial.taxRate)) / 100);
  const total = discountedSubtotal + tax;
  const deposit = total * (Math.max(0, normalizeNumber(state.financial.depositRate)) / 100);
  const balance = Math.max(0, total - deposit);

  return { subtotal, discount, tax, total, deposit, balance };
}

function assignFormValues() {
  document.querySelectorAll("[data-path]").forEach((field) => {
    const value = getPath(state, field.dataset.path);
    field.value = value == null ? "" : value;
  });
}

function appendInlineGroup(parent, className, values) {
  const filtered = values.filter(Boolean);

  if (!filtered.length) {
    return;
  }

  const group = document.createElement("div");
  group.className = className;

  filtered.forEach((value) => {
    const item = document.createElement("span");
    item.className = "contact-inline-item";
    item.textContent = value;
    group.appendChild(item);
  });

  parent.appendChild(group);
}

function renderContactBlock(element, contact, emptyLabel) {
  element.innerHTML = "";
  const fields = [
    contact.name,
    contact.phone,
    contact.email,
    contact.address1,
    contact.address2
  ].filter(Boolean);

  if (!fields.length) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder";
    placeholder.textContent = emptyLabel;
    element.appendChild(placeholder);
    return;
  }

  const block = document.createElement("div");
  block.className = "contact-compact";

  if (contact.name) {
    const name = document.createElement("div");
    name.className = "contact-name";
    name.textContent = contact.name;
    block.appendChild(name);
  }

  appendInlineGroup(block, "contact-inline-group contact-meta", [contact.phone, contact.email]);
  appendInlineGroup(block, "contact-inline-group contact-address", [contact.address1, contact.address2]);

  element.appendChild(block);
}

function renderLineItemEditors() {
  const list = document.getElementById("item-list");
  list.innerHTML = "";

  state.items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "item-card";
    card.innerHTML = `
      <div class="item-card-head">
        <p class="item-index">Line ${index + 1}</p>
        <div class="item-amount">${formatMoney(lineAmount(item))}</div>
      </div>
      <div class="field-grid single">
        <label>
          <span>Description</span>
          <input type="text" data-item-field="description" placeholder="Line item description">
        </label>
        <label>
          <span>Details</span>
          <textarea data-item-field="details" placeholder="Optional details, scope notes, or product info."></textarea>
        </label>
      </div>
      <div class="field-grid">
        <label>
          <span>Qty</span>
          <input type="number" min="0" step="0.01" data-item-field="qty">
        </label>
        <label>
          <span>Unit</span>
          <input type="text" data-item-field="unit" placeholder="ea, hr, lot">
        </label>
        <label>
          <span>Unit Price</span>
          <input type="number" min="0" step="0.01" data-item-field="unitPrice">
        </label>
        <label>
          <span>Amount</span>
          <input type="text" data-role="amount" value="${formatMoney(lineAmount(item))}" disabled>
        </label>
      </div>
      <div class="field-grid">
        <label>
          <span>Customer Estimate</span>
          <input type="checkbox" data-item-flag="showEstimate">
        </label>
        <label>
          <span>Shopping List</span>
          <input type="checkbox" data-item-flag="showShopping">
        </label>
      </div>
      <div class="item-actions">
        <button class="subtle" type="button" data-action="up">Move Up</button>
        <button class="subtle" type="button" data-action="down">Move Down</button>
        <button class="secondary" type="button" data-action="duplicate">Duplicate</button>
        <button class="danger" type="button" data-action="remove">Remove</button>
      </div>
    `;

    card.querySelectorAll("[data-item-field]").forEach((field) => {
      const key = field.dataset.itemField;
      field.value = item[key] == null ? "" : item[key];
      field.addEventListener("input", (event) => {
        const nextValue = field.type === "number" ? normalizeNumber(event.target.value) : event.target.value;
        state.items[index][key] = nextValue;
        card.querySelector('[data-role="amount"]').value = formatMoney(lineAmount(state.items[index]));
        renderPreviewOnly();
      });
    });

    card.querySelectorAll("[data-item-flag]").forEach((field) => {
      const key = field.dataset.itemFlag;
      field.checked = Boolean(item[key]);
      field.addEventListener("change", () => {
        state.items[index][key] = field.checked;
        renderPreviewOnly();
      });
    });

    card.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "up" && index > 0) {
          const swap = state.items[index - 1];
          state.items[index - 1] = state.items[index];
          state.items[index] = swap;
        }
        if (action === "down" && index < state.items.length - 1) {
          const swap = state.items[index + 1];
          state.items[index + 1] = state.items[index];
          state.items[index] = swap;
        }
        if (action === "duplicate") {
          state.items.splice(
            index + 1,
            0,
            createItem({
              description: item.description,
              details: item.details,
              qty: item.qty,
              unit: item.unit,
              unitPrice: item.unitPrice,
              showEstimate: item.showEstimate,
              showShopping: item.showShopping
            })
          );
        }
        if (action === "remove") {
          if (state.items.length === 1) {
            state.items = [createItem()];
          } else {
            state.items.splice(index, 1);
          }
        }
        renderAll();
      });
    });

    list.appendChild(card);
  });
}

function renderLineItemsPreview() {
  const body = document.getElementById("preview-line-items");
  body.innerHTML = "";

  const activeItems = getVisibleItems("estimate");

  if (!activeItems.length) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    row.innerHTML = '<td colspan="5">Add customer-facing line items on the left to build this estimate.</td>';
    body.appendChild(row);
    return;
  }

  activeItems.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <div class="line-description"></div>
        <div class="line-details"></div>
      </td>
      <td class="numeric"></td>
      <td class="numeric"></td>
      <td class="numeric"></td>
      <td class="numeric"></td>
    `;

    row.children[0].querySelector(".line-description").textContent = item.description || "Untitled line item";
    const details = row.children[0].querySelector(".line-details");
    if (item.details) {
      details.textContent = item.details;
    } else {
      details.remove();
    }

    row.children[1].textContent = normalizeNumber(item.qty).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    row.children[2].textContent = item.unit || "-";
    row.children[3].textContent = formatMoney(item.unitPrice);
    row.children[4].textContent = formatMoney(lineAmount(item));
    body.appendChild(row);
  });
}

function renderShoppingListPreview() {
  const body = document.getElementById("shopping-line-items");
  body.innerHTML = "";

  const activeItems = getVisibleItems("shopping");

  if (!activeItems.length) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    row.innerHTML = '<td colspan="6">Mark line items for the shopping list on the left to generate it here.</td>';
    body.appendChild(row);
    return;
  }

  activeItems.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="check-col"><span class="check-box"></span></td>
      <td>
        <div class="line-description"></div>
        <div class="line-details"></div>
      </td>
      <td class="numeric"></td>
      <td class="numeric"></td>
      <td class="numeric"></td>
      <td class="numeric"></td>
    `;

    row.children[1].querySelector(".line-description").textContent = item.description || "Untitled line item";
    const details = row.children[1].querySelector(".line-details");
    if (item.details) {
      details.textContent = item.details;
    } else {
      details.remove();
    }

    row.children[2].textContent = normalizeNumber(item.qty).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
    row.children[3].textContent = item.unit || "-";
    row.children[4].textContent = formatMoney(item.unitPrice);
    row.children[5].textContent = formatMoney(lineAmount(item));
    body.appendChild(row);
  });
}

function renderPreview() {
  const estimateItems = getVisibleItems("estimate");
  const shoppingItems = getVisibleItems("shopping");
  const totals = calculateTotals(estimateItems);
  const shoppingTotal = shoppingItems.reduce((sum, item) => sum + lineAmount(item), 0);

  document.getElementById("preview-document-title").textContent = state.documentTitle || "Estimate";
  document.getElementById("preview-project-title").textContent = state.meta.projectTitle || "Project Title";
  document.getElementById("preview-project-location").textContent = state.meta.projectLocation || "Project location";
  document.getElementById("preview-estimate-number").textContent = state.meta.estimateNumber || "-";
  document.getElementById("preview-estimate-date").textContent = state.meta.estimateDate || "-";

  renderContactBlock(document.getElementById("preview-seller-card"), state.seller, "Your details");
  renderContactBlock(document.getElementById("preview-customer-card"), state.customer, "Customer details");

  renderLineItemsPreview();
  renderShoppingListPreview();

  document.getElementById("shopping-project-title").textContent = state.meta.projectTitle || "Project Title";
  document.getElementById("shopping-project-location").textContent = state.meta.projectLocation || "Project location";
  document.getElementById("shopping-estimate-number").textContent = state.meta.estimateNumber || "-";
  document.getElementById("shopping-customer-name").textContent = state.customer.name || "-";
  document.getElementById("shopping-generated-date").textContent = state.meta.estimateDate || "-";
  renderContactBlock(document.getElementById("shopping-seller-block"), state.seller, "Add your contact info on the left.");
  document.getElementById("shopping-notes").textContent = state.notes || "No notes entered.";
  document.getElementById("shopping-item-count").textContent = String(shoppingItems.length);
  document.getElementById("shopping-total").textContent = formatMoney(shoppingTotal);

  document.getElementById("preview-notes").textContent = state.notes || "No notes entered.";
  document.getElementById("preview-terms").textContent = state.terms || "No terms entered.";
  document.getElementById("preview-subtotal").textContent = formatMoney(totals.subtotal);
  document.getElementById("preview-discount").textContent = formatMoney(totals.discount);
  document.getElementById("preview-tax").textContent = formatMoney(totals.tax);
  document.getElementById("preview-deposit").textContent = formatMoney(totals.deposit);
  document.getElementById("preview-total").textContent = formatMoney(totals.total);
  document.getElementById("preview-balance").textContent = formatMoney(totals.balance);

  [
    ["discount-label", "preview-discount", totals.discount > 0],
    ["tax-label", "preview-tax", totals.tax > 0],
    ["deposit-label", "preview-deposit", totals.deposit > 0],
    ["balance-label", "preview-balance", totals.deposit > 0]
  ].forEach(([labelId, valueId, visible]) => {
    document.getElementById(labelId).style.display = visible ? "" : "none";
    document.getElementById(valueId).style.display = visible ? "" : "none";
  });
}

function setViewMode(mode) {
  currentView = mode === "shopping" ? "shopping" : "estimate";
  const estimateSheet = document.getElementById("estimate-sheet");
  const shoppingSheet = document.getElementById("shopping-sheet");
  const estimateButton = document.getElementById("show-estimate-button");
  const shoppingButton = document.getElementById("show-shopping-button");

  estimateSheet.classList.toggle("hidden-sheet", currentView !== "estimate");
  shoppingSheet.classList.toggle("hidden-sheet", currentView !== "shopping");
  estimateButton.classList.toggle("is-active", currentView === "estimate");
  shoppingButton.classList.toggle("is-active", currentView === "shopping");
}

function renderPreviewOnly() {
  renderPreview();
  saveState();
}

function renderAll() {
  assignFormValues();
  renderLineItemEditors();
  renderPreview();
  setViewMode(currentView);
  saveState();
}

document.querySelectorAll("[data-path]").forEach((field) => {
  field.addEventListener("input", (event) => {
    const value = field.dataset.number === "true" ? normalizeNumber(event.target.value) : event.target.value;
    setPath(state, field.dataset.path, value);
    renderPreviewOnly();
  });
});

document.getElementById("add-item-button").addEventListener("click", () => {
  state.items.push(createItem());
  renderAll();
});

document.getElementById("show-estimate-button").addEventListener("click", () => {
  setViewMode("estimate");
});

document.getElementById("show-shopping-button").addEventListener("click", () => {
  setViewMode("shopping");
});

function runPrint() {
  window.print();
}

document.getElementById("print-button").addEventListener("click", runPrint);
document.getElementById("print-button-top").addEventListener("click", runPrint);
document.getElementById("save-estimate-button").addEventListener("click", () => {
  const updatedExisting = upsertSavedEstimate(currentEstimateId);
  storeWorkingDraft();
  renderSavedEstimates();
  updateSaveStatus(updatedExisting ? "Saved draft updated" : "Draft saved", true);
});

document.getElementById("export-button").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeNumber = (state.meta.estimateNumber || "estimate").replace(/[^a-z0-9_-]+/gi, "-");
  link.href = url;
  link.download = safeNumber + ".json";
  link.click();
  URL.revokeObjectURL(url);
  updateSaveStatus("Editable draft exported", true);
});

document.getElementById("import-input").addEventListener("change", async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    localStorage.setItem(STORAGE_KEY, text);
    setCurrentEstimateId("");
    state = loadState();
    renderAll();
    updateSaveStatus("Editable draft imported", true);
  } catch (error) {
    updateSaveStatus("Import failed", false);
  } finally {
    event.target.value = "";
  }
});

document.getElementById("new-button").addEventListener("click", () => {
  const keepInfo = window.confirm("Create a new estimate and keep your contact info?");
  if (!keepInfo && !window.confirm("Create a completely blank estimate?")) {
    return;
  }

  const seller = deepCopy(state.seller);
  const replacement = createDefaultState();
  setCurrentEstimateId("");
  state = keepInfo ? { ...replacement, seller } : replacement;
  renderAll();
  updateSaveStatus("New estimate ready", true);
});

renderAll();
