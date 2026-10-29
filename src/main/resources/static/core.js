/* ============================================================
   MetroPass — frontend logic
   Talks to the Spring Boot API under /api, including transactional
   booking and ordered route-stop operations.
============================================================ */

const state = {
  currentUser: JSON.parse(localStorage.getItem('metroUser') || 'null'),
  users: [],
  stations: [],
  routes: [],
  fares: [],
  tickets: [],
  payments: [],
  trains: [],
  schedules: [],
  metroCards: [],
  metroCardPasses: [],
  metroCardTransactions: [],
  routeStations: [],
  maintenanceIssues: [],
  bookingStep: 1,
  bookingDraft: null,
  networkSelection: {}
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

/* ---------------- Theme ---------------- */
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('metroThemeV2', theme); } catch (e) {}
}
function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

/* ---------------- Metro scene (moving background) ---------------- */
function seedSceneStars() {
  const host = $('#scene-stars');
  if (!host || host.dataset.seeded) return;
  host.dataset.seeded = '1';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 50; i++) {
    const star = document.createElement('span');
    star.className = 'scene-star';
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 55}%`;
    star.style.animationDelay = `${(Math.random() * 5).toFixed(2)}s`;
    frag.appendChild(star);
  }
  host.appendChild(frag);
}
function applyScenePerformanceTier() {
  const scene = $('#metro-scene');
  if (!scene) return;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  scene.setAttribute('data-tier', reduced ? 'off' : narrow ? 'medium' : 'high');
}

/* Scroll parallax: distant scene layers drift opposite the scroll direction,
   each at its own --depth, so the world feels like it has spatial depth
   rather than being a flat looping strip. Skipped entirely under reduced
   motion or the "off" performance tier. */
let sceneParallaxLayers = null;
let sceneParallaxTicking = false;
function updateSceneParallax() {
  sceneParallaxTicking = false;
  const scene = $('#metro-scene');
  if (!scene || scene.getAttribute('data-tier') === 'off') return;
  if (!sceneParallaxLayers) sceneParallaxLayers = $$('.scene-parallax');
  const y = window.scrollY || window.pageYOffset || 0;
  sceneParallaxLayers.forEach((layer) => {
    const depth = parseFloat(layer.dataset.depth || '0');
    layer.style.setProperty('--parallax-shift', `${(y * depth).toFixed(1)}px`);
  });
}
function onSceneScroll() {
  if (sceneParallaxTicking) return;
  sceneParallaxTicking = true;
  requestAnimationFrame(updateSceneParallax);
}
const SCENE_DIM_BY_VIEW = { book: 1.5, network: 1.5, tickets: 1.9, card: 1.9, profile: 1.9 };
function setSceneView(view) {
  const workspace = $('.workspace');
  if (workspace) workspace.setAttribute('data-scene-view', view || 'dashboard');
  const scene = $('#metro-scene');
  if (!scene) return;
  scene.setAttribute('data-scene-view', view || 'dashboard');
  const dim = (view || '').startsWith('admin') ? 2.4 : (SCENE_DIM_BY_VIEW[view] || 1);
  scene.style.setProperty('--scene-dim', dim);
}
const resources = ['users', 'stations', 'routes', 'fares', 'tickets', 'payments'];
const resourceEndpoints = {
  trains: 'trains', schedules: 'schedules', metroCards: 'metro-cards',
  maintenanceIssues: 'maintenance-issues', routeStations: 'route-stations'
};
const opsResources = Object.keys(resourceEndpoints);

const LINE_COLORS = ['#2563EB', '#f2994a', '#27ae60', '#bb6bd9', '#e05656', '#0ea5b7'];

/* An API failure that also carries the HTTP status and the per-field error map (if any). */
class ApiError extends Error {
  constructor(message, status = 0, fields = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

const REQUEST_TIMEOUT_MS = 70000;      // the free hosting tier can take up to a minute to wake up
const WAKE_NOTICE_DELAY_MS = 4000;
let slowRequestCount = 0;
function setWakeBanner(visible) {
  const banner = document.getElementById('wake-banner');
  if (banner) banner.hidden = !visible;
}

const api = async (resource, options = {}) => {
  const method = String(options.method || 'GET').toUpperCase();
  // Only reads are retried. Repeating a write could apply it twice.
  const maxAttempts = method === 'GET' ? 2 : 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 2500));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let counted = false;
    const wakeId = setTimeout(() => { counted = true; slowRequestCount += 1; setWakeBanner(true); }, WAKE_NOTICE_DELAY_MS);
    try {
      const response = await fetch(`/api/${resource}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        signal: controller.signal
      });
      if (!response.ok) {
        const text = await response.text();
        let detail = text;
        let fields = null;
        try {
          const body = JSON.parse(text);
          detail = body.detail || body.message || body.error || text;
          if (body.errors && typeof body.errors === 'object') fields = body.errors;
        } catch {}
        const error = new ApiError(detail || `${response.status} ${response.statusText}`, response.status, fields);
        if (method === 'GET' && [502, 503, 504].includes(response.status) && attempt < maxAttempts) {
          lastError = error;
          continue;
        }
        throw error;
      }
      if (response.status === 204) return null;
      try {
        return await response.json();
      } catch {
        throw new ApiError('The server sent a response that could not be read.', response.status);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      lastError = new ApiError(error.name === 'AbortError'
        ? 'The server took too long to respond. Please try again.'
        : 'Could not reach the server. Check your connection and try again.');
      if (attempt >= maxAttempts) throw lastError;
    } finally {
      clearTimeout(timeoutId);
      clearTimeout(wakeId);
      if (counted) {
        slowRequestCount = Math.max(0, slowRequestCount - 1);
        if (slowRequestCount === 0) setWakeBanner(false);
      }
    }
  }
  throw lastError;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[char]));

