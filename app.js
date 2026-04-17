// =============================================================================
// STATE
// =============================================================================
const state = {
  keys: KEYS_RAW.map(([id, x, y]) => ({
    id,
    x,           // mm — Fusion X (negative = left half)
    y,           // mm — Fusion Z (increases toward user)
    label:      '',
    labelLeft:  '',
    labelRight: '',
    labelBoth:  '',
    scale:   null, // null = use global
    offsetX: null,
    offsetY: null,
  })),
  fontFamily:      'Roboto',
  fontCase:        'upper',
  scale:           0.60,   // global fraction of ENGRAVABLE height
  offsetX:         0.00,   // global fraction of ENGRAVABLE/2 → mm shift right
  offsetY:         0.00,   // global fraction of ENGRAVABLE/2 → mm shift down
  syncScaleOffset: true,   // when true, all keys use global scale/offset
  qwertyMode:      false,  // when true, keys 0-29 show QWERTY labels
  fourZoneMode:    true,   // when true, 4 zones per key, else simple mode
  zoom:            0.5,    // keyboard display zoom (visually multiplied by 4)
  selectedId:      null,
  otFont:          null,   // opentype.js Font object (null = no path generation)
  fontBuffer:      null,   // raw font bytes — embedded in SVG when paths unavailable
  uvOffX:          0.00,   // mm
  uvOffY:          9.00,   // mm (default shift to align with master UV)
  uvScale:         19.624, // px/mm
};

// =============================================================================
// HELPERS
// =============================================================================

// Zone Configuration
const ZONES_4 = [
  { id: 'main',  prop: 'label',      scale: 0.35, ox:  0.00, oy: -0.40 },
  { id: 'left',  prop: 'labelLeft',  scale: 0.20, ox: -0.65, oy:  0.10 },
  { id: 'right', prop: 'labelRight', scale: 0.20, ox:  0.65, oy:  0.10 },
  { id: 'both',  prop: 'labelBoth',  scale: 0.20, ox:  0.00, oy:  0.55 },
];
const ZONES_SIMPLE = [
  { id: 'main',  prop: 'label',      scale: 1.0,  ox:  0.00, oy:  0.00 },
];
const getActiveZones = () => state.fourZoneMode ? ZONES_4 : ZONES_SIMPLE;

function applyCase(text) {
  if (state.fontCase === 'upper') return text.toUpperCase();
  if (state.fontCase === 'lower') return text.toLowerCase();
  return text;
}

