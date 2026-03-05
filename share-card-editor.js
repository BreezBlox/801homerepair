(() => {
  "use strict";

  const STORAGE_KEY = "share_card_editor_template_v2";
  const LEGACY_KEY = "share_card_editor_v1";
  const c = document.getElementById("c");
  const g = c.getContext("2d");
  const $ = (id) => document.getElementById(id);

  const ui = {
    photoUpload: $("photoUpload"),
    useMeBtn: $("useMeBtn"),
    resetPhotoBtn: $("resetPhotoBtn"),
    kickerIn: $("kickerIn"),
    title1In: $("title1In"),
    title2In: $("title2In"),
    brandIn: $("brandIn"),
    tagIn: $("tagIn"),
    servicesTitleIn: $("servicesTitleIn"),
    servicesLinesIn: $("servicesLinesIn"),
    ctaIn: $("ctaIn"),
    phoneIn: $("phoneIn"),
    svcFontIn: $("svcFontIn"),
    svcLineIn: $("svcLineIn"),
    svcCheckIn: $("svcCheckIn"),
    svcGapIn: $("svcGapIn"),
    panelCutIn: $("panelCutIn"),
    ctaFontIn: $("ctaFontIn"),
    blueIn: $("blueIn"),
    darkIn: $("darkIn"),
    svcTextColorIn: $("svcTextColorIn"),
    titleBlueIn: $("titleBlueIn"),
    elSel: $("elSel"),
    xIn: $("xIn"),
    yIn: $("yIn"),
    scaleIn: $("scaleIn"),
    wIn: $("wIn"),
    hIn: $("hIn"),
    scaleWrap: $("scaleWrap"),
    wWrap: $("wWrap"),
    hWrap: $("hWrap"),
    qIn: $("qIn"),
    kbIn: $("kbIn"),
    saveBtn: $("saveBtn"),
    resetBtn: $("resetBtn"),
    backupBtn: $("backupBtn"),
    restoreBtn: $("restoreBtn"),
    status: $("status")
  };

  const ELEMENT_META = {
    headerBand: { label: "Header Band", kind: "rect" },
    topText: { label: "Top Text", kind: "scale" },
    servicesPanel: { label: "Blue Panel", kind: "rect" },
    servicesBlock: { label: "Services Text Block", kind: "scale" },
    photo: { label: "Photo Block", kind: "rect" },
    ctaButton: { label: "CTA Button", kind: "rect" },
    phoneLine: { label: "Phone Line", kind: "scale" },
    decor: { label: "Decor Group", kind: "scale" }
  };

  const DEFAULT = {
    t: {
      kicker: "NEED SOMETHING FIXED?",
      title1: "HANDYMAN",
      title2: "SERVICES",
      brand: "801 HOME REPAIR",
      tag: "HOME REPAIR AND TURNOVER FIXES",
      servicesTitle: "OUR SERVICES",
      services: [
        "Vinyl Plank",
        "Door Installs",
        "Deck/Stair Repairs",
        "Drywall Touchups",
        "Painting",
        "Custom Organization"
      ],
      cta: "CALL OR TEXT",
      phone: "(385) 439-9031"
    },
    style: {
      serviceFont: 43,
      serviceLine: 62,
      serviceCheck: 14,
      serviceGap: 34,
      panelCut: 194,
      ctaFont: 22,
      blueColor: "#1897d2",
      darkColor: "#2d3139",
      serviceTextColor: "#d7efff",
      titleBlueColor: "#0aa0e7"
    },
    e: {
      headerBand: { x: 18, y: 18, w: 824, h: 522 },
      topText: { x: 84, y: 82, s: 1 },
      servicesPanel: { x: 18, y: 470, w: 520, h: 592 },
      servicesBlock: { x: 86, y: 540, s: 1 },
      photo: { x: 336, y: 530, w: 506, h: 532 },
      ctaButton: { x: 84, y: 920, w: 202, h: 58 },
      phoneLine: { x: 84, y: 995, s: 1 },
      decor: { x: 0, y: 0, s: 1 }
    }
  };

  let state = loadState();
  let selected = "servicesBlock";
  let photoImg = null;
  let bounds = {};
  let drag = null;

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function deepMerge(base, incoming) {
    Object.keys(incoming || {}).forEach((key) => {
      const val = incoming[key];
      if (val && typeof val === "object" && !Array.isArray(val) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
        deepMerge(base[key], val);
      } else {
        base[key] = val;
      }
    });
    return base;
  }

  function parseLines(value, fallback) {
    const lines = String(value || "")
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.length ? lines : fallback.slice();
  }

  function loadLegacyToTemplate(raw) {
    try {
      const data = JSON.parse(raw);
      if (!data || !data.t || !data.e) {
        return null;
      }
      const out = clone(DEFAULT);
      if (Array.isArray(data.t.jobs)) out.t.services = data.t.jobs.slice(0, 9);
      if (data.t.ph) out.t.phone = String(data.t.ph).trim();
      if (data.t.name) out.t.brand = String(data.t.name).toUpperCase();
      if (data.e.photo) {
        out.e.photo.x = Number(data.e.photo.x) || out.e.photo.x;
        out.e.photo.y = Number(data.e.photo.y) || out.e.photo.y;
        const z = Number(data.e.photo.z);
        if (z > 0) {
          out.e.photo.w = z;
          out.e.photo.h = Math.round(z * 1.58);
        }
      }
      if (data.e.phone) {
        out.e.ctaButton.x = Number(data.e.phone.x) || out.e.ctaButton.x;
        out.e.ctaButton.y = Number(data.e.phone.y) || out.e.ctaButton.y;
      }
      if (data.e.why) {
        out.e.servicesBlock.x = Number(data.e.why.x) || out.e.servicesBlock.x;
        out.e.servicesBlock.y = Number(data.e.why.y) || out.e.servicesBlock.y;
      }
      return out;
    } catch {
      return null;
    }
  }

  function loadState() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const out = clone(DEFAULT);
        deepMerge(out, parsed);
        return out;
      } catch {
      }
    }
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = loadLegacyToTemplate(legacy);
      if (migrated) return migrated;
    }
    return clone(DEFAULT);
  }

  function saveState() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function setStatus(text) {
    ui.status.textContent = text;
  }

  function font(size, bold) {
    const safe = Math.max(8, Number(size) || 8);
    return (bold ? "700 " : "500 ") + safe.toFixed(2) + "px 'Segoe UI','Trebuchet MS',Tahoma,sans-serif";
  }

  function rrPath(x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    g.beginPath();
    g.moveTo(x + radius, y);
    g.lineTo(x + w - radius, y);
    g.quadraticCurveTo(x + w, y, x + w, y + radius);
    g.lineTo(x + w, y + h - radius);
    g.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    g.lineTo(x + radius, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - radius);
    g.lineTo(x, y + radius);
    g.quadraticCurveTo(x, y, x + radius, y);
    g.closePath();
  }

  function drawPolygon(points, fill, stroke, width) {
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0], points[i][1]);
    g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.lineWidth = width || 1;
      g.strokeStyle = stroke;
      g.stroke();
    }
  }

  function drawHex(cx, cy, radius, color, width) {
    const pts = [];
    for (let i = 0; i < 6; i += 1) {
      const rad = ((i * 60) - 30) * Math.PI / 180;
      pts.push([cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius]);
    }
    drawPolygon(pts, null, color, width || 2);
  }

  function drawCheck(x, y, size, color) {
    g.strokeStyle = color;
    g.lineWidth = Math.max(2, size * 0.24);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + size * 0.34, y + size * 0.36);
    g.lineTo(x + size, y - size * 0.48);
    g.stroke();
  }

  function drawImageCover(img, dx, dy, dw, dh, focusX, focusY) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const tr = dw / dh;
    const sr = iw / ih;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (sr > tr) {
      sw = Math.round(ih * tr);
      sx = Math.round((iw - sw) * (focusX == null ? 0.5 : focusX));
      sx = Math.max(0, Math.min(iw - sw, sx));
    } else {
      sh = Math.round(iw / tr);
      sy = Math.round((ih - sh) * (focusY == null ? 0.35 : focusY));
      sy = Math.max(0, Math.min(ih - sh, sy));
    }
    g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  function clampElement(key) {
    const e = state.e[key];
    if (!e) return;
    if ("s" in e) e.s = Math.max(0.4, Math.min(2.8, Number(e.s) || 1));
    if ("w" in e) e.w = Math.max(40, Math.min(1200, Number(e.w) || 40));
    if ("h" in e) e.h = Math.max(40, Math.min(1200, Number(e.h) || 40));
    e.x = Number(e.x) || 0;
    e.y = Number(e.y) || 0;

    if (key === "headerBand") {
      e.w = Math.max(500, Math.min(824, e.w));
      e.h = Math.max(220, Math.min(680, e.h));
      e.x = Math.max(18, Math.min(36, e.x));
      e.y = Math.max(18, Math.min(220, e.y));
    }
    if (key === "servicesPanel") {
      e.w = Math.max(220, Math.min(760, e.w));
      e.h = Math.max(240, Math.min(780, e.h));
    }
    if (key === "photo") {
      e.w = Math.max(180, Math.min(760, e.w));
      e.h = Math.max(180, Math.min(760, e.h));
    }
    if (key === "ctaButton") {
      e.w = Math.max(100, Math.min(420, e.w));
      e.h = Math.max(38, Math.min(130, e.h));
    }

    const st = state.style;
    st.serviceFont = Math.max(16, Math.min(72, Number(st.serviceFont) || 30));
    st.serviceLine = Math.max(28, Math.min(140, Number(st.serviceLine) || 58));
    st.serviceCheck = Math.max(8, Math.min(40, Number(st.serviceCheck) || 14));
    st.serviceGap = Math.max(14, Math.min(90, Number(st.serviceGap) || 34));
    st.panelCut = Math.max(30, Math.min(360, Number(st.panelCut) || 194));
    st.ctaFont = Math.max(12, Math.min(40, Number(st.ctaFont) || 22));
  }

  function clampAll() {
    Object.keys(state.e).forEach(clampElement);
  }
  function draw() {
    const t = state.t;
    const e = state.e;
    const st = state.style;
    bounds = {};

    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "#eaf1ff";
    g.fillRect(0, 0, c.width, c.height);

    const cardX = 18, cardY = 18, cardW = 824, cardH = 1064;
    rrPath(cardX, cardY, cardW, cardH, 26);
    g.fillStyle = "#ffffff";
    g.fill();
    g.strokeStyle = "#c8d7ec";
    g.lineWidth = 2;
    g.stroke();

    const hb = e.headerBand;
    rrPath(hb.x, hb.y, hb.w, hb.h, 24);
    g.fillStyle = st.darkColor;
    g.fill();
    g.fillStyle = st.darkColor;
    g.fillRect(hb.x, hb.y + hb.h - 26, hb.w, 26);
    bounds.headerBand = { x: hb.x, y: hb.y, w: hb.w, h: hb.h };

    const sp = e.servicesPanel;
    const panelCut = Math.min(st.panelCut, sp.w - 40);
    const panelPoly = [
      [sp.x, sp.y],
      [sp.x + sp.w, sp.y],
      [sp.x + sp.w - panelCut, sp.y + sp.h],
      [sp.x, sp.y + sp.h]
    ];
    drawPolygon(panelPoly, st.blueColor);
    bounds.servicesPanel = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };

    const p = e.photo;
    const photoLeftBottom = Math.max(p.x - 180, Math.min(p.x + p.w - 16, sp.x + sp.w - panelCut + 10));
    const photoPoly = [
      [p.x, p.y],
      [p.x + p.w, p.y],
      [p.x + p.w, p.y + p.h],
      [photoLeftBottom, p.y + p.h]
    ];
    g.save();
    drawPolygon(photoPoly);
    g.clip();
    if (photoImg) {
      drawImageCover(photoImg, p.x, p.y, p.w, p.h, 0.5, 0.34);
    } else {
      g.fillStyle = "#d8e2f0";
      g.fillRect(p.x, p.y, p.w, p.h);
      g.fillStyle = "#40557b";
      g.font = font(22, true);
      g.fillText("Photo", p.x + 18, p.y + 36);
    }
    g.restore();
    bounds.photo = { x: p.x, y: p.y, w: p.w, h: p.h };

    const d = e.decor;
    const tx = (x) => d.x + x * d.s;
    const ty = (y) => d.y + y * d.s;
    drawPolygon([[tx(766), ty(340)], [tx(808), ty(340)], [tx(824), ty(374)], [tx(784), ty(412)], [tx(754), ty(372)]], "#f5f8fc");
    drawPolygon([[tx(818), ty(264)], [tx(872), ty(264)], [tx(847), ty(314)]], st.blueColor);
    drawHex(tx(757), ty(100), 36 * d.s, "#07a0e8", Math.max(1, 3 * d.s));
    drawHex(tx(546), ty(506), 34 * d.s, "#0ba9eb", Math.max(1, 3 * d.s));
    drawHex(tx(588), ty(566), 25 * d.s, "#0e9bdc", Math.max(1, 2 * d.s));
    drawHex(tx(504), ty(588), 18 * d.s, "#142d3e", Math.max(1, 2 * d.s));
    bounds.decor = { x: tx(480), y: ty(64), w: 372 * d.s, h: 560 * d.s };

    const tt = e.topText;
    const ts = tt.s;
    const topLines = [
      { text: t.kicker, size: 44 * ts, bold: true, color: "#edf2f7", yOff: 0 },
      { text: t.title1, size: 82 * ts, bold: true, color: st.titleBlueColor, yOff: 66 * ts },
      { text: t.title2, size: 82 * ts, bold: true, color: st.titleBlueColor, yOff: 148 * ts },
      { text: t.brand, size: 24 * ts, bold: true, color: "#eef3fa", yOff: 238 * ts },
      { text: t.tag, size: 24 * ts, bold: false, color: "#d2dbe8", yOff: 272 * ts }
    ];
    let maxTopW = 0;
    let topBottom = tt.y;
    topLines.forEach((ln) => {
      if (!String(ln.text || "").trim()) return;
      g.font = font(ln.size, ln.bold);
      g.fillStyle = ln.color;
      g.fillText(ln.text, tt.x, tt.y + ln.yOff + ln.size);
      maxTopW = Math.max(maxTopW, g.measureText(ln.text).width);
      topBottom = Math.max(topBottom, tt.y + ln.yOff + ln.size);
    });
    bounds.topText = { x: tt.x, y: tt.y, w: Math.max(10, maxTopW + 2), h: Math.max(10, topBottom - tt.y + 8) };

    const sb = e.servicesBlock;
    const ss = sb.s;
    const titleSize = 28 * ss;
    g.font = font(titleSize, true);
    g.fillStyle = "#ffffff";
    g.fillText(t.servicesTitle, sb.x, sb.y + titleSize);

    const listFontSize = st.serviceFont * ss;
    const lineStep = st.serviceLine * ss;
    const checkSize = st.serviceCheck * ss;
    const checkGap = st.serviceGap * ss;
    const listX = sb.x + checkGap;
    let lineY = sb.y + titleSize + 20 * ss;
    let maxServiceW = g.measureText(t.servicesTitle).width;

    t.services.forEach((item) => {
      drawCheck(sb.x, lineY + listFontSize * 0.52, checkSize, "#0f344f");
      g.fillStyle = st.serviceTextColor;
      g.font = font(listFontSize, false);
      g.fillText(item, listX, lineY + listFontSize);
      maxServiceW = Math.max(maxServiceW, (listX - sb.x) + g.measureText(item).width);
      lineY += lineStep;
    });
    bounds.servicesBlock = { x: sb.x - 4, y: sb.y - 4, w: Math.max(40, maxServiceW + 8), h: Math.max(40, (lineY - sb.y) + 2) };

    const cb = e.ctaButton;
    rrPath(cb.x, cb.y, cb.w, cb.h, cb.h / 2);
    g.fillStyle = "#2c3544";
    g.fill();
    const ctaSize = st.ctaFont;
    g.font = font(ctaSize, true);
    g.fillStyle = "#ffffff";
    const ctaWidth = g.measureText(t.cta).width;
    g.fillText(t.cta, cb.x + (cb.w - ctaWidth) / 2, cb.y + (cb.h + ctaSize * 0.68) / 2 - 2);
    bounds.ctaButton = { x: cb.x, y: cb.y, w: cb.w, h: cb.h };

    const ph = e.phoneLine;
    const phSize = 42 * ph.s;
    g.font = font(phSize, false);
    g.fillStyle = st.serviceTextColor;
    g.fillText(t.phone, ph.x, ph.y + phSize);
    bounds.phoneLine = { x: ph.x, y: ph.y, w: g.measureText(t.phone).width + 4, h: phSize + 6 };

    drawSelection();
  }

  function drawSelection() {
    const q = bounds[selected];
    if (!q) return;
    g.save();
    g.setLineDash([8, 6]);
    g.lineWidth = 2;
    g.strokeStyle = "#0f766e";
    g.strokeRect(q.x - 6, q.y - 6, q.w + 12, q.h + 12);
    g.setLineDash([]);
    const hs = 12;
    const hx = q.x + q.w + 2;
    const hy = q.y + q.h + 2;
    g.fillStyle = "#0f766e";
    g.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    g.restore();
  }

  function point(ev) {
    const rect = c.getBoundingClientRect();
    return { x: (ev.clientX - rect.left) * (c.width / rect.width), y: (ev.clientY - rect.top) * (c.height / rect.height) };
  }

  function hitTest(x, y) {
    const order = ["ctaButton", "phoneLine", "servicesBlock", "photo", "servicesPanel", "topText", "headerBand", "decor"];
    for (let i = 0; i < order.length; i += 1) {
      const key = order[i];
      const q = bounds[key];
      if (!q) continue;
      if (x >= q.x - 8 && x <= q.x + q.w + 8 && y >= q.y - 8 && y <= q.y + q.h + 8) return key;
    }
    return null;
  }

  function isOnHandle(x, y) {
    const q = bounds[selected];
    if (!q) return false;
    const hx = q.x + q.w + 2;
    const hy = q.y + q.h + 2;
    return Math.abs(x - hx) <= 10 && Math.abs(y - hy) <= 10;
  }

  function syncTextInputs() {
    ui.kickerIn.value = state.t.kicker;
    ui.title1In.value = state.t.title1;
    ui.title2In.value = state.t.title2;
    ui.brandIn.value = state.t.brand;
    ui.tagIn.value = state.t.tag;
    ui.servicesTitleIn.value = state.t.servicesTitle;
    ui.servicesLinesIn.value = state.t.services.join("\n");
    ui.ctaIn.value = state.t.cta;
    ui.phoneIn.value = state.t.phone;
  }

  function syncStyleInputs() {
    ui.svcFontIn.value = Math.round(state.style.serviceFont);
    ui.svcLineIn.value = Math.round(state.style.serviceLine);
    ui.svcCheckIn.value = Math.round(state.style.serviceCheck);
    ui.svcGapIn.value = Math.round(state.style.serviceGap);
    ui.panelCutIn.value = Math.round(state.style.panelCut);
    ui.ctaFontIn.value = Math.round(state.style.ctaFont);
    ui.blueIn.value = state.style.blueColor;
    ui.darkIn.value = state.style.darkColor;
    ui.svcTextColorIn.value = state.style.serviceTextColor;
    ui.titleBlueIn.value = state.style.titleBlueColor;
  }

  function syncSelectedInputs() {
    const e = state.e[selected];
    ui.elSel.value = selected;
    ui.xIn.value = Math.round(e.x);
    ui.yIn.value = Math.round(e.y);

    if ("s" in e) {
      ui.scaleWrap.style.display = "grid";
      ui.scaleIn.value = Number(e.s).toFixed(2);
    } else {
      ui.scaleWrap.style.display = "none";
    }

    if ("w" in e) {
      ui.wWrap.style.display = "grid";
      ui.wIn.value = Math.round(e.w);
    } else {
      ui.wWrap.style.display = "none";
    }

    if ("h" in e) {
      ui.hWrap.style.display = "grid";
      ui.hIn.value = Math.round(e.h);
    } else {
      ui.hWrap.style.display = "none";
    }
  }

  function refresh(statusText) {
    clampAll();
    saveState();
    syncSelectedInputs();
    draw();
    if (statusText) setStatus(statusText);
  }

  function loadPhoto(src, statusText) {
    const image = new Image();
    image.onload = () => {
      photoImg = image;
      draw();
      setStatus(statusText || "Photo loaded.");
    };
    image.onerror = () => setStatus("Could not load image.");
    image.src = src;
  }

  function toBlob(quality) {
    return new Promise((resolve, reject) => {
      try {
        c.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas export returned null."));
        }, "image/jpeg", quality);
      } catch (error) {
        reject(error);
      }
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportJpg() {
    const target = Math.max(40, Number(ui.kbIn.value) || 120) * 1024;
    const min = 0.45;
    let q = Math.min(0.95, Math.max(min, Number(ui.qIn.value) || 0.72));

    try {
      let blob = await toBlob(q);
      while (blob.size > target && q > min + 0.001) {
        q = Number((q - 0.03).toFixed(2));
        blob = await toBlob(q);
      }
      downloadBlob(blob, "card-share-light.jpg");
      setStatus("Downloaded card-share-light.jpg (" + Math.round(blob.size / 1024) + " KB, q=" + q.toFixed(2) + ")");
    } catch {
      try {
        const dataUrl = c.toDataURL("image/jpeg", q);
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "card-share-light.jpg";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setStatus("Export used fallback data URL.");
      } catch {
        setStatus("Export blocked. Use backup JSON and localhost.");
      }
    }
  }
  function bindInputs() {
    ui.kickerIn.oninput = () => { state.t.kicker = ui.kickerIn.value; refresh(); };
    ui.title1In.oninput = () => { state.t.title1 = ui.title1In.value; refresh(); };
    ui.title2In.oninput = () => { state.t.title2 = ui.title2In.value; refresh(); };
    ui.brandIn.oninput = () => { state.t.brand = ui.brandIn.value; refresh(); };
    ui.tagIn.oninput = () => { state.t.tag = ui.tagIn.value; refresh(); };
    ui.servicesTitleIn.oninput = () => { state.t.servicesTitle = ui.servicesTitleIn.value; refresh(); };
    ui.servicesLinesIn.oninput = () => { state.t.services = parseLines(ui.servicesLinesIn.value, DEFAULT.t.services); refresh(); };
    ui.ctaIn.oninput = () => { state.t.cta = ui.ctaIn.value; refresh(); };
    ui.phoneIn.oninput = () => { state.t.phone = ui.phoneIn.value; refresh(); };

    ui.svcFontIn.oninput = () => { state.style.serviceFont = Number(ui.svcFontIn.value) || state.style.serviceFont; refresh(); };
    ui.svcLineIn.oninput = () => { state.style.serviceLine = Number(ui.svcLineIn.value) || state.style.serviceLine; refresh(); };
    ui.svcCheckIn.oninput = () => { state.style.serviceCheck = Number(ui.svcCheckIn.value) || state.style.serviceCheck; refresh(); };
    ui.svcGapIn.oninput = () => { state.style.serviceGap = Number(ui.svcGapIn.value) || state.style.serviceGap; refresh(); };
    ui.panelCutIn.oninput = () => { state.style.panelCut = Number(ui.panelCutIn.value) || state.style.panelCut; refresh(); };
    ui.ctaFontIn.oninput = () => { state.style.ctaFont = Number(ui.ctaFontIn.value) || state.style.ctaFont; refresh(); };
    ui.blueIn.oninput = () => { state.style.blueColor = ui.blueIn.value; refresh(); };
    ui.darkIn.oninput = () => { state.style.darkColor = ui.darkIn.value; refresh(); };
    ui.svcTextColorIn.oninput = () => { state.style.serviceTextColor = ui.svcTextColorIn.value; refresh(); };
    ui.titleBlueIn.oninput = () => { state.style.titleBlueColor = ui.titleBlueIn.value; refresh(); };

    ui.elSel.onchange = () => {
      selected = ui.elSel.value;
      syncSelectedInputs();
      draw();
    };

    ui.xIn.oninput = () => { state.e[selected].x = Number(ui.xIn.value) || 0; refresh(); };
    ui.yIn.oninput = () => { state.e[selected].y = Number(ui.yIn.value) || 0; refresh(); };
    ui.scaleIn.oninput = () => {
      const e = state.e[selected];
      if ("s" in e) {
        e.s = Number(ui.scaleIn.value) || 1;
        refresh();
      }
    };
    ui.wIn.oninput = () => {
      const e = state.e[selected];
      if ("w" in e) {
        e.w = Number(ui.wIn.value) || e.w;
        refresh();
      }
    };
    ui.hIn.oninput = () => {
      const e = state.e[selected];
      if ("h" in e) {
        e.h = Number(ui.hIn.value) || e.h;
        refresh();
      }
    };

    ui.useMeBtn.onclick = () => loadPhoto("Me.png?ts=" + Date.now(), "Loaded Me.png");
    ui.resetPhotoBtn.onclick = () => {
      state.e.photo = clone(DEFAULT.e.photo);
      selected = "photo";
      refresh("Photo reset.");
    };

    ui.photoUpload.onchange = () => {
      const file = ui.photoUpload.files && ui.photoUpload.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") loadPhoto(reader.result, "Photo uploaded.");
      };
      reader.readAsDataURL(file);
    };

    ui.saveBtn.onclick = exportJpg;

    ui.resetBtn.onclick = () => {
      state = clone(DEFAULT);
      selected = "servicesBlock";
      syncTextInputs();
      syncStyleInputs();
      refresh("Layout reset.");
    };

    ui.backupBtn.onclick = async () => {
      const payload = JSON.stringify(state);
      try {
        await navigator.clipboard.writeText(payload);
        setStatus("Layout JSON copied.");
      } catch {
        window.prompt("Copy this layout JSON:", payload);
        setStatus("Backup opened in prompt.");
      }
    };

    ui.restoreBtn.onclick = () => {
      const raw = window.prompt("Paste layout JSON:");
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        const merged = clone(DEFAULT);
        deepMerge(merged, parsed);
        state = merged;
        selected = "servicesBlock";
        syncTextInputs();
        syncStyleInputs();
        refresh("Layout restored.");
      } catch {
        setStatus("Invalid JSON.");
      }
    };

    c.addEventListener("pointerdown", (ev) => {
      const p = point(ev);
      const hit = hitTest(p.x, p.y);
      if (!hit) return;
      selected = hit;
      syncSelectedInputs();
      draw();

      const e = state.e[selected];
      if (isOnHandle(p.x, p.y)) {
        drag = { mode: "resize", key: selected, sx: p.x, sy: p.y, startW: e.w || 0, startH: e.h || 0, startS: e.s || 1 };
      } else {
        drag = { mode: "move", key: selected, ox: p.x - e.x, oy: p.y - e.y };
      }
      c.setPointerCapture(ev.pointerId);
    });

    c.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const p = point(ev);
      const e = state.e[drag.key];
      if (!e) return;

      if (drag.mode === "move") {
        e.x = p.x - drag.ox;
        e.y = p.y - drag.oy;
      } else if ("w" in e && "h" in e) {
        e.w = drag.startW + (p.x - drag.sx);
        e.h = drag.startH + (p.y - drag.sy);
      } else if ("s" in e) {
        e.s = drag.startS + (p.x - drag.sx) / 220;
      }

      selected = drag.key;
      refresh();
    });

    c.addEventListener("pointerup", (ev) => {
      if (drag) setStatus("Moved " + ELEMENT_META[drag.key].label + ".");
      drag = null;
      try { c.releasePointerCapture(ev.pointerId); } catch { }
    });

    c.addEventListener("pointerleave", () => { drag = null; });

    document.addEventListener("keydown", (ev) => {
      const a = document.activeElement;
      const typing = a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT");
      if (typing) return;
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.key)) return;
      ev.preventDefault();
      const d = ev.shiftKey ? 10 : 1;
      const e = state.e[selected];
      if (!e) return;
      if (ev.key === "ArrowUp") e.y -= d;
      if (ev.key === "ArrowDown") e.y += d;
      if (ev.key === "ArrowLeft") e.x -= d;
      if (ev.key === "ArrowRight") e.x += d;
      refresh();
    });
  }

  function init() {
    clampAll();
    bindInputs();
    syncTextInputs();
    syncStyleInputs();
    syncSelectedInputs();
    draw();
    loadPhoto("Me.png?ts=" + Date.now(), "Loaded Me.png");
    setStatus("Ready");
  }

  init();
})();