const isAdmin = () => state.currentUser?.role === 'ADMIN';
const displayName = (user) => `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.userId || 'Metro user';
const stationName = (id) => state.stations.find((station) => station.stationId === id)?.stationCode || id || 'Unknown';
const stationById = (id) => state.stations.find((station) => station.stationId === id);
const trainName = (id) => state.trains.find((train) => train.trainId === id)?.trainNumber || id || 'Unknown';
const routeName = (id) => state.routes.find((route) => route.routeId === id)?.routeName || id || 'Unknown';
const money = (value) => `₹${Number(value || 0).toFixed(2)}`;
function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getTime());
  const text = String(value);
  // Java LocalDate JSON values are date-only strings. Parse them as local dates,
  // not UTC dates (which otherwise display as the previous day in India).
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text);
}
function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function localDateTimeString(date = new Date()) {
  return `${localDateString(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}
function isValidDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = parseDateValue(value);
  return Boolean(parsed && !Number.isNaN(parsed.getTime()) && localDateString(parsed) === value);
}
const formatDate = (value) => {
  const date = parseDateValue(value);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
};
const formatTime = (value) => {
  const date = parseDateValue(value);
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '--:--';
};
const ticketPool = () => isAdmin() ? state.tickets : state.tickets.filter((ticket) => ticket.passengerId === state.currentUser?.userId);

function notify(message, isError = false) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}


/* ---------------- Field errors ---------------- */
function clearFieldErrors(root) {
  if (!root) return;
  root.querySelectorAll('.invalid').forEach((el) => { el.classList.remove('invalid'); el.removeAttribute('aria-invalid'); });
  root.querySelectorAll('.inline-error').forEach((el) => el.remove());
}

/* Marks the inputs named in `fields` (server "errors" map or locally built). `idMap` maps a field name to an input id. */
function showFieldErrors(root, fields, idMap) {
  let shown = 0;
  if (!root || !fields) return shown;
  Object.entries(fields).forEach(([name, message]) => {
    const id = idMap[name];
    const input = id ? root.querySelector(`#${id}`) : null;
    if (!input) return;
    input.classList.add('invalid');
    input.setAttribute('aria-invalid', 'true');
    const note = document.createElement('span');
    note.className = 'inline-error';
    note.textContent = message;
    (input.closest('label') || input.parentElement).appendChild(note);
    shown += 1;
  });
  root.querySelector('.invalid')?.focus();
  return shown;
}

document.addEventListener('input', (event) => {
  const el = event.target;
  if (!el.classList || !el.classList.contains('invalid')) return;
  el.classList.remove('invalid');
  el.removeAttribute('aria-invalid');
  el.closest('label')?.querySelector('.inline-error')?.remove();
});