function gridCenter(pos) {
  const col = pos % GRID_COLS;
  const row = Math.floor(pos / GRID_COLS);
  return {
    x: (col - (GRID_COLS - 1) / 2) * GRID_PITCH,
    y: (row - (GRID_ROWS - 1) / 2) * GRID_PITCH,
  };
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Per-key scale/offset — fall back to global when sync is on or key has no override
function keyScale(key)   { return (!state.syncScaleOffset && key.scale   !== null) ? key.scale   : state.scale;   }
function keyOffsetX(key) { return (!state.syncScaleOffset && key.offsetX !== null) ? key.offsetX : state.offsetX; }
function keyOffsetY(key) { return (!state.syncScaleOffset && key.offsetY !== null) ? key.offsetY : state.offsetY; }

// Resolve effective label, honouring QWERTY mode (thumb keys 30-35 are always blank in QWERTY mode)
function qwertyLabel(key) {
  if (state.qwertyMode && key.id < QWERTY_LABELS.length) return QWERTY_LABELS[key.id];
  return key.label;
}

// Detect font MIME type from magic bytes
function detectFontMime(buffer) {
  const b = new Uint8Array(buffer, 0, 4);
  const sig = String.fromCharCode(b[0], b[1], b[2], b[3]);
  if (sig === 'wOF2') return 'font/woff2';
  if (sig === 'wOFF') return 'font/woff';
  return 'font/ttf';
}

// Convert large ArrayBuffer to base64 in chunks (avoids call-stack limit)
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// =============================================================================
// FONT LOADING
// =============================================================================
async function loadFont(name) {
  const msg = document.getElementById('fontStatusMsg');
  msg.textContent = 'Loading…';
  msg.className = 'loading';

  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400&display=swap`;

  // CSS link so the UI renders the font
  let cssLink = document.getElementById('gfLink');
  if (!cssLink) {
    cssLink = document.createElement('link');
    cssLink.id = 'gfLink';
    cssLink.rel = 'stylesheet';
    document.head.appendChild(cssLink);
  }
  cssLink.href = cssUrl;

  state.fontFamily = name;
  state.otFont     = null;
  state.fontBuffer = null;

  // Name variants used by the different fetch strategies
  const idDash   = name.toLowerCase().replace(/\s+/g, '-');  // e.g. "jacquard-24"
  const idFlat   = name.toLowerCase().replace(/\s+/g, '');   // e.g. "jacquard24"
  const pascal   = name.split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join(''); // "Jacquard24"

  // Sources tried in order. Each returns an ArrayBuffer or throws.
  // We stop as soon as opentype.parse succeeds (paths available).
  // The first successfully-fetched buffer is kept for SVG font embedding as a fallback.
  const sources = [
    // 1. Google Webfonts Helper → TTF (opentype.js handles TTF natively, most reliable parse)
    async () => {
      const api = await fetch(`https://gwfh.mranftl.com/api/fonts/${idDash}?subsets=latin`);
      if (!api.ok) throw new Error();
      const d = await api.json();
      const v = (d.variants ?? []).find(v => v.id === 'regular' || v.id === '400') ?? d.variants?.[0];
      if (!v?.urls?.ttf) throw new Error();
      const r = await fetch(v.urls.ttf);
      if (!r.ok) throw new Error();
      return r.arrayBuffer();
    },
    // 2. Google Fonts GitHub repo → TTF (covers every font including recent additions like Jacquard 24)
    async () => {
      for (const lic of ['ofl', 'apache', 'ufl']) {
        const r = await fetch(
          `https://raw.githubusercontent.com/google/fonts/main/${lic}/${idFlat}/${pascal}-Regular.ttf`
        );
        if (r.ok) return r.arrayBuffer();
      }
      throw new Error();
    },
    // 3. Google Fonts CDN → woff2 (opentype.js may fail on some Brotli variants, but bytes
    //    are still kept for self-contained SVG embedding as a last resort)
    async () => {
      const cssRes = await fetch(cssUrl);
      if (!cssRes.ok) throw new Error();
      const css = await cssRes.text();
      const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
      if (!urls.length) throw new Error();
      const r = await fetch(urls[urls.length - 1]);
      if (!r.ok) throw new Error();
      return r.arrayBuffer();
    },
  ];

  for (const getBuffer of sources) {
    if (state.otFont) break;
    let buf;
    try { buf = await getBuffer(); } catch { continue; }
    if (!state.fontBuffer) state.fontBuffer = buf; // keep first successful fetch for embedding
    try { state.otFont = opentype.parse(buf); } catch { /* parse failed — try next source */ }
  }

  if (state.otFont) {
    msg.textContent = `\u2713 ${name} (paths)`;
    msg.className = 'ok';
  } else if (state.fontBuffer) {
    msg.textContent = `\u2713 ${name} (font embedded \u2014 use Inkscape \u2192 Object to Path for engravers)`;
    msg.className = 'ok';
  } else {
    msg.textContent = `${name} (offline \u2014 export uses font name only)`;
    msg.className = 'warn';
  }

  updateFontPreview();
  renderKeyboard();
  renderKeyEditor();
}

function updateFontPreview() {
  const el = document.getElementById('fontPreview');
  el.style.fontFamily = `"${state.fontFamily}", var(--body-font)`;
  el.textContent = applyCase('Aa');
}

// =============================================================================
// OPENTYPE PATH UTILS
// =============================================================================
// Returns {pathData, bb} for label centered at (cx, cy) in mm.
function labelToPath(label, fontSizeMm, cxMm, cyMm, totalOxMm, totalOyMm) {
  if (!label || !state.otFont) return null;
  const font = state.otFont;

  // Reject if any character maps to .notdef (glyph index 0 = not in font).
  for (const ch of label) {
    if (font.charToGlyph(ch).index === 0) return null;
  }

  const probe = font.getPath(label, 0, 0, fontSizeMm);
  const bb = probe.getBoundingBox();
  if (bb.x1 === bb.x2 || bb.y1 === bb.y2) return null;

  const tw = bb.x2 - bb.x1;

  // Horizontal: center by this character's own bounding box.
  const px = cxMm - bb.x1 - tw / 2 + totalOxMm;

  // Vertical: use a fixed reference glyph ('H') to establish a consistent baseline.
  const ref = font.getPath('H', 0, 0, fontSizeMm).getBoundingBox();
  const refCenterY = ref.y1 + (ref.y2 - ref.y1) / 2;
  const py = cyMm - refCenterY + totalOyMm;

  const finalPath = font.getPath(label, px, py, fontSizeMm);
  return { pathData: finalPath.toPathData(4), bb };
}

// =============================================================================
// KEYBOARD SVG RENDER
// =============================================================================
function renderKeyboard() {
  const svg = document.getElementById('kbSvg');

  // Compute bounding box from real mm coordinates
  const allX = state.keys.map(k => k.x);
  const allY = state.keys.map(k => k.y);
  const minX = Math.min(...allX);
  const minY = Math.min(...allY);
  const maxX = Math.max(...allX);
  const maxY = Math.max(...allY);

  const marginPx = 8;
  const W = (maxX - minX) * MM_TO_PX + KEY_DISP_PX + marginPx * 2;
  const H = (maxY - minY) * MM_TO_PX + KEY_DISP_PX + marginPx * 2;

  // viewBox stays at natural size; zoom is applied via width/height
  svg.setAttribute('width',   W * state.zoom * 4);
  svg.setAttribute('height',  H * state.zoom * 4);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  const kw = KEY_DISP_PX - KEY_PAD;
  const kh = KEY_DISP_PX - KEY_PAD;

  for (const key of state.keys) {
    // Key centre in pixel space
    const cx = (key.x - minX) * MM_TO_PX + KEY_DISP_PX / 2 + marginPx;
    const cy = (key.y - minY) * MM_TO_PX + KEY_DISP_PX / 2 + marginPx;
    const px = cx - kw / 2;
    const py = cy - kh / 2;

    const isSel = key.id === state.selectedId;
    const display = applyCase(qwertyLabel(key));

    // Per-key scale/offset applied to the keyboard preview label
    const labelFontPx = keyScale(key) * ENGRAVABLE * MM_TO_PX;
    const oxPx = keyOffsetX(key) * (ENGRAVABLE / 2) * MM_TO_PX;
    const oyPx = keyOffsetY(key) * (ENGRAVABLE / 2) * MM_TO_PX;

    // Each half is rotated ±10° around the key centre to match the physical tilt.
    const rot = key.x < 0 ? 10 : -10;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `kkey${isSel ? ' sel' : ''}`);
    g.setAttribute('transform', `rotate(${rot}, ${cx.toFixed(2)}, ${cy.toFixed(2)})`);
    g.dataset.id = key.id;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('class', 'kbg');
    rect.setAttribute('x',  px);
    rect.setAttribute('y',  py);
    rect.setAttribute('width',  kw);
    rect.setAttribute('height', kh);
    rect.setAttribute('rx', 5);
    g.appendChild(rect);

    for (const zone of getActiveZones()) {
      let labelText = zone.id === 'main' ? qwertyLabel(key) : key[zone.prop];
      let displayZone = applyCase(labelText);
      if (!displayZone) continue;
      
      const zoneFontPx = keyScale(key) * ENGRAVABLE * MM_TO_PX * zone.scale;
      const zoneOxPx = (keyOffsetX(key) + zone.ox) * (ENGRAVABLE / 2) * MM_TO_PX;
      const zoneOyPx = (keyOffsetY(key) + zone.oy) * (ENGRAVABLE / 2) * MM_TO_PX;

      const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      txt.setAttribute('class', 'klabel');
      // Dimmer colors for layers? The CSS class could handle this if we set data-zone
      txt.setAttribute('data-zone', zone.id);
      txt.setAttribute('x',  (cx + zoneOxPx).toFixed(2));
      txt.setAttribute('y',  (cy + zoneOyPx).toFixed(2));
      txt.setAttribute('font-size', zoneFontPx.toFixed(1));
      txt.setAttribute('font-family', `"${state.fontFamily}", var(--body-font)`);
      if (zone.id !== 'main') {
        txt.setAttribute('fill', 'var(--text-muted)');
        txt.style.opacity = '0.7';
      }
      txt.textContent = displayZone || '\u00a0';
      g.appendChild(txt);
    }

    const numTxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    numTxt.setAttribute('class', 'knum');
    numTxt.setAttribute('x', px + kw - 2);
    numTxt.setAttribute('y', py + kh - 2);
    numTxt.textContent = key.id;
    g.appendChild(numTxt);

    g.addEventListener('click', () => selectKey(key.id));
    svg.appendChild(g);
  }
}

// =============================================================================
// KEY SELECTION
// =============================================================================
function selectKey(id) {
  state.selectedId = id;
  renderKeyboard();
  renderKeyEditor();
}