/* ---------------- Modal form (replaces window.prompt for the actions that use it) ---------------- */
function openModal({ title, intro = '', fields = [], submitLabel = 'Save', onSubmit }) {
  const host = $('#modal-host');
  if (!host) return;
  const previouslyFocused = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-modal';
  const fieldHtml = fields.map((field) => {
    const id = `modal-field-${field.name}`;
    const attrs = ['min', 'max', 'step', 'maxlength', 'minlength', 'placeholder', 'autocomplete']
      .filter((key) => field[key] !== undefined)
      .map((key) => `${key}="${escapeHtml(field[key])}"`).join(' ');
    const control = field.type === 'select'
      ? `<select id="${id}" name="${escapeHtml(field.name)}">${(field.options || []).map((option) => (
        `<option value="${escapeHtml(option.value)}"${String(option.value) === String(field.value) ? ' selected' : ''}>${escapeHtml(option.label)}</option>`
      )).join('')}</select>`
      : `<input id="${id}" name="${escapeHtml(field.name)}" type="${escapeHtml(field.type || 'text')}" value="${escapeHtml(field.value ?? '')}" ${attrs}>`;
    return `<label>${escapeHtml(field.label)}${control}${field.hint ? `<span class="field-hint">${escapeHtml(field.hint)}</span>` : ''}</label>`;
  }).join('');
  dialog.innerHTML = `
    <form class="modal-form" novalidate>
      <h3>${escapeHtml(title)}</h3>
      ${intro ? `<p>${escapeHtml(intro)}</p>` : ''}
      <div class="modal-fields">${fieldHtml}</div>
      <p class="modal-error" role="alert"></p>
      <div class="modal-actions">
        <button type="button" class="ghost-action" data-modal-cancel>Cancel</button>
        <button type="submit" class="dark-action">${escapeHtml(submitLabel)}</button>
      </div>
    </form>`;
  const form = dialog.querySelector('form');
  const errorEl = dialog.querySelector('.modal-error');
  const idMap = Object.fromEntries(fields.map((field) => [field.name, `modal-field-${field.name}`]));

  dialog.addEventListener('close', () => { dialog.remove(); previouslyFocused?.focus?.(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.querySelector('[data-modal-cancel]').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);
    errorEl.textContent = '';
    const values = {};
    fields.forEach((field) => {
      const el = form.elements[field.name];
      values[field.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    });
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await onSubmit(values);
      dialog.close();
    } catch (error) {
      const shown = showFieldErrors(form, error.fields, idMap);
      // When a field already carries the message, do not repeat it at the bottom of the dialog.
      errorEl.textContent = shown ? '' : (error.message || 'Could not save the changes.');
      // 404 and 409 mean the record changed or vanished since this page loaded.
      if (error.status === 404 || error.status === 409) loadData().catch(() => {});
    } finally {
      submit.disabled = false;
    }
  });

  host.appendChild(dialog);
  dialog.showModal();
  dialog.querySelector('input, select')?.focus();
}

function confirmAction({ title, message, confirmLabel = 'Confirm', danger = false }) {
  const host = $('#modal-host');
  if (!host) return Promise.resolve(false);
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-modal';
    dialog.innerHTML = `<form class="modal-form confirm-form">
      <h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button type="button" class="ghost-action" data-confirm-cancel>Go back</button>
        <button type="submit" class="${danger ? 'danger-action' : 'dark-action'}">${escapeHtml(confirmLabel)}</button>
      </div>
    </form>`;
    let accepted = false;
    dialog.addEventListener('close', () => { dialog.remove(); resolve(accepted); });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.querySelector('[data-confirm-cancel]').addEventListener('click', () => dialog.close());
    dialog.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault(); accepted = true; dialog.close();
    });
    host.appendChild(dialog);
    dialog.showModal();
  });
}

/* ---------------- Metro card helpers ---------------- */
function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
// Matches the server: a card is expired only once its expiry date is before today.
function cardIsExpired(card) {
  const expiry = card?.expiryDate ? parseDateValue(card.expiryDate) : null;
  return Boolean(expiry && !Number.isNaN(expiry.getTime()) && expiry < startOfToday());
}
function cardIsUsable(card) { return Boolean(card) && card.isActive !== false && !cardIsExpired(card); }

function paymentLabel(payment) {
  if (!payment) return '-';
  if (payment.paymentMethod === 'METRO_CARD_PASS') return `MetroPass time pass${payment.metroCardId ? ` · ${payment.metroCardId}` : ''}`;
  return payment.paymentMethod === 'METRO_CARD'
    ? `Metro card${payment.metroCardId ? ` ${payment.metroCardId}` : ''}`
    : 'Demo';
}