// =============================================================================
// KEY EDITOR (right sidebar)
// =============================================================================
function buildKeyPreviewSvg(key) {
  const PS = 200;
  const mm2px = PS / ENGRAVABLE;

  let inner = '';
  
  for (const zone of getActiveZones()) {
    const rawVal = zone.id === 'main' ? qwertyLabel(key) : key[zone.prop];
    const displayZone = applyCase(rawVal);
    if (!displayZone) continue;
    
    // Scale for this zone
    const fontSizeMm = keyScale(key) * ENGRAVABLE * zone.scale;
    const previewFontPx = fontSizeMm * mm2px;
    
    // Total offsets for this zone
    const totalOx = (keyOffsetX(key) + zone.ox) * (ENGRAVABLE / 2);
    const totalOy = (keyOffsetY(key) + zone.oy) * (ENGRAVABLE / 2);
    
    const oxPx = totalOx * mm2px;
    const oyPx = totalOy * mm2px;
    
    const fillCol = zone.id === 'main' ? 'var(--label-color)' : 'var(--text-muted)';
    
    let pathContent = '';
    if (state.otFont) {
      const result = labelToPath(displayZone, previewFontPx, PS / 2, PS / 2, totalOx, totalOy);
      if (result) pathContent = `<path d="${result.pathData}" fill="${fillCol}"/>`;
    }
    
    if (pathContent) {
      inner += pathContent;
    } else {
      inner += `<text x="${(PS/2+oxPx).toFixed(1)}" y="${(PS/2+oyPx).toFixed(1)}"
        text-anchor="middle" dominant-baseline="central"
        font-family="${escHtml(state.fontFamily)}, var(--body-font)"
        font-size="${previewFontPx.toFixed(1)}" fill="${fillCol}" opacity="${zone.id === 'main' ? '1' : '0.7'}">${escHtml(displayZone)}</text>`;
    }
  }

  return `<svg viewBox="0 0 ${PS} ${PS}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${PS}" height="${PS}" fill="var(--key-bg)"/>
  <rect x="${(PS*0.02).toFixed(1)}" y="${(PS*0.02).toFixed(1)}"
        width="${(PS*0.96).toFixed(1)}" height="${(PS*0.96).toFixed(1)}"
        fill="none" stroke="var(--border-color)" stroke-width="1" stroke-dasharray="4 3"/>
  ${inner}
</svg>`;
}

function renderKeyEditor() {
  const pane = document.getElementById('keyEditorPane');

  if (state.selectedId === null) {
    pane.innerHTML = '<div class="key-editor-empty">Select a key to edit</div>';
    return;
  }

  const key = state.keys.find(k => k.id === state.selectedId);
  if (!key) return;

  const isThumb = key.id >= 30;
  const labelReadonly = state.qwertyMode && !isThumb;

  // Per-key scale/offset sliders (only when sync is off)
  const ks  = Math.round(keyScale(key)   * 100);
  const kox = Math.round(keyOffsetX(key) * 100);
  const koy = Math.round(keyOffsetY(key) * 100);
  const perKeyControls = state.syncScaleOffset ? '' : `
    <hr class="divider">
    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:8px">Per-key overrides</div>
    <div class="form-row">
      <label>Scale <span id="kScaleDisp">${ks}%</span></label>
      <input type="range" id="kScaleRange" min="5" max="100" value="${ks}">
    </div>
    <div class="form-row">
      <label>Offset X <span id="kOffXDisp">${kox > 0 ? '+' : ''}${kox}%</span></label>
      <input type="range" id="kOffXRange" min="-50" max="50" value="${kox}">
    </div>
    <div class="form-row">
      <label>Offset Y <span id="kOffYDisp">${koy > 0 ? '+' : ''}${koy}%</span></label>
      <input type="range" id="kOffYRange" min="-50" max="50" value="${koy}">
    </div>`;

  pane.innerHTML = `
    <div class="key-badge">
      <span class="num">#${key.id}</span>
      <span class="info">${isThumb ? 'Thumb' : `Row ${key.id < 10 ? 0 : key.id < 20 ? 1 : 2}`} &nbsp;(${key.x.toFixed(1)}, ${key.y.toFixed(1)} mm)</span>
    </div>

    <div class="key-preview-wrap" id="keyPreviewWrap">${buildKeyPreviewSvg(key)}</div>

    <div class="form-row">
      <label>${state.fourZoneMode ? 'Main' : 'Label'}${labelReadonly ? ' <span style="color:#fbbf24">(QWERTY)</span>' : ''}</label>
      <input type="text" id="kInputMain" value="${escHtml(key.label)}"
             placeholder="${state.fourZoneMode ? 'Main legend…' : (isThumb ? 'Symbol (optional)…' : 'Text to engrave…')}" maxlength="8"
             ${labelReadonly ? 'disabled' : ''}
             style="font-family:&quot;${escHtml(state.fontFamily)}&quot;,var(--body-font)">
    </div>
    ${state.fourZoneMode ? `
    <div class="form-row">
      <label>Left Layer</label>
      <input type="text" id="kInputLeft" value="${escHtml(key.labelLeft)}"
             placeholder="Left layer…" maxlength="8"
             style="font-family:&quot;${escHtml(state.fontFamily)}&quot;,var(--body-font)">
    </div>
    <div class="form-row">
      <label>Right Layer</label>
      <input type="text" id="kInputRight" value="${escHtml(key.labelRight)}"
             placeholder="Right layer…" maxlength="8"
             style="font-family:&quot;${escHtml(state.fontFamily)}&quot;,var(--body-font)">
    </div>
    <div class="form-row">
      <label>Both Layers</label>
      <input type="text" id="kInputBoth" value="${escHtml(key.labelBoth)}"
             placeholder="Both layers…" maxlength="8"
             style="font-family:&quot;${escHtml(state.fontFamily)}&quot;,var(--body-font)">
    </div>` : ''}

    ${perKeyControls}`;

  // Binding events
  const bindInput = (id, prop) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', e => {
        key[prop] = e.target.value;
        renderKeyboard();
        document.getElementById('keyPreviewWrap').innerHTML = buildKeyPreviewSvg(key);
      });
    }
  };

  if (!labelReadonly) bindInput('kInputMain', 'label');
  if (state.fourZoneMode) {
    bindInput('kInputLeft', 'labelLeft');
    bindInput('kInputRight', 'labelRight');
    bindInput('kInputBoth', 'labelBoth');
  }

  if (!state.syncScaleOffset) {
    document.getElementById('kScaleRange').addEventListener('input', e => {
      key.scale = parseInt(e.target.value) / 100;
      document.getElementById('kScaleDisp').textContent = `${e.target.value}%`;
      document.getElementById('keyPreviewWrap').innerHTML = buildKeyPreviewSvg(key);
      renderKeyboard();
    });
    document.getElementById('kOffXRange').addEventListener('input', e => {
      key.offsetX = parseInt(e.target.value) / 100;
      const v = parseInt(e.target.value);
      document.getElementById('kOffXDisp').textContent = `${v > 0 ? '+' : ''}${v}%`;
      document.getElementById('keyPreviewWrap').innerHTML = buildKeyPreviewSvg(key);
      renderKeyboard();
    });
    document.getElementById('kOffYRange').addEventListener('input', e => {
      key.offsetY = parseInt(e.target.value) / 100;
      const v = parseInt(e.target.value);
      document.getElementById('kOffYDisp').textContent = `${v > 0 ? '+' : ''}${v}%`;
      document.getElementById('keyPreviewWrap').innerHTML = buildKeyPreviewSvg(key);
      renderKeyboard();
    });
  }
}