function openTopUpModal(cardId) {
  const card = state.metroCards.find((item) => item.cardId === cardId);
  if (!card) {
    notify('That metro card no longer exists.', true);
    loadData().catch(() => {});
    return;
  }
  if (!cardIsUsable(card)) { notify('Only an active, unexpired card can be topped up.', true); return; }
  openModal({
    title: 'Top up metro card',
    intro: `Card ${card.cardId}. Current balance ${money(card.balance)}. Choose a quick amount or enter a custom top-up.`,
    fields: [
      { name: 'preset', label: 'Quick top-up', type: 'select', value: '500', options: [
        { value: '200', label: '₹200' }, { value: '500', label: '₹500' }, { value: '1000', label: '₹1,000' },
        { value: '2000', label: '₹2,000' }, { value: '5000', label: '₹5,000' }, { value: 'custom', label: 'Custom amount' }
      ] },
      { name: 'customAmount', label: 'Custom amount (₹)', type: 'number', min: '1', max: '10000', step: '0.01', hint: 'Enter between ₹1 and ₹10,000. Leave blank to use the quick amount.' }
    ],
    submitLabel: 'Add money',
    onSubmit: async ({ preset, customAmount }) => {
      const amount = customAmount ? customAmount : preset;
      if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) < 1 || Number(amount) > 10000) {
        const message = 'Enter an amount from 1.00 to 10000.00 with at most 2 decimals.';
        throw new ApiError(message, 400, { amount: message });
      }
      const updated = await api(`metro-cards/${encodeURIComponent(cardId)}/top-up`, {
        method: 'POST', body: JSON.stringify({ amount: Number(amount) })
      });
      state.metroCards = state.metroCards.map((item) => item.cardId === updated.cardId ? updated : item);
      await loadMetroCardActivity(cardId).catch(() => {});
      refreshAll();
      notify(`Added ${money(amount)}. New balance ${money(updated.balance)}.`);
    }
  });
}

async function loadMetroCardActivity(cardId) {
  if (!cardId) { state.metroCardPasses = []; state.metroCardTransactions = []; return; }
  const [passes, transactions] = await Promise.all([
    api(`metro-cards/${encodeURIComponent(cardId)}/passes`),
    api(`metro-cards/${encodeURIComponent(cardId)}/transactions`)
  ]);
  state.metroCardPasses = passes || [];
  state.metroCardTransactions = transactions || [];
}

function buyMetroPass(cardId, passType, price, label) {
  openModal({
    title: `Buy ${label}`,
    intro: `${label} costs ${money(price)} and is paid from your card balance. Your current balance is ${money(state.metroCards.find((card) => card.cardId === cardId)?.balance || 0)}.`,
    fields: [{ name: 'confirm', label: 'Pass', type: 'select', value: passType, options: [{ value: passType, label: `${label} · ${money(price)}` }] }],
    submitLabel: 'Buy pass',
    onSubmit: async () => {
      const result = await api(`metro-cards/${encodeURIComponent(cardId)}/passes`, {
        method: 'POST', body: JSON.stringify({ passType })
      });
      if (result.card) state.metroCards = state.metroCards.map((item) => item.cardId === cardId ? result.card : item);
      if (result.pass) state.metroCardPasses = [result.pass, ...state.metroCardPasses];
      await loadMetroCardActivity(cardId).catch(() => {});
      refreshAll();
      notify(`${label} ready · valid until ${new Date(result.pass?.expiresAt).toLocaleString()}.`);
    }
  });
}

// The demo fare table is treated as symmetric: a fare defined in either direction
// applies in both directions unless a direction-specific row exists.
function findFare(from, to) {
  if (!from || !to || from === to) return null;
  return state.fares.find((fare) => fare.sourceStationId === from && fare.destStationId === to)
    || state.fares.find((fare) => fare.sourceStationId === to && fare.destStationId === from);
}

function fareForJourney(from, to, path = pathBetween(from, to)) {
  if (!path) return null;
  const directFare = findFare(from, to);
  if (directFare && Number(directFare.baseFare) > 0) {
    return { oneWayFare: Number(directFare.baseFare), fareId: directFare.fareId, direct: true };
  }
  let oneWayFare = 0;
  let fareId = null;
  for (const edge of path.edges) {
    const segmentFare = findFare(edge.fromStationId, edge.toStationId);
    if (!segmentFare || !Number.isFinite(Number(segmentFare.baseFare)) || Number(segmentFare.baseFare) <= 0) return null;
    oneWayFare += Number(segmentFare.baseFare);
    fareId ||= segmentFare.fareId;
  }
  return fareId ? { oneWayFare, fareId, direct: false } : null;
}