// =============================================================================
// SVG EXPORT — engraving grid
// =============================================================================
function buildEngraveSVG(forPreview = false) {
  // SVG canvas in mm, origin top-left
  // Grid center sits at (originX, originY) in SVG coordinates
  // SVG canvas in mm — keys laid out in a rectangular GRID_COLS × GRID_ROWS grid,
  // matching the physical jig used on the engraving table.
  const margin  = 5;
  const totalW  = (GRID_COLS - 1) * GRID_PITCH + ENGRAVABLE;
  const totalH  = (GRID_ROWS - 1) * GRID_PITCH + ENGRAVABLE;
  const svgW    = totalW + margin * 2;
  const svgH    = totalH + margin * 2;
  const originX = margin + totalW / 2;
  const originY = margin + totalH / 2;

  const parts = {
    cells:      [],
    labels:     [],
    textLabels: [],
    guides:     [],
  };

  // Cell outlines + labels — key.id maps 1-to-1 to grid position
  for (const key of state.keys) {
    const gp = key.id;
    if (gp < 0 || gp >= GRID_COLS * GRID_ROWS) continue;

    const gc = gridCenter(gp);
    const cx = originX + gc.x;
    const cy = originY + gc.y;
    const ex = cx - ENGRAVABLE / 2;
    const ey = cy - ENGRAVABLE / 2;

    parts.cells.push(
      `<rect x="${ex.toFixed(3)}" y="${ey.toFixed(3)}"` +
      ` width="${ENGRAVABLE}" height="${ENGRAVABLE}"` +
      ` fill="none" stroke="#cccccc" stroke-width="0.1"/>`
    );

    if (forPreview) {
      parts.guides.push(
        `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="0.25" fill="#999"/>`,
        `<text x="${(ex + 0.8).toFixed(2)}" y="${(ey + 2.2).toFixed(2)}"` +
        ` font-size="1.8" fill="#bbb">${gp}</text>`
      );
    }

    for (const zone of getActiveZones()) {
      const rawVal = zone.id === 'main' ? qwertyLabel(key) : key[zone.prop];
      const displayZone = applyCase(rawVal);
      if (!displayZone) continue;
      
      const kFontSizeMm = keyScale(key) * ENGRAVABLE * zone.scale;
      
      // Calculate specific offset for the zone
      const combinedOxMm = (keyOffsetX(key) + zone.ox) * (ENGRAVABLE / 2);
      const combinedOyMm = (keyOffsetY(key) + zone.oy) * (ENGRAVABLE / 2);
      
      const pathResult = state.otFont ? labelToPath(displayZone, kFontSizeMm, cx, cy, combinedOxMm, combinedOyMm) : null;

      if (pathResult) {
        parts.labels.push(`<path d="${pathResult.pathData}" fill="black"/>`);
      } else {
        parts.textLabels.push(
          `<text x="${(cx + combinedOxMm).toFixed(3)}" y="${(cy + combinedOyMm).toFixed(3)}"` +
          ` text-anchor="middle" dominant-baseline="central"` +
          ` font-family="${escHtml(state.fontFamily)}, 'Segoe UI Symbol', 'Apple Symbols', 'Noto Sans Symbols', sans-serif"` +
          ` font-size="${kFontSizeMm.toFixed(3)}" fill="black">${escHtml(displayZone)}</text>`
        );
      }
    }
  }

  // Crosshair at grid origin (0,0) for table alignment
  const ch = 3; // mm half-length
  parts.guides.push(
    `<line x1="${(originX - ch).toFixed(2)}" y1="${originY.toFixed(2)}"` +
    `      x2="${(originX + ch).toFixed(2)}" y2="${originY.toFixed(2)}"` +
    ` stroke="#f00" stroke-width="0.15"/>`,
    `<line x1="${originX.toFixed(2)}" y1="${(originY - ch).toFixed(2)}"` +
    `      x2="${originX.toFixed(2)}" y2="${(originY + ch).toFixed(2)}"` +
    ` stroke="#f00" stroke-width="0.15"/>`
  );

  // Font for the text fallback path.
  // Preview (forPreview=true): no style block needed — the SVG is rendered inline in the page,
  //   which already has the font loaded via the <link> tag in <head>. Inline SVG inherits
  //   document-level @font-face, so font-family on <text> elements just works.
  // Export (forPreview=false): embed the font binary as a base64 data URI so the file is
  //   fully self-contained (no internet required when opened in Inkscape / other editors).
  let styleBlock = '';
  if (parts.textLabels.length > 0 && !forPreview) {
    if (state.fontBuffer) {
      const mime = detectFontMime(state.fontBuffer);
      const fmt  = mime === 'font/woff2' ? 'woff2' : mime === 'font/woff' ? 'woff' : 'truetype';
      const b64  = arrayBufferToBase64(state.fontBuffer);
      styleBlock = `<style>@font-face { font-family: "${escHtml(state.fontFamily)}";` +
                   ` src: url("data:${mime};base64,${b64}") format("${fmt}"); }</style>\n`;
    }
    // No fontBuffer: text elements carry font-family only; viewer needs font installed.
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${svgW.toFixed(3)} ${svgH.toFixed(3)}"
     width="${svgW.toFixed(3)}mm" height="${svgH.toFixed(3)}mm">
  ${styleBlock}<!-- Engravable area outlines (14.7 x 14.7 mm each) -->
  ${parts.cells.join('\n')}

  <!-- Guides: center crosshair + grid position labels -->
  ${parts.guides.join('\n')}

  <!-- Engraved labels (paths) -->
  ${parts.labels.join('\n')}

  <!-- Engraved labels (text fallback — glyphs missing from font or no font loaded) -->
  ${parts.textLabels.join('\n')}
</svg>`;
}

function exportSVG() {
  const svg  = buildEngraveSVG(false);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'keycap-engrave.svg';
  a.click();
  URL.revokeObjectURL(url);
}

// =============================================================================
// UV MAP EXPORT (PNG)
// =============================================================================
function showUvModal() {
  document.getElementById('uvModal').classList.add('open');
}

function exportUVMap() {
  const SIZE = 4096;
  const canvas = document.createElement('canvas');
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // Background is transparent by default

  // (0,0) mm is center of keyboard. Map to center of canvas.
  // We need a scale factor. 1mm = X pixels.
  // Based on master UV analysis: (3835-261) / 182.12 = 19.624 px/mm
  const mm2px = state.uvScale; 
  const centerX = SIZE / 2;
  const centerY = SIZE / 2;

  state.keys.forEach(key => {
    // Determine active zones
    const zones = getActiveZones();
    
    zones.forEach(zone => {
      const rawVal = zone.id === 'main' ? qwertyLabel(key) : key[zone.prop];
      const displayZone = applyCase(rawVal);
      if (!displayZone) return;

      const fontSizeMm = keyScale(key) * ENGRAVABLE * zone.scale;
      const fontSizePx = fontSizeMm * mm2px;

      // Coordinate mapping
      // Add global UV calibration offsets
      const mmX = key.x + state.uvOffX;
      const mmY = key.y + state.uvOffY;

      const pxX = centerX + mmX * mm2px;
      const pxY = centerY + mmY * mm2px;

      // Local label offsets
      const localOffXMm = (keyOffsetX(key) + zone.ox) * (ENGRAVABLE / 2);
      const localOffYMm = (keyOffsetY(key) + zone.oy) * (ENGRAVABLE / 2);

      // Rotation (±10°)
      const rotRad = (key.x < 0 ? 10 : -10) * Math.PI / 180;

      ctx.save();
      ctx.translate(pxX, pxY);
      ctx.rotate(rotRad);
      
      // Translate by local offsets relative to rotated key center
      ctx.translate(localOffXMm * mm2px, localOffYMm * mm2px);

      if (state.otFont) {
        // Use opentype.js to draw to canvas for perfect path fidelity
        const font = state.otFont;
        const probe = font.getPath(displayZone, 0, 0, fontSizeMm);
        const bb = probe.getBoundingBox();
        const tw = bb.x2 - bb.x1;
        
        // Horizontal centering
        const dx = -bb.x1 - tw / 2;
        
        // Vertical centering using 'H' as reference
        const ref = font.getPath('H', 0, 0, fontSizeMm).getBoundingBox();
        const refCenterY = ref.y1 + (ref.y2 - ref.y1) / 2;
        const dy = -refCenterY;

        const path = font.getPath(displayZone, dx * mm2px, dy * mm2px, fontSizePx);
        ctx.fillStyle = 'white';
        path.draw(ctx);
      } else {
        // Fallback to canvas text
        ctx.fillStyle = 'white';
        ctx.font = `${fontSizePx}px "${state.fontFamily}", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayZone, 0, 0);
      }

      ctx.restore();
    });
  });

  const link = document.createElement('a');
  link.download = 'keycap-uv-legends.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// =============================================================================
// GRID PREVIEW MODAL
// =============================================================================
function showPreview() {
  const svgStr = buildEngraveSVG(true);

  // Parse and inject into preview SVG element
  const parsed = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  const src = parsed.documentElement;

  const previewEl = document.getElementById('gridPreviewSvg');
  previewEl.innerHTML = src.innerHTML;

  // Copy viewBox/dimensions, scale to fit screen
  const vb = src.getAttribute('viewBox').split(' ').map(Number);
  const aspect = vb[2] / vb[3];
  const maxW = Math.min(window.innerWidth * 0.85, 800);
  const dispH = Math.round(maxW / aspect);
  previewEl.setAttribute('viewBox', src.getAttribute('viewBox'));
  previewEl.setAttribute('width',  maxW);
  previewEl.setAttribute('height', dispH);

  document.getElementById('previewModal').classList.add('open');
}

// =============================================================================
// BULK EDIT
// =============================================================================
function applyBulk() {
  const lines = document.getElementById('bulkInput').value.split('\n');
  state.keys.forEach((key, i) => {
    key.label = (lines[i] ?? '').trim();
  });
  renderKeyboard();
  renderKeyEditor();
}

function syncBulkFromKeys() {
  document.getElementById('bulkInput').value =
    state.keys.map(k => k.label).join('\n');
}

function clearAll() {
  state.keys.forEach(k => { k.label = ''; });
  document.getElementById('bulkInput').value = '';
  renderKeyboard();
  renderKeyEditor();
}

// =============================================================================
// EVENT WIRING
// =============================================================================
document.getElementById('loadFontBtn').addEventListener('click', () => {
  const name = document.getElementById('fontInput').value.trim();
  if (name) loadFont(name);
});
document.getElementById('fontInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const name = e.target.value.trim();
    if (name) loadFont(name);
  }
});

document.querySelectorAll('.case-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.case-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.fontCase = btn.dataset.case;
    updateFontPreview();
    renderKeyboard();
    renderKeyEditor();
  });
});