function calculateBookingFare(from, to, type = 'SINGLE', count = 1) {
  const path = pathBetween(from, to);
  if (!path) return null;
  const normalizedType = String(type || 'SINGLE').toUpperCase();
  const fareInfo = fareForJourney(from, to, path);
  if (!fareInfo) return null;
  let perPassenger;
  let label;
  const fareId = fareInfo.fareId;
  if (normalizedType === 'RETURN') {
    perPassenger = fareInfo.oneWayFare * 2;
    label = 'Return journey (2× one-way fare)';
  } else if (normalizedType === 'DAY_PASS') {
    perPassenger = fareInfo.oneWayFare * 3;
    label = 'Day pass (3× one-way fare)';
  } else if (normalizedType === 'SINGLE') {
    perPassenger = fareInfo.oneWayFare;
    label = 'Single journey';
  } else {
    return null;
  }
  const passengerCount = Number(count || 1);
  if (!Number.isInteger(passengerCount) || passengerCount < 1 || passengerCount > 4) return null;
  return {
    path,
    fareId,
    oneWayFare: fareInfo?.oneWayFare ?? null,
    perPassenger,
    passengerCount,
    total: Math.round((perPassenger * passengerCount + Number.EPSILON) * 100) / 100,
    label,
    isEstimatedFromSegments: Boolean(fareInfo && !fareInfo.direct)
  };
}

function ticketValidityLabel(type) {
  if (type === 'RETURN') return 'Valid for 24 hours';
  if (type === 'DAY_PASS') return 'Valid until the end of today';
  return 'Valid for 2 hours';
}

function ticketExpiry(type, now = new Date()) {
  const expiry = new Date(now.getTime());
  if (type === 'RETURN') expiry.setHours(expiry.getHours() + 24);
  else if (type === 'DAY_PASS') expiry.setHours(23, 59, 59, 0);
  else expiry.setHours(expiry.getHours() + 2);
  return localDateTimeString(expiry);
}

function lineColorFor(routeId, index) {
  const route = state.routes.find((r) => r.routeId === routeId);
  return route?.lineColor || LINE_COLORS[index % LINE_COLORS.length];
}

function estimateStops(from, to) {
  const path = pathBetween(from, to);
  if (!path) return { count: null, minutes: null };
  let minutes = 0;
  for (const leg of path.legs) {
    const route = state.routes.find((candidate) => candidate.routeId === leg.routeId);
    const allStops = state.routeStations.filter((item) => item.routeId === leg.routeId)
      .sort((a, b) => Number(a.sequenceNumber || 0) - Number(b.sequenceNumber || 0));
    const edgeCount = Math.max(allStops.length - 1, 1);
    const legEdges = Math.max(leg.stationIds.length - 1, 0);
    minutes += (Number(route?.estimatedTime) || 0) * (legEdges / edgeCount);
  }
  return { count: path.stationIds.length, minutes: minutes > 0 ? Math.max(1, Math.round(minutes)) : null };
}

/* ---------------- QR-style code (visual only, canvas-drawn) ---------------- */
function drawTicketQr(canvas, seedText) {
  if (!canvas) return;
  const size = 21;
  const ctx = canvas.getContext('2d');
  canvas.width = size; canvas.height = size;
  let seed = 0;
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) >>> 0;
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed >>> 8) / 16777216; };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0B1220';
  const drawFinder = (x, y) => {
    ctx.fillRect(x, y, 7, 7);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 1, y + 1, 5, 5);
    ctx.fillStyle = '#0B1220';
    ctx.fillRect(x + 2, y + 2, 3, 3);
  };
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inFinderZone = (x < 8 && y < 8) || (x > size - 9 && y < 8) || (x < 8 && y > size - 9);
      if (inFinderZone) continue;
      if (rand() > 0.56) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/* ---------------- Ticket card renderer ---------------- */
function ticketStatus(ticket) {
  if (ticket.isUsed) return 'used';
  if (ticket.validUntil && new Date(ticket.validUntil) <= new Date()) return 'expired';
  return 'active';
}

function ticketCardHtml(ticket, { compact = false } = {}) {
  const status = ticketStatus(ticket);
  const statusLabel = status === 'active' ? 'ACTIVE' : status === 'used' ? 'USED' : 'EXPIRED';
  const fare = state.fares.find((f) => f.fareId === ticket.fareId);
  const payment = state.payments.find((p) => p.ticketId === ticket.ticketId);
  const amount = payment?.amount ?? fare?.baseFare ?? 0;
  const passengers = Number(ticket.passengerCount || ticket._passengerCount || 1);
  const canvasId = `qr-${ticket.ticketId}-${Math.random().toString(36).slice(2, 7)}`;
  return `
    <div class="metro-ticket" data-ticket-card="${escapeHtml(ticket.ticketId)}">
      <div class="metro-ticket-head">
        <span class="metro-ticket-brand">METROPASS</span>
        <span class="metro-ticket-type">${escapeHtml(ticket.ticketType || 'SINGLE')}</span>
      </div>
      <div class="metro-ticket-route">
        <strong>${escapeHtml(stationName(ticket.sourceStationId)).toUpperCase()}</strong>
        <span class="route-arrow">→</span>
        <strong>${escapeHtml(stationName(ticket.destStationId)).toUpperCase()}</strong>
      </div>
      <div class="metro-ticket-times">
        <span>${formatTime(ticket.issueTime || ticket.createdAt)}</span>
        <span>·</span>
        <span>${formatDate(ticket.issueTime || ticket.createdAt)}</span>
      </div>
      <hr class="metro-ticket-divider">
      <div class="metro-ticket-body">
        <div class="metro-ticket-meta">
          <span class="metro-ticket-fare">${money(amount)}</span>
          <span class="metro-ticket-pax">${passengers} Passenger${passengers > 1 ? 's' : ''}</span>
          <span class="metro-ticket-id">Ticket #${escapeHtml(ticket.ticketId)}</span>
        </div>
        <div class="metro-ticket-qr${status === 'active' ? ' metro-ticket-qr-active' : ''}">
          <canvas id="${canvasId}"></canvas>
          ${status === 'active' ? '<span class="qr-scan-line" aria-hidden="true"></span>' : ''}
        </div>
      </div>
      <div class="metro-ticket-status-row">
        <span class="metro-ticket-status ${status}">${statusLabel}</span>
        <div class="metro-ticket-actions">
          <button type="button" data-ticket-share="${escapeHtml(ticket.ticketId)}">Share</button>
          <button type="button" data-ticket-download="${escapeHtml(ticket.ticketId)}">Save ticket</button>
          ${!compact && status === 'active' && (isAdmin() || ticket.passengerId === state.currentUser?.userId) ? `<button type="button" data-ticket-cancel="${escapeHtml(ticket.ticketId)}">Cancel</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function mountTicketCanvases(container) {
  container.querySelectorAll('[data-ticket-card]').forEach((card) => {
    const canvas = card.querySelector('canvas');
    const ticketId = card.dataset.ticketCard;
    if (canvas) drawTicketQr(canvas, ticketId);
  });
  container.querySelectorAll('[data-ticket-cancel]').forEach((button) => {
    button.addEventListener('click', () => cancelTicket(button.dataset.ticketCancel));
  });
  container.querySelectorAll('[data-ticket-download]').forEach((button) => {
    button.addEventListener('click', () => downloadTicket(button.dataset.ticketDownload));
  });
  container.querySelectorAll('[data-ticket-share]').forEach((button) => {
    button.addEventListener('click', () => shareTicket(button.dataset.ticketShare));
  });
}

async function shareTicket(ticketId) {
  const ticket = state.tickets.find((item) => item.ticketId === ticketId);
  if (!ticket) { notify('Ticket could not be found.', true); return; }
  const details = `${stationName(ticket.sourceStationId)} → ${stationName(ticket.destStationId)} · ${formatDate(ticket.issueTime || ticket.createdAt)}`;
  const text = `MetroPass ticket ${ticket.ticketId}\n${details}\nValid until ${formatDate(ticket.validUntil)} ${formatTime(ticket.validUntil)}`;
  try {
    if (navigator.share) await navigator.share({ title: 'MetroPass ticket', text });
    else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); notify('Ticket details copied.'); }
    else { notify('Sharing is not available in this browser.', true); }
  } catch (error) {
    if (error?.name !== 'AbortError') notify('Could not share this ticket.', true);
  }
}