document.getElementById('scaleRange').addEventListener('input', e => {
  state.scale = parseInt(e.target.value) / 100;
  document.getElementById('scaleDisp').textContent = `${e.target.value}%`;
  if (state.syncScaleOffset) renderKeyboard();
  renderKeyEditor();
});

document.getElementById('offsetXRange').addEventListener('input', e => {
  state.offsetX = parseInt(e.target.value) / 100;
  const v = parseInt(e.target.value);
  document.getElementById('offsetXDisp').textContent = `${v > 0 ? '+' : ''}${v}%`;
  if (state.syncScaleOffset) renderKeyboard();
  renderKeyEditor();
});

document.getElementById('offsetYRange').addEventListener('input', e => {
  state.offsetY = parseInt(e.target.value) / 100;
  const v = parseInt(e.target.value);
  document.getElementById('offsetYDisp').textContent = `${v > 0 ? '+' : ''}${v}%`;
  if (state.syncScaleOffset) renderKeyboard();
  renderKeyEditor();
});

document.getElementById('syncToggle').addEventListener('change', e => {
  state.syncScaleOffset = e.target.checked;
  renderKeyboard();
  renderKeyEditor();
});

document.getElementById('qwertyToggle').addEventListener('change', e => {
  state.qwertyMode = e.target.checked;
  renderKeyboard();
  renderKeyEditor();
  syncBulkFromKeys();
});

document.getElementById('zoomRange').addEventListener('input', e => {
  state.zoom = parseInt(e.target.value) / 100;
  document.getElementById('zoomDisp').textContent = `${e.target.value}%`;
  renderKeyboard();
});

document.getElementById('exportBtn').addEventListener('click', exportSVG);
document.getElementById('uvExportBtn').addEventListener('click', showUvModal);
document.getElementById('closeUvBtn').addEventListener('click', () => {
  document.getElementById('uvModal').classList.remove('open');
});
document.getElementById('downloadUvBtn').addEventListener('click', exportUVMap);

document.getElementById('uvOffYRange').addEventListener('input', e => {
  state.uvOffY = parseFloat(e.target.value);
  document.getElementById('uvOffYDisp').textContent = `${state.uvOffY.toFixed(1)} mm`;
});
document.getElementById('uvOffXRange').addEventListener('input', e => {
  state.uvOffX = parseFloat(e.target.value);
  document.getElementById('uvOffXDisp').textContent = `${state.uvOffX.toFixed(1)} mm`;
});
document.getElementById('uvScaleRange').addEventListener('input', e => {
  state.uvScale = parseFloat(e.target.value);
  document.getElementById('uvScaleDisp').textContent = `${state.uvScale.toFixed(1)} px/mm`;
});

document.getElementById('previewBtn').addEventListener('click', showPreview);
document.getElementById('closePreviewBtn').addEventListener('click', () => {
  document.getElementById('previewModal').classList.remove('open');
});

document.getElementById('applyBulkBtn').addEventListener('click', applyBulk);
document.getElementById('clearAllBtn').addEventListener('click', clearAll);

document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
});

document.getElementById('fourZoneToggle').addEventListener('change', e => {
  state.fourZoneMode = e.target.checked;
  renderKeyboard();
  renderKeyEditor();
});

// Keep bulk textarea in sync when labels are edited via the key editor
// (already handled by renderKeyEditor — sync on open)
document.getElementById('rightSidebar').addEventListener('focusin', syncBulkFromKeys);

// =============================================================================
// INIT
// =============================================================================
// Force checkboxes/sliders to match JS state (prevents browser form-state restoration mismatch)
document.getElementById('syncToggle').checked   = state.syncScaleOffset;
document.getElementById('qwertyToggle').checked = state.qwertyMode;
document.getElementById('fourZoneToggle').checked = state.fourZoneMode;
document.getElementById('zoomRange').value      = Math.round(state.zoom * 100);
document.getElementById('zoomDisp').textContent = `${Math.round(state.zoom * 100)}%`;

// UV Initial Displays
document.getElementById('uvOffYRange').value = state.uvOffY;
document.getElementById('uvOffYDisp').textContent = `${state.uvOffY.toFixed(1)} mm`;
document.getElementById('uvOffXRange').value = state.uvOffX;
document.getElementById('uvOffXDisp').textContent = `${state.uvOffX.toFixed(1)} mm`;
document.getElementById('uvScaleRange').value = state.uvScale;
document.getElementById('uvScaleDisp').textContent = `${state.uvScale.toFixed(1)} px/mm`;

renderKeyboard();
loadFont('Roboto');