function downloadTicket(ticketId) {
  const ticket = state.tickets.find((item) => item.ticketId === ticketId);
  if (!ticket) { notify('Ticket could not be found.', true); return; }
  const payment = state.payments.find((item) => item.ticketId === ticketId);
  const fare = state.fares.find((item) => item.fareId === ticket.fareId);
  const amount = payment ? Number(payment.amount) : Number(fare?.baseFare || 0);
  const details = [
    ['Ticket ID', ticket.ticketId],
    ['Passenger ID', ticket.passengerId],
    ['Journey', `${stationName(ticket.sourceStationId)} → ${stationName(ticket.destStationId)}`],
    ['Ticket type', ticket.ticketType || 'SINGLE'],
    ['Passengers', Number(ticket.passengerCount || ticket._passengerCount || 1)],
    ['Amount', money(amount)],
    ['Paid with', paymentLabel(payment)],
    ['Issued', `${formatDate(ticket.issueTime || ticket.createdAt)} ${formatTime(ticket.issueTime || ticket.createdAt)}`],
    ['Valid until', `${formatDate(ticket.validUntil)} ${formatTime(ticket.validUntil)}`],
    ['Status', ticketStatus(ticket).toUpperCase()]
  ];
  const rows = details.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('');
  const documentHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MetroPass ${escapeHtml(ticket.ticketId)}</title><style>body{font:16px/1.5 Arial,sans-serif;background:#f3f5f8;color:#152033;padding:24px}main{max-width:680px;margin:auto;background:white;border:1px solid #dce2eb;border-radius:16px;padding:28px}h1{margin:0 0 4px;color:#155eef}p{color:#53627a}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid #e5e9f0}th{width:35%;color:#53627a}small{color:#64748b}@media print{body{background:white;padding:0}main{border:0;max-width:none}}</style></head><body><main><h1>MetroPass</h1><p>Digital metro ticket · ${escapeHtml(ticket.ticketId)}</p><table>${rows}</table><small>Academic project demo ticket. The visual ticket pattern is illustrative and is not a scannable transit credential.</small><p><button onclick="window.print()">Print / Save as PDF</button></p></main></body></html>`;
  const blob = new Blob([documentHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${ticket.ticketId}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Keep the object URL alive long enough for browsers to begin the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Ticket downloaded. Open it in a browser to print or save as PDF.');
}

/* ---------------- Selects ---------------- */
function fillSelect(selector, items, valueKey, labelFn, placeholder = 'Select') {
  const select = $(selector);
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>` + items.map((item) => (
    `<option value="${escapeHtml(item[valueKey])}">${escapeHtml(labelFn(item))}</option>`
  )).join('');
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function renumberRouteStopRows() {
  const rows = $$('#route-intermediate-list .route-stop-editor-row');
  rows.forEach((row, index) => {
    row.querySelector('.route-stop-editor-label').textContent = `Stop ${index + 1}`;
    row.querySelector('[data-stop-move="up"]').disabled = index === 0;
    row.querySelector('[data-stop-move="down"]').disabled = index === rows.length - 1;
  });
}

function addRouteStopEditorRow(value = '') {
  const list = $('#route-intermediate-list');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'route-stop-editor-row';
  const options = state.stations.filter((station) => station.isActive !== false).map((station) => (
    `<option value="${escapeHtml(station.stationId)}">${escapeHtml(station.stationCode || station.stationId)}</option>`
  )).join('');
  row.innerHTML = `<label><span class="route-stop-editor-label"></span><select data-route-stop-station><option value="">Choose station</option>${options}</select></label>
    <div class="route-stop-editor-actions"><button class="ghost-action" type="button" data-stop-move="up" aria-label="Move stop up">↑</button><button class="ghost-action" type="button" data-stop-move="down" aria-label="Move stop down">↓</button><button class="danger-action" type="button" data-stop-remove>Remove</button></div>`;
  list.appendChild(row);
  if (value) row.querySelector('[data-route-stop-station]').value = value;
  renumberRouteStopRows();
}

function populateSelects() {
  const activeStations = state.stations.filter((station) => station.isActive !== false);
  const stationLabel = (station) => station.stationCode || station.stationId;
  fillSelect('#journey-from', activeStations, 'stationId', stationLabel, 'Select station');
  fillSelect('#journey-to', activeStations, 'stationId', stationLabel, 'Select station');
  fillSelect('#booking-from', activeStations, 'stationId', stationLabel, 'Select station');
  fillSelect('#booking-to', activeStations, 'stationId', stationLabel, 'Select station');
  fillSelect('#admin-fare-from', activeStations, 'stationId', stationLabel, 'From station');
  fillSelect('#admin-fare-to', activeStations, 'stationId', stationLabel, 'To station');
  fillSelect('#booking-passenger', state.users.filter((user) => user.role !== 'ADMIN' && user.isActive !== false), 'userId', displayName, 'Passenger');
  fillSelect('#schedule-train', state.trains.filter((train) => train.isActive !== false), 'trainId', (train) => train.trainNumber || train.trainId, 'Train');
  fillSelect('#schedule-route', state.routes, 'routeId', (route) => route.routeName || route.routeId, 'Route');
  fillSelect('#route-start', activeStations, 'stationId', stationLabel, 'Start station');
  fillSelect('#route-end', activeStations, 'stationId', stationLabel, 'End station');
  fillSelect('#route-station-route', state.routes, 'routeId', (route) => route.routeName || route.routeId, 'Route');
  fillSelect('#route-station-station', activeStations, 'stationId', stationLabel, 'Station');
  fillSelect('#metrocard-passenger', state.users.filter((user) => user.role !== 'ADMIN' && user.isActive !== false), 'userId', displayName, 'Passenger');
  fillSelect('#admin-user-station', activeStations, 'stationId', stationLabel, 'No assigned station');
  fillSelect('#maintenance-train', state.trains, 'trainId', (train) => train.trainNumber || train.trainId, 'Train (optional)');
  fillSelect('#maintenance-station', activeStations, 'stationId', stationLabel, 'Station (optional)');
}

/* ---------------- Navigation ---------------- */
const PASSENGER_NAV = [
  { view: 'dashboard', label: 'Home', icon: '🏠' },
  { view: 'book', label: 'Book Ticket', icon: '🎫' },
  { view: 'tickets', label: 'My Tickets', icon: '🎟' },
  { view: 'network', label: 'Network', icon: '🗺' },
  { view: 'card', label: 'Metro Card', icon: '💳' },
  { view: 'profile', label: 'Profile', icon: '👤' }
];

const ADMIN_NAV = [
  { group: 'Overview' },
  { view: 'admin-dashboard', label: 'Dashboard', icon: '📊' },
  { group: 'Network' },
  { view: 'admin-stations', label: 'Stations', icon: '📍' },
  { view: 'admin-routes', label: 'Routes', icon: '🛤' },
  { view: 'admin-trains', label: 'Trains', icon: '🚆' },
  { view: 'admin-schedules', label: 'Schedules', icon: '🗓' },
  { group: 'Ticketing' },
  { view: 'book', label: 'Issue Ticket', icon: '🎫' },
  { view: 'admin-tickets', label: 'Tickets', icon: '🎫' },
  { view: 'admin-payments', label: 'Payments', icon: '💰' },
  { view: 'admin-fares', label: 'Fares', icon: '🧾' },
  { view: 'admin-cards', label: 'Metro Cards', icon: '💳' },
  { group: 'Management' },
  { view: 'admin-users', label: 'Users', icon: '👥' },
  { view: 'admin-maintenance', label: 'Maintenance', icon: '🛠' }
];

function navItems() { return isAdmin() ? ADMIN_NAV : PASSENGER_NAV; }
function allowedViews() { return navItems().filter((item) => item.view).map((item) => item.view); }

function renderNav() {
  $('#nav-list').innerHTML = navItems().map((item) => item.group
    ? `<p class="nav-group-label">${escapeHtml(item.group)}</p>`
    : `<a class="nav-item" href="#${item.view}" data-view="${item.view}"><span class="nav-icon">${item.icon}</span><span>${escapeHtml(item.label)}</span></a>`
  ).join('');
  $$('.nav-item').forEach((item) => item.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(item.dataset.view);
    closeSidebar();
  }));
}

function setupShell() {
  const signedIn = Boolean(state.currentUser);
  $('#auth-screen').classList.toggle('hidden', signedIn);
  $('#app-shell').classList.toggle('hidden', !signedIn);
  // The auth screen always shows the night scene for contrast against its
  // white sign-in copy; once inside the app, the scene follows the theme.
  document.documentElement.setAttribute('data-scene-day', signedIn ? '1' : '0');
  if (!signedIn) return;

  $('#account-name').textContent = displayName(state.currentUser);
  $('#account-id').textContent = state.currentUser.userId;
  $('#account-role').textContent = isAdmin() ? 'Admin' : 'Passenger';
  $('#today-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#quick-book-label').textContent = isAdmin() ? 'Issue ticket' : 'Book a ticket';
  $('#quick-book-button').classList.remove('hidden');
  $('#booking-passenger-wrap').classList.toggle('hidden', !isAdmin());

  renderNav();
}

