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
  try { localStorage.setItem('metroTheme', theme); } catch (e) {}
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

const api = async (resource, options = {}) => {
  const response = await fetch(`/api/${resource}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = text;
    try {
      const body = JSON.parse(text);
      detail = body.message || body.detail || body.error || text;
    } catch {}
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return response.status === 204 ? null : response.json();
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
        ${compact ? '' : `<div class="metro-ticket-actions">
          <button type="button" data-ticket-download="${escapeHtml(ticket.ticketId)}">Download</button>
          ${status === 'active' && (isAdmin() || ticket.passengerId === state.currentUser?.userId) ? `<button type="button" data-ticket-cancel="${escapeHtml(ticket.ticketId)}">Cancel</button>` : ''}
        </div>`}
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

/* ---------------- Dashboard ---------------- */
function renderJourneyCard() {
  const from = $('#journey-from').value;
  const to = $('#journey-to').value;
  const summary = $('#journey-summary');
  const submit = $('#journey-submit');
  if (from && to && from !== to) {
    summary.hidden = false;
    $('#journey-summary-from').textContent = stationName(from);
    $('#journey-summary-to').textContent = stationName(to);
    const count = Number($('#journey-passengers').value || 1);
    const type = $('#journey-type').value || 'SINGLE';
    const pricing = calculateBookingFare(from, to, type, count);
    const estimate = estimateStops(from, to);
    $('#journey-summary-fare').textContent = pricing ? money(pricing.total) : (estimate.count ? 'Fare not set' : 'No connected route');
    $('#journey-summary-time').textContent = estimate.minutes ? `${estimate.minutes} min` : '—';
    $('#journey-summary-stops').textContent = estimate.count ?? '—';
    submit.disabled = !pricing;
    submit.querySelector('span').textContent = pricing ? 'BUY TICKET →' : (estimate.count ? 'Fare not configured' : 'No connected route');
  } else {
    summary.hidden = true;
    submit.disabled = true;
    submit.querySelector('span').textContent = from === to && from ? 'Choose two different stations' : 'Select a journey';
  }
}

function renderStats() {
  const tickets = ticketPool();
  const revenue = state.payments
    .filter((payment) => tickets.some((ticket) => ticket.ticketId === payment.ticketId))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const myCard = state.metroCards.find((card) => card.passengerId === state.currentUser?.userId);
  const stats = [
    ['Active tickets', tickets.filter((t) => ticketStatus(t) === 'active').length],
    ['Total tickets', tickets.length],
    ['Metro card balance', myCard ? money(myCard.balance) : '—'],
    ['Total spent', money(revenue)]
  ];
  $('#stats-grid').innerHTML = stats.map(([label, value], i) => (
    `<article class="stat-card${i === 0 ? ' accent' : ''}"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`
  )).join('');
}

/* Deterministic small-int hash so a route's simulated "live" reading is stable within a
   given minute (changes as time passes) rather than jumping around on every re-render. */
function liveSeed(routeId) {
  const minuteBucket = Math.floor(Date.now() / 60000);
  let seed = minuteBucket;
  for (let i = 0; i < routeId.length; i++) seed = (seed * 31 + routeId.charCodeAt(i)) >>> 0;
  return seed;
}

function lineStatusRows(target, { live = false } = {}) {
  const rows = state.routes.map((route, i) => {
    const onThisRoute = state.maintenanceIssues.some((m) => m.status !== 'RESOLVED' &&
      state.routeStations.some((rs) => rs.routeId === route.routeId && rs.stationId === m.stationId));
    const status = onThisRoute ? 'maintenance' : 'operational';
    const color = route.lineColor || LINE_COLORS[i % LINE_COLORS.length];

    if (!live) {
      return `
        <div class="line-status-row">
          <span class="line-dot" style="background:${escapeHtml(color)}"></span>
          <strong>${escapeHtml(route.routeName || route.routeId)}</strong>
          <span class="status-tag ${status}">${status === 'operational' ? 'Operational' : 'Maintenance'}</span>
        </div>`;
    }

    // Live-network reading: simulated (no live train-position feed exists), but stable
    // within a minute and clearly not claiming to be dispatch data.
    const seed = liveSeed(route.routeId);
    const delayMins = status === 'maintenance' ? null : (seed % 6 === 0 ? 1 + (seed % 4) : 0);
    const nextTrainMins = 1 + (seed % 8);
    const bars = status === 'maintenance' ? 1 : (delayMins ? 2 : 3);
    return `
      <div class="live-line-row">
        <span class="line-dot" style="background:${escapeHtml(color)}"></span>
        <strong>${escapeHtml(route.routeName || route.routeId)}</strong>
        <span class="live-signal" aria-hidden="true">${'●'.repeat(bars)}${'○'.repeat(3 - bars)}</span>
        <span class="status-tag ${status === 'maintenance' ? 'maintenance' : (delayMins ? 'delayed' : 'operational')}">
          ${status === 'maintenance' ? 'Maintenance' : delayMins ? `${delayMins} min delay` : 'On time'}
        </span>
      </div>`;
  }).join('');
  $(target).innerHTML = rows || '<p class="empty-state">No routes configured.</p>';
}

function renderNetworkStatusSummary() {
  lineStatusRows('#network-status-list', { live: true });
  const anyIssue = state.maintenanceIssues.some((m) => m.status !== 'RESOLVED');
  const pill = $('#network-status-pill');
  pill.textContent = anyIssue ? 'Some lines under maintenance' : 'All systems operational';
  pill.classList.toggle('status-ok', !anyIssue);
  pill.style.background = anyIssue ? 'var(--amber-soft)' : '';
  pill.style.color = anyIssue ? 'var(--amber)' : '';

  // "Next train at <station>" line — picks the nearest upcoming simulated departure.
  const nextLine = $('#next-train-line');
  if (nextLine) {
    if (!state.routes.length || !state.stations.length) {
      nextLine.textContent = '';
    } else {
      const best = state.routes.reduce((min, route) => {
        const mins = 1 + (liveSeed(route.routeId) % 8);
        return mins < min.mins ? { route, mins } : min;
      }, { route: state.routes[0], mins: 1 + (liveSeed(state.routes[0].routeId) % 8) });
      const stop = state.routeStations.find((rs) => rs.routeId === best.route.routeId && rs.sequenceNumber === 0)
        || state.routeStations.find((rs) => rs.routeId === best.route.routeId);
      const stationLabel = stop ? stationName(stop.stationId) : (best.route.routeName || best.route.routeId);
      nextLine.textContent = `Next train at ${stationLabel} — ${best.mins} min`;
    }
  }
}

function renderRecent(listSelector = '#recent-list', titleSelector = '#activity-title') {
  const titleEl = $(titleSelector);
  if (titleEl) titleEl.textContent = isAdmin() ? 'Recent tickets' : 'My recent tickets';
  const rows = [...ticketPool()].sort((a, b) => new Date(b.createdAt || b.issueTime) - new Date(a.createdAt || a.issueTime)).slice(0, 5);
  $(listSelector).innerHTML = rows.length ? rows.map((ticket) => `
    <div class="activity-row">
      <div><strong>${escapeHtml(stationName(ticket.sourceStationId))} → ${escapeHtml(stationName(ticket.destStationId))}</strong><small>${escapeHtml(ticket.ticketId)} · ${formatDate(ticket.issueTime || ticket.createdAt)}</small></div>
      <span class="fare-chip">${escapeHtml(ticket.ticketType || 'SINGLE')}</span>
    </div>
  `).join('') : '<p class="empty-state">No tickets yet — book your first journey.</p>';
}

/* ---------------- Tickets page ---------------- */
function renderTicketsPage(filter = '') {
  const normalized = filter.toLowerCase();
  const pool = ticketPool();
  const active = pool.filter((t) => ticketStatus(t) === 'active');
  $('#active-tickets-row').innerHTML = active.length
    ? active.map((t) => ticketCardHtml(t)).join('')
    : '<p class="empty-state">No active tickets. Book a journey to get moving.</p>';
  mountTicketCanvases($('#active-tickets-row'));

  const rows = pool.filter((ticket) => `${ticket.ticketId} ${ticket.passengerId} ${stationName(ticket.sourceStationId)} ${stationName(ticket.destStationId)}`.toLowerCase().includes(normalized));
  $('#ticket-count').textContent = `${rows.length} ticket${rows.length === 1 ? '' : 's'}`;
  $$('.admin-only').forEach((element) => element.classList.toggle('hidden', !isAdmin()));
  $('#tickets-table').innerHTML = rows.length ? rows.map((ticket) => {
    const fare = state.fares.find((f) => f.fareId === ticket.fareId);
    const payment = state.payments.find((p) => p.ticketId === ticket.ticketId);
    const status = ticketStatus(ticket);
    return `
    <tr>
      <td><strong>${escapeHtml(ticket.ticketId)}</strong><small>${escapeHtml(ticket.ticketType || 'SINGLE')}</small></td>
      <td>${escapeHtml(stationName(ticket.sourceStationId))} → ${escapeHtml(stationName(ticket.destStationId))}</td>
      <td>${formatDate(ticket.issueTime || ticket.createdAt)}</td>
      <td>${money(payment?.amount ?? fare?.baseFare ?? 0)}</td>
      <td><span class="badge ${status === 'active' ? 'good' : 'muted'}">${status.toUpperCase()}</span></td>
      <td class="${isAdmin() ? '' : 'hidden'}"><button class="danger-action" type="button" data-delete-ticket="${escapeHtml(ticket.ticketId)}">Delete</button></td>
    </tr>
  `; }).join('') : '<tr><td colspan="6" class="empty-state">No tickets found.</td></tr>';
  $$('[data-delete-ticket]').forEach((button) => button.addEventListener('click', () => deleteTicket(button.dataset.deleteTicket)));
}

/* ---------------- Network page ---------------- */
function renderNetwork() {
  $('#station-count').textContent = `${state.stations.length} stations`;
  $('#station-list').innerHTML = state.stations.map((station) => `
    <div class="stack-item" data-station-row="${escapeHtml(station.stationId)}" style="cursor:pointer">
      <span class="color-dot" style="background:${escapeHtml(station.lineColor || '#2563EB')}"></span>
      <div><strong>${escapeHtml(station.stationCode || station.stationId)}</strong><small>${escapeHtml(station.address || 'No address')} · ${station.isActive === false ? 'Closed' : 'Open'}</small></div>
    </div>
  `).join('') || '<p class="empty-state">No stations configured.</p>';
  $$('[data-station-row]').forEach((row) => {
    row.addEventListener('click', () => openStationPanel(row.dataset.stationRow));
  });

  renderNetworkSvg('#network-map');
  renderNetworkSelectionSummary();
}

/* Routes a given station belongs to, in sequence order along each route. */
function routesForStation(stationId) {
  return state.routes.filter((route) =>
    state.routeStations.some((rs) => rs.routeId === route.routeId && rs.stationId === stationId));
}

/* Shortest path across line interchanges. Adjacent stops on the same route form edges. */
function pathBetween(from, to) {
  if (!from || !to || from === to) return null;
  const adjacency = new Map();
  const addEdge = (a, b, routeId) => {
    if (!adjacency.has(a)) adjacency.set(a, []);
    adjacency.get(a).push({ fromStationId: a, toStationId: b, routeId });
  };
  state.routes.forEach((route) => {
    const stops = state.routeStations.filter((item) => item.routeId === route.routeId)
      .sort((a, b) => Number(a.sequenceNumber || 0) - Number(b.sequenceNumber || 0));
    for (let index = 1; index < stops.length; index++) {
      const a = stops[index - 1].stationId;
      const b = stops[index].stationId;
      if (!a || !b || a === b) continue;
      if (stationById(a)?.isActive === false || stationById(b)?.isActive === false) continue;
      addEdge(a, b, route.routeId);
      addEdge(b, a, route.routeId);
    }
  });
  const queue = [from];
  const previous = new Map();
  const visited = new Set([from]);
  while (queue.length) {
    const current = queue.shift();
    if (current === to) break;
    for (const edge of adjacency.get(current) || []) {
      if (visited.has(edge.toStationId)) continue;
      visited.add(edge.toStationId);
      previous.set(edge.toStationId, edge);
      queue.push(edge.toStationId);
    }
  }
  if (!visited.has(to)) return null;
  const edges = [];
  let current = to;
  while (current !== from) {
    const edge = previous.get(current);
    if (!edge) return null;
    edges.push(edge);
    current = edge.fromStationId;
  }
  edges.reverse();
  const stationIds = [from, ...edges.map((edge) => edge.toStationId)];
  const legs = [];
  edges.forEach((edge) => {
    const last = legs[legs.length - 1];
    if (last && last.routeId === edge.routeId) last.stationIds.push(edge.toStationId);
    else legs.push({ routeId: edge.routeId, stationIds: [edge.fromStationId, edge.toStationId] });
  });
  const routeIds = [...new Set(edges.map((edge) => edge.routeId))];
  return { routeId: routeIds.length === 1 ? routeIds[0] : null, routeIds, stationIds, legs, edges };
}

function renderNetworkSvg(target) {
  const container = $(target);
  if (!container) return;
  const width = 640, height = 360;
  const routes = state.routes;

  if (!routes.length || !state.routeStations.length) {
    container.innerHTML = state.stations.length
      ? `<p class="empty-state">Add routes to see the line diagram.</p>`
      : `<p class="empty-state">No network data yet.</p>`;
    return;
  }

  const sel = state.networkSelection || {};
  const highlight = pathBetween(sel.from, sel.to);
  const highlightSet = highlight ? new Set(highlight.stationIds) : null;

  // Lay routes out as horizontal lanes; stations placed along each lane by sequence.
  const laneGap = height / (routes.length + 1);
  const stationPositions = {};
  let svgLines = '';
  let svgStations = '';

  routes.forEach((route, i) => {
    const stops = state.routeStations.filter((rs) => rs.routeId === route.routeId)
      .sort((a, b) => Number(a.sequenceNumber || 0) - Number(b.sequenceNumber || 0));
    if (!stops.length) return;
    const y = laneGap * (i + 1);
    const stepX = (width - 100) / Math.max(stops.length - 1, 1);
    const color = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(route.lineColor || '')) ? route.lineColor : LINE_COLORS[i % LINE_COLORS.length];
    const routeLegs = (highlight?.legs || []).filter((leg) => leg.routeId === route.routeId);
    const isHighlightedRoute = routeLegs.length > 0;
    const dimmed = Boolean(highlight && !isHighlightedRoute);
    const points = stops.map((stop, idx) => {
      const x = 60 + idx * stepX;
      if (!stationPositions[stop.stationId]) stationPositions[stop.stationId] = [];
      stationPositions[stop.stationId].push({ x, y, color, routeId: route.routeId });
      return `${x},${y}`;
    });
    svgLines += `<polyline data-route="${escapeHtml(route.routeId)}" points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="${isHighlightedRoute ? 7 : 5}" stroke-linecap="round" stroke-linejoin="round" opacity="${dimmed ? 0.22 : 0.85}" class="${isHighlightedRoute ? 'network-line-active' : ''}" />`;
    routeLegs.forEach((leg) => {
      const segIdx = leg.stationIds.map((sid) => stops.findIndex((stop) => stop.stationId === sid)).filter((idx) => idx >= 0);
      if (segIdx.length > 1) {
        const segPoints = segIdx.map((idx) => `${60 + idx * stepX},${y}`);
        svgLines += `<polyline points="${segPoints.join(' ')}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" class="network-segment-highlight" />`;
      }
    });
  });

  Object.entries(stationPositions).forEach(([stationId, positions]) => {
    const station = stationById(stationId);
    const label = station?.stationCode || stationId;
    const closed = station?.isActive === false;
    const onPath = highlightSet && highlightSet.has(stationId);
    const isEndpoint = stationId === sel.from || stationId === sel.to;
    const dimmed = highlight && !onPath;
    positions.forEach((pos) => {
      svgStations += `
        <g class="network-node${onPath ? ' network-node-active' : ''}${dimmed ? ' network-node-dim' : ''}" data-station="${escapeHtml(stationId)}">
          <circle cx="${pos.x}" cy="${pos.y}" r="${isEndpoint ? 9 : 7}" fill="${closed ? '#94a3b8' : (isEndpoint ? pos.color : 'white')}" stroke="${pos.color}" stroke-width="3.5" />
          <text class="network-station-label" x="${pos.x}" y="${pos.y - 14}" text-anchor="middle">${escapeHtml(label)}</text>
        </g>`;
    });
  });

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Metro network diagram">${svgLines}${svgStations}</svg>`;
  container.querySelectorAll('[data-station]').forEach((node) => {
    node.addEventListener('click', () => openStationPanel(node.dataset.station));
  });
}

/* ---------------- Station info panel ---------------- */
function scheduleOffsetAtStation(schedule, stationId) {
  if (!stationId) return 0;
  const stops = state.routeStations.filter((item) => item.routeId === schedule.routeId)
    .sort((a, b) => Number(a.sequenceNumber || 0) - Number(b.sequenceNumber || 0));
  const stationIndex = stops.findIndex((item) => item.stationId === stationId);
  if (stationIndex < 0 || stops.length < 2) return 0;
  const scheduledStart = parseDateValue(schedule.scheduledDeparture);
  const scheduledEnd = parseDateValue(schedule.scheduledArrival);
  const route = state.routes.find((item) => item.routeId === schedule.routeId);
  const scheduledDuration = scheduledStart && scheduledEnd && !Number.isNaN(scheduledStart.getTime())
    && !Number.isNaN(scheduledEnd.getTime()) && scheduledEnd > scheduledStart
    ? (scheduledEnd.getTime() - scheduledStart.getTime()) / 60000
    : Number(route?.estimatedTime) || 0;
  return Math.max(0, Math.round(scheduledDuration * stationIndex / (stops.length - 1)));
}

function nextScheduleDeparture(schedule, now = new Date(), stationId = null) {
  if (schedule.isActive === false) return null;
  const source = parseDateValue(schedule.scheduledDeparture);
  if (!source || Number.isNaN(source.getTime())) return null;
  const weekdayNames = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const wantedDay = String(schedule.dayOfWeek || weekdayNames[source.getDay()]).toUpperCase();
  const validFrom = schedule.validFrom ? parseDateValue(schedule.validFrom) : null;
  const validTo = schedule.validTo ? parseDateValue(schedule.validTo) : null;
  const stationOffset = scheduleOffsetAtStation(schedule, stationId);
  for (let offset = 0; offset <= 7; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 0, 0, 0, 0);
    if (weekdayNames[day.getDay()] !== wantedDay) continue;
    if (validFrom && day < new Date(validFrom.getFullYear(), validFrom.getMonth(), validFrom.getDate())) continue;
    if (validTo && day > new Date(validTo.getFullYear(), validTo.getMonth(), validTo.getDate())) continue;
    const routeDeparture = new Date(day.getFullYear(), day.getMonth(), day.getDate(), source.getHours(), source.getMinutes(), source.getSeconds(), 0);
    const stationDeparture = new Date(routeDeparture.getTime() + stationOffset * 60000);
    if (stationDeparture >= now) return stationDeparture;
  }
  return null;
}

function openStationPanel(stationId) {
  const station = stationById(stationId);
  if (!station) return;
  const lines = routesForStation(stationId);
  const isInterchange = lines.length > 1;
  const now = new Date();
  const lineIds = new Set(lines.map((route) => route.routeId));
  const scheduledOnRoute = state.schedules.filter((schedule) => lineIds.has(schedule.routeId)
    && state.trains.some((train) => train.trainId === schedule.trainId && train.isActive !== false))
    .map((schedule) => ({ schedule, departure: nextScheduleDeparture(schedule, now, stationId) }))
    .filter((item) => item.departure)
    .sort((a, b) => a.departure - b.departure)
    .slice(0, 3);

  let nextTrainsHtml;
  if (station.isActive === false) {
    nextTrainsHtml = '<p class="empty-state">This station is closed. No departures are available.</p>';
  } else if (scheduledOnRoute.length) {
    nextTrainsHtml = scheduledOnRoute.map(({ schedule, departure }) =>
      `<div class="next-train-row"><span>${escapeHtml(routeName(schedule.routeId))} · ${escapeHtml(trainName(schedule.trainId))}</span><strong>${departure.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</strong></div>`).join('');
  } else if (!state.schedules.some((schedule) => lineIds.has(schedule.routeId))) {
    nextTrainsHtml = [4, 12, 20].map((mins) => {
      const t = new Date(now.getTime() + mins * 60000);
      return `<div class="next-train-row"><span>Est. arrival</span><strong>${formatTime(t)}</strong></div>`;
    }).join('') + '<p class="next-train-note">Illustrative — no timetable has been configured.</p>';
  } else {
    nextTrainsHtml = '<p class="empty-state">No upcoming departures are available within the schedule validity period.</p>';
  }

  $('#station-panel-body').innerHTML = `
    <div class="station-panel-head">
      <div>
        <h3>${escapeHtml(station.stationCode || station.stationId)}</h3>
        <p>${escapeHtml(station.address || 'No address on file')}</p>
      </div>
      <button class="icon-button" type="button" id="station-panel-close" aria-label="Close">✕</button>
    </div>
    <div class="station-panel-lines">
      ${lines.length ? lines.map((r) => `<span class="line-chip" style="--chip-color:${escapeHtml(r.lineColor || '#2563EB')}">${escapeHtml(r.routeName || r.routeId)}</span>`).join('') : '<span class="empty-state">Not on any route yet</span>'}
      ${isInterchange ? '<span class="interchange-chip">🔁 Interchange</span>' : ''}
    </div>
    <div class="station-panel-status">${station.isActive === false ? '🔴 Closed' : '🟢 Open'}</div>
    <div class="station-panel-trains">
      <p class="eyebrow">Next trains</p>
      ${nextTrainsHtml}
    </div>
    <div class="station-panel-actions">
      <button class="ghost-action" type="button" id="station-panel-from">Set as source</button>
      <button class="ghost-action" type="button" id="station-panel-to">Set as destination</button>
      <button class="primary-action" type="button" id="station-panel-start">Start journey</button>
    </div>
  `;

  $('#station-panel-close').addEventListener('click', closeStationPanel);
  $('#station-panel-from').addEventListener('click', () => { setNetworkSelection({ from: stationId }); closeStationPanel(); });
  $('#station-panel-to').addEventListener('click', () => { setNetworkSelection({ to: stationId }); closeStationPanel(); });
  $('#station-panel-start').addEventListener('click', () => {
    $('#journey-from').value = stationId;
    renderJourneyCard();
    closeStationPanel();
    navigate('book');
    requestAnimationFrame(() => {
      $('#booking-from').value = stationId;
      $('#booking-to').value = '';
      if (isAdmin() && !$('#booking-passenger').value) {
        $('#booking-passenger').value = state.users.find((user) => user.role !== 'ADMIN' && user.isActive !== false)?.userId || '';
      }
      goToBookingStep(1);
      updateRouteRecap();
      updateFareBreakdown();
    });
    notify(`${station.stationCode || stationId} set as your starting station`);
  });

  $('#station-panel').classList.add('open');
  $('#station-panel-scrim').classList.add('show');
}

function closeStationPanel() {
  $('#station-panel')?.classList.remove('open');
  $('#station-panel-scrim')?.classList.remove('show');
}

function setNetworkSelection(partial) {
  state.networkSelection = { ...(state.networkSelection || {}), ...partial };
  renderNetworkSvg('#network-map');
  renderNetworkSelectionSummary();
}

function clearNetworkSelection() {
  state.networkSelection = {};
  renderNetworkSvg('#network-map');
  renderNetworkSelectionSummary();
}

function renderNetworkSelectionSummary() {
  const el = $('#network-selection-summary');
  if (!el) return;
  const sel = state.networkSelection || {};
  if (!sel.from && !sel.to) {
    el.innerHTML = `<p class="empty-state">Click two stations, or use a station's panel, to preview a route here.</p>`;
    return;
  }
  const path = pathBetween(sel.from, sel.to);
  const fromLabel = sel.from ? stationName(sel.from) : 'Select a station';
  const toLabel = sel.to ? stationName(sel.to) : 'Select a station';
  const est = sel.from && sel.to ? estimateStops(sel.from, sel.to) : { count: null, minutes: null };
  const pricing = sel.from && sel.to ? calculateBookingFare(sel.from, sel.to, 'SINGLE', 1) : null;
  el.innerHTML = `
    <div class="route-recap"><strong>${escapeHtml(fromLabel)}</strong><span class="route-arrow">→</span><strong>${escapeHtml(toLabel)}</strong></div>
    ${sel.from && sel.to ? `
      <div class="journey-summary-stats">
        <div><strong>${pricing ? money(pricing.total) : '—'}</strong><span>One-way fare</span></div>
        <div><strong>${est.minutes ? est.minutes + ' min' : '—'}</strong><span>Journey time</span></div>
        <div><strong>${est.count ?? '—'}</strong><span>Stations</span></div>
      </div>
      ${path ? (path.legs.length > 1 ? `<p class="empty-state">Transfer via ${path.legs.slice(0, -1).map((leg) => escapeHtml(stationName(leg.stationIds[leg.stationIds.length - 1]))).join(' → ')}.</p>` : '') : '<p class="empty-state">No connected route exists between these stations.</p>'}
      ${path && !pricing ? '<p class="empty-state">A fare is missing for this journey.</p>' : ''}
      <div class="step-actions">
        <button class="ghost-action" type="button" id="network-selection-clear">Clear</button>
        <button class="primary-action" type="button" id="network-selection-book" ${path && pricing ? '' : 'disabled'}>Book this journey</button>
      </div>` : `<div class="step-actions"><button class="ghost-action" type="button" id="network-selection-clear">Clear</button></div>`}
  `;
  const clearBtn = $('#network-selection-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearNetworkSelection);
  const bookBtn = $('#network-selection-book');
  if (bookBtn) bookBtn.addEventListener('click', () => {
    if (!path || !pricing) return;
    $('#journey-from').value = sel.from;
    $('#journey-to').value = sel.to;
    renderJourneyCard();
    navigate('book');
    requestAnimationFrame(() => {
      $('#booking-from').value = sel.from;
      $('#booking-to').value = sel.to;
      $('#booking-type').value = 'SINGLE';
      $('#booking-passenger-count').value = '1';
      if (isAdmin() && !$('#booking-passenger').value) {
        $('#booking-passenger').value = state.users.find((user) => user.role !== 'ADMIN' && user.isActive !== false)?.userId || '';
      }
      goToBookingStep(1);
      updateRouteRecap();
      updateFareBreakdown();
      updatePaymentSummary();
    });
  });
}

/* ---------------- Metro card / profile ---------------- */
function renderMetroCard() {
  const card = state.metroCards.find((c) => c.passengerId === state.currentUser?.userId);
  const slot = $('#metrocard-slot');
  if (!card) {
    slot.innerHTML = `<p class="empty-state">No metro card on file yet. Ask at any station counter to get one issued.</p>`;
    return;
  }
  slot.innerHTML = `
    <div class="wallet-card">
      <div class="wallet-card-top"><strong>METROPASS CARD</strong><span class="wallet-chip"></span></div>
      <p class="wallet-balance-label">Available balance</p>
      <div class="wallet-balance">${money(card.balance)}</div>
      <div class="wallet-card-bottom">
        <div>Card ID<strong>${escapeHtml(card.cardId)}</strong></div>
        <div>Expires<strong>${formatDate(card.expiryDate)}</strong></div>
        <div>Status<strong>${card.isActive === false ? 'Inactive' : 'Active'}</strong></div>
      </div>
    </div>
  `;
}

function renderProfile() {
  const user = state.users.find((u) => u.userId === state.currentUser?.userId) || state.currentUser;
  const rows = [
    ['Name', displayName(user)],
    ['User ID', user.userId],
    ['Contact', user.contact || '—'],
    ['Role', user.role === 'ADMIN' ? 'Admin' : 'Passenger'],
    ['Registered', formatDate(user.registrationDate)],
    ['Status', user.isActive === false ? 'Inactive' : 'Active']
  ];
  $('#profile-panel').innerHTML = rows.map(([label, value]) => `
    <div class="profile-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>
  `).join('');
}

/* ---------------- Admin pages ---------------- */
function renderAdminDashboard() {
  const currentTicketIds = new Set(state.tickets.map((ticket) => ticket.ticketId));
  const revenue = state.payments.filter((payment) => currentTicketIds.has(payment.ticketId))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const stats = [
    ['Passengers', state.users.filter((u) => u.role !== 'ADMIN').length],
    ['Tickets issued', state.tickets.length],
    ['Revenue', money(revenue)]
  ];
  $('#admin-stats-grid').innerHTML = stats.map(([label, value], i) => (
    `<article class="stat-card${i === 2 ? ' accent' : ''}"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`
  )).join('');
  lineStatusRows('#admin-line-status');
  renderRecent('#admin-recent-list', null);
}

function renderAdminStations(filter = '') {
  const normalized = filter.toLowerCase();
  const rows = state.stations.filter((s) => `${s.stationId} ${s.stationCode} ${s.address}`.toLowerCase().includes(normalized));
  $('#admin-station-count').textContent = `${rows.length} station${rows.length === 1 ? '' : 's'}`;
  $('#admin-stations-table').innerHTML = rows.length ? rows.map((station) => `
    <tr>
      <td><span class="color-dot" style="display:inline-block;margin-right:8px;background:${escapeHtml(station.lineColor || '#2563EB')}"></span><strong style="display:inline">${escapeHtml(station.stationCode || station.stationId)}</strong><small>${escapeHtml(station.stationId)}</small></td>
      <td>${escapeHtml(station.address || '-')}</td>
      <td><span style="display:inline-flex;align-items:center;gap:6px"><span class="color-dot" style="background:${escapeHtml(station.lineColor || '#2563EB')}"></span></span></td>
      <td><span class="badge ${station.isActive === false ? 'muted' : 'good'}">${station.isActive === false ? 'Closed' : 'Open'}</span></td>
      <td><div class="row-actions"><button class="text-action" type="button" data-admin-action="edit-station" data-id="${escapeHtml(station.stationId)}">Edit</button><button class="text-action" type="button" data-admin-action="toggle-station" data-id="${escapeHtml(station.stationId)}">${station.isActive === false ? 'Open' : 'Close'}</button><button class="danger-action" type="button" data-admin-action="delete-station" data-id="${escapeHtml(station.stationId)}">Delete</button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No stations found.</td></tr>';
}

function renderAdminRoutes() {
  $('#admin-routes-table').innerHTML = state.routes.length ? state.routes.map((route) => `
    <tr>
      <td><span class="color-dot" style="display:inline-block;margin-right:8px;background:${escapeHtml(route.lineColor || '#2563EB')}"></span><strong style="display:inline">${escapeHtml(route.routeName || route.routeId)}</strong></td>
      <td>${escapeHtml(stationName(route.startStationId))} → ${escapeHtml(stationName(route.endStationId))}</td>
      <td>${route.totalDistance ? `${route.totalDistance} km` : '-'}</td>
      <td>${route.estimatedTime ? `${route.estimatedTime} min` : '-'}</td>
      <td><div class="row-actions"><button class="text-action" type="button" data-admin-action="edit-route" data-id="${escapeHtml(route.routeId)}">Edit</button><button class="danger-action" type="button" data-admin-action="delete-route" data-id="${escapeHtml(route.routeId)}">Delete</button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No routes configured.</td></tr>';
}

function renderAdminTickets(filter = '') {
  const normalized = filter.toLowerCase();
  const rows = state.tickets.filter((ticket) => `${ticket.ticketId} ${ticket.passengerId} ${stationName(ticket.sourceStationId)} ${stationName(ticket.destStationId)}`.toLowerCase().includes(normalized));
  $('#admin-ticket-count').textContent = `${rows.length} ticket${rows.length === 1 ? '' : 's'}`;
  $('#admin-tickets-table').innerHTML = rows.length ? rows.map((ticket) => {
    const status = ticketStatus(ticket);
    return `
    <tr>
      <td><strong>${escapeHtml(ticket.ticketId)}</strong><small>${escapeHtml(ticket.ticketType || 'SINGLE')}</small></td>
      <td>${escapeHtml(ticket.passengerId)}</td>
      <td>${escapeHtml(stationName(ticket.sourceStationId))} → ${escapeHtml(stationName(ticket.destStationId))}</td>
      <td>${formatDate(ticket.issueTime || ticket.createdAt)}</td>
      <td><span class="badge ${status === 'active' ? 'good' : 'muted'}">${status.toUpperCase()}</span></td>
      <td><button class="danger-action" type="button" data-delete-ticket="${escapeHtml(ticket.ticketId)}">Delete</button></td>
    </tr>
  `; }).join('') : '<tr><td colspan="6" class="empty-state">No tickets found.</td></tr>';
  $$('[data-delete-ticket]').forEach((button) => button.addEventListener('click', () => deleteTicket(button.dataset.deleteTicket)));
}

function renderAdminPayments() {
  const activeTicketIds = new Set(state.tickets.map((ticket) => ticket.ticketId));
  const rows = state.payments.filter((payment) => activeTicketIds.has(payment.ticketId))
    .sort((a, b) => parseDateValue(b.createdAt) - parseDateValue(a.createdAt));
  $('#payments-table').innerHTML = rows.length ? rows.map((payment) => `
    <tr>
      <td><strong>${escapeHtml(payment.paymentId)}</strong></td>
      <td>${escapeHtml(payment.ticketId)}</td>
      <td>${money(payment.amount)}</td>
      <td>${formatDate(payment.createdAt)}</td>
    </tr>
  `).join('') : '<tr><td colspan="4" class="empty-state">No payments recorded.</td></tr>';
}

function renderAdminFares() {
  $('#fares-table').innerHTML = state.fares.length ? state.fares.map((fare) => `
    <tr>
      <td><strong>${escapeHtml(fare.fareId)}</strong></td>
      <td>${escapeHtml(stationName(fare.sourceStationId))} → ${escapeHtml(stationName(fare.destStationId))}</td>
      <td>${money(fare.baseFare)}</td>
      <td><div class="row-actions"><button class="text-action" type="button" data-admin-action="edit-fare" data-id="${escapeHtml(fare.fareId)}">Edit</button><button class="danger-action" type="button" data-admin-action="delete-fare" data-id="${escapeHtml(fare.fareId)}">Delete</button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="4" class="empty-state">No fares configured.</td></tr>';
}

function renderUsers(filter = '') {
  const normalized = filter.toLowerCase();
  const rows = state.users.filter((user) => `${user.userId} ${displayName(user)} ${user.contact} ${user.role}`.toLowerCase().includes(normalized));
  $('#user-count').textContent = `${rows.length} user${rows.length === 1 ? '' : 's'}`;
  $('#users-table').innerHTML = rows.length ? rows.map((user) => `
    <tr>
      <td><strong>${escapeHtml(displayName(user))}</strong><small>${escapeHtml(user.userId)}</small></td>
      <td>${escapeHtml(user.contact || '-')}</td>
      <td>${escapeHtml(user.role || 'USER')}</td>
      <td>${formatDate(user.registrationDate)}</td>
      <td><span class="badge ${user.isActive === false ? 'muted' : 'good'}">${user.isActive === false ? 'Inactive' : 'Active'}</span></td>
      <td><div class="row-actions"><button class="text-action" type="button" data-admin-action="edit-user" data-id="${escapeHtml(user.userId)}">Edit</button><button class="text-action" type="button" data-admin-action="toggle-user" data-id="${escapeHtml(user.userId)}">${user.isActive === false ? 'Activate' : 'Deactivate'}</button><button class="danger-action" type="button" data-admin-action="delete-user" data-id="${escapeHtml(user.userId)}">Delete</button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-state">No users found.</td></tr>';
}

function renderOperations() {
  $('#trains-table').innerHTML = state.trains.length ? state.trains.map((train) => `
    <tr>
      <td><strong>${escapeHtml(train.trainNumber || train.trainId)}</strong><small>${escapeHtml(train.trainId)}</small></td>
      <td>${escapeHtml(train.capacity ?? '-')}</td>
      <td>${escapeHtml(train.totalCoaches ?? '-')}</td>
      <td>${escapeHtml(train.manufactureYear ?? '-')}</td>
      <td><span class="badge ${train.isActive === false ? 'muted' : 'good'}">${train.isActive === false ? 'Inactive' : 'Active'}</span></td>
      <td><div class="row-actions"><button class="text-action" type="button" data-admin-action="edit-train" data-id="${escapeHtml(train.trainId)}">Edit</button><button class="text-action" type="button" data-admin-action="toggle-train" data-id="${escapeHtml(train.trainId)}">${train.isActive === false ? 'Activate' : 'Deactivate'}</button><button class="danger-action" type="button" data-admin-action="delete-train" data-id="${escapeHtml(train.trainId)}">Delete</button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-state">No trains configured.</td></tr>';

  $('#schedules-table').innerHTML = state.schedules.length ? state.schedules.map((schedule) => `
    <tr>
      <td><strong>${escapeHtml(schedule.scheduleId)}</strong></td>
      <td>${escapeHtml(trainName(schedule.trainId))}</td>
      <td>${escapeHtml(routeName(schedule.routeId))}</td>
      <td>${escapeHtml(schedule.dayOfWeek || '-')}</td>
      <td>${schedule.scheduledDeparture ? `${formatDate(schedule.scheduledDeparture)} ${formatTime(schedule.scheduledDeparture)}` : '-'}</td>
      <td><div class="row-actions"><button class="text-action" type="button" data-admin-action="edit-schedule" data-id="${escapeHtml(schedule.scheduleId)}">Edit</button><button class="text-action" type="button" data-admin-action="toggle-schedule" data-id="${escapeHtml(schedule.scheduleId)}">${schedule.isActive === false ? 'Activate' : 'Deactivate'}</button><button class="danger-action" type="button" data-admin-action="delete-schedule" data-id="${escapeHtml(schedule.scheduleId)}">Delete</button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-state">No schedules configured.</td></tr>';

  $('#metrocards-table').innerHTML = state.metroCards.length ? state.metroCards.map((card) => `
    <tr>
      <td><strong>${escapeHtml(card.cardId)}</strong></td>
      <td>${escapeHtml(displayName(state.users.find((user) => user.userId === card.passengerId)) || card.passengerId)}</td>
      <td>${money(card.balance)}</td>
      <td>${formatDate(card.expiryDate)}</td>
      <td><span class="badge ${card.isActive === false ? 'muted' : 'good'}">${card.isActive === false ? 'Inactive' : 'Active'}</span></td>
      <td><div class="row-actions"><button class="text-action" type="button" data-admin-action="edit-card" data-id="${escapeHtml(card.cardId)}">Edit</button><button class="text-action" type="button" data-admin-action="toggle-card" data-id="${escapeHtml(card.cardId)}">${card.isActive === false ? 'Activate' : 'Deactivate'}</button><button class="danger-action" type="button" data-admin-action="delete-card" data-id="${escapeHtml(card.cardId)}">Delete</button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-state">No metro cards issued.</td></tr>';

  $('#maintenance-table').innerHTML = state.maintenanceIssues.length ? state.maintenanceIssues.map((issue) => `
    <tr>
      <td><strong>${escapeHtml(issue.issueId)}</strong><small>${formatDate(issue.createdAt)}</small></td>
      <td>${escapeHtml(issue.trainId ? trainName(issue.trainId) : '-')}${issue.stationId ? ` / ${escapeHtml(stationName(issue.stationId))}` : ''}</td>
      <td>${escapeHtml(issue.issueType || '-')}</td>
      <td><span class="fare-chip">${escapeHtml(issue.priority || '-')}</span></td>
      <td><span class="badge ${issue.status === 'RESOLVED' ? 'good' : 'muted'}">${escapeHtml(issue.status || 'OPEN')}</span></td>
      <td><div class="row-actions"><button class="text-action" type="button" data-admin-action="edit-issue" data-id="${escapeHtml(issue.issueId)}">Edit</button>${issue.status === 'RESOLVED' ? '' : `<button class="text-action" type="button" data-admin-action="resolve-issue" data-id="${escapeHtml(issue.issueId)}">Resolve</button>`}<button class="danger-action" type="button" data-admin-action="delete-issue" data-id="${escapeHtml(issue.issueId)}">Delete</button></div></td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-state">No maintenance issues logged.</td></tr>';
}

function renderRouteStations() {
  const tbody = $('#route-stations-table');
  if (!tbody) return;
  const rows = [...state.routeStations].sort((a, b) => String(a.routeId).localeCompare(String(b.routeId))
    || Number(a.sequenceNumber || 0) - Number(b.sequenceNumber || 0));
  tbody.innerHTML = rows.length ? rows.map((item) => `
    <tr>
      <td>${escapeHtml(routeName(item.routeId))}<small>${escapeHtml(item.routeId)}</small></td>
      <td>${escapeHtml(stationName(item.stationId))}<small>${escapeHtml(item.stationId)}</small></td>
      <td>${escapeHtml(item.sequenceNumber ?? '-')}</td>
      <td><button class="danger-action" type="button" data-admin-action="delete-route-station" data-id="${escapeHtml(item.id)}">Remove stop</button></td>
    </tr>
  `).join('') : '<tr><td colspan="4" class="empty-state">No route station mappings configured.</td></tr>';
}

/* ---------------- Refresh / load ---------------- */
function refreshAll() {
  if (!state.currentUser) return;
  setupShell();
  populateSelects();
  renderJourneyCard();
  renderStats();
  renderNetworkStatusSummary();
  renderRecent();
  renderTicketsPage($('#ticket-search')?.value || '');
  renderNetwork();
  renderMetroCard();
  renderProfile();

  if (isAdmin()) {
    renderAdminDashboard();
    renderAdminStations($('#admin-station-search')?.value || '');
    renderAdminRoutes();
    renderRouteStations();
    renderAdminTickets($('#admin-ticket-search')?.value || '');
    renderAdminPayments();
    renderAdminFares();
    renderUsers($('#user-search')?.value || '');
    renderOperations();
  }

  updateBookingPreview();
}

async function loadData() {
  if (!state.currentUser) {
    setupShell();
    return;
  }
  try {
    const values = await Promise.all(resources.map((resource) => api(resource)));
    resources.forEach((resource, index) => { state[resource] = values[index] || []; });
    const currentUser = state.users.find((user) => user.userId === state.currentUser?.userId);
    if (currentUser) {
      state.currentUser = currentUser;
      localStorage.setItem('metroUser', JSON.stringify(currentUser));
    }
    const opsValues = await Promise.all(opsResources.map((resource) => api(resourceEndpoints[resource])));
    opsResources.forEach((resource, index) => { state[resource] = opsValues[index] || []; });
    refreshAll();
    navigate(location.hash.slice(1) || 'dashboard');
  } catch (error) {
    throw new Error(`Could not load metro data: ${error.message}`);
  }
}

/* ---------------- Nav / routing ---------------- */
function navigate(view) {
  if (!state.currentUser) return;
  const allowed = allowedViews();
  const nextView = allowed.includes(view) ? view : allowed[0];
  $$('.view').forEach((element) => element.classList.toggle('active-view', element.id === `view-${nextView}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === nextView));
  const found = navItems().find((item) => item.view === nextView);
  $('#view-title').textContent = found ? found.label : 'Dashboard';
  if (location.hash.slice(1) !== nextView) location.hash = nextView;
  if (nextView !== 'network') closeStationPanel();
  setSceneView(nextView);
}

function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebar-scrim').classList.add('show'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-scrim').classList.remove('show'); }

/* ---------------- Auth ---------------- */
async function signIn(userId, password) {
  const user = await api('auth/signin', { method: 'POST', body: JSON.stringify({ userId, password }) });
  state.currentUser = user;
  localStorage.setItem('metroUser', JSON.stringify(user));
  try {
    await loadData();
  } catch (error) {
    state.currentUser = null;
    localStorage.removeItem('metroUser');
    setupShell();
    throw error;
  }
  notify(`Signed in as ${displayName(user)}`);
}

async function signUp(payload) {
  const user = await api('auth/signup', { method: 'POST', body: JSON.stringify(payload) });
  state.currentUser = user;
  localStorage.setItem('metroUser', JSON.stringify(user));
  try {
    await loadData();
  } catch (error) {
    state.currentUser = null;
    localStorage.removeItem('metroUser');
    setupShell();
    throw error;
  }
  notify('Account created');
}

/* ---------------- Booking stepper ---------------- */
function goToBookingStep(step) {
  state.bookingStep = step;
  $$('.booking-step').forEach((el) => el.classList.toggle('active-step', Number(el.dataset.bookingStep) === step));
  $$('#booking-steps-rail .step-dot').forEach((dot) => {
    const dotStep = Number(dot.dataset.step);
    dot.classList.toggle('active', dotStep === step);
    dot.classList.toggle('done', dotStep < step);
  });
  if (step >= 2) updateRouteRecap();
  if (step >= 3) updateFareBreakdown();
  if (step >= 4) updatePaymentSummary();
}

function currentBookingRoute() {
  return { from: $('#booking-from').value, to: $('#booking-to').value };
}

function updateRouteRecap() {
  const { from, to } = currentBookingRoute();
  const html = from && to ? `<strong>${escapeHtml(stationName(from))}</strong><span class="route-arrow">→</span><strong>${escapeHtml(stationName(to))}</strong>` : 'No journey selected';
  ['#route-recap-2', '#route-recap-3', '#route-recap-4'].forEach((sel) => { const el = $(sel); if (el) el.innerHTML = html; });
}

function updateFareBreakdown() {
  const { from, to } = currentBookingRoute();
  const type = $('#booking-type').value || 'SINGLE';
  const count = Number($('#booking-passenger-count').value || 1);
  const pricing = calculateBookingFare(from, to, type, count);
  const validity = ticketValidityLabel(type);
  if (!pricing) {
    $('#fare-breakdown-rows').innerHTML = '<tr><td colspan="2">No connected route or valid fare is configured for this journey.</td></tr>';
    $('#fare-total').textContent = 'Unavailable';
    $('#booking-amount').value = '';
    return;
  }
  $('#fare-breakdown-rows').innerHTML = `
    <tr><td>${escapeHtml(pricing.label)} per passenger</td><td>${money(pricing.perPassenger)}</td></tr>
    ${pricing.isEstimatedFromSegments ? `<tr><td>Fare calculated from route segments</td><td>${money(pricing.oneWayFare)} one way</td></tr>` : ''}
    <tr><td>Passengers</td><td>× ${pricing.passengerCount}</td></tr>
    <tr><td>Validity</td><td>${escapeHtml(validity)}</td></tr>
  `;
  $('#fare-total').textContent = money(pricing.total);
  $('#booking-amount').value = pricing.total.toFixed(2);
}

function updatePaymentSummary() {
  $('#payment-amount').textContent = money(Number($('#booking-amount').value || 0));
}

function updateBookingPreview() {
  if ($('#booking-from') && $('#booking-to')) updateRouteRecap();
}

function resetBookingForm() {
  $('#booking-form').reset();
  goToBookingStep(1);
  $('#booking-step1-error').textContent = '';
}

/* ---------------- Ticket creation ---------------- */
async function createTicket() {
  const from = $('#booking-from').value;
  const to = $('#booking-to').value;
  const passengerId = isAdmin() ? $('#booking-passenger').value : state.currentUser?.userId;
  if (!passengerId) throw new Error('Select a passenger before issuing a ticket.');
  if (!from || !to || from === to) throw new Error('Choose two different stations.');
  const passengerCount = Number($('#booking-passenger-count').value || 1);
  const ticketType = $('#booking-type').value || 'SINGLE';
  const pricing = calculateBookingFare(from, to, ticketType, passengerCount);
  if (!pricing) throw new Error('No connected route or valid fare is configured for this journey.');
  const result = await api('bookings', {
    method: 'POST',
    body: JSON.stringify({ passengerId, sourceStationId: from, destStationId: to, ticketType, passengerCount })
  });
  const created = result.ticket;
  const payment = result.payment;
  const amount = Number(result.amount);
  if (!created || !payment || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('The booking service returned an incomplete booking. Please refresh before retrying.');
  }
  state.payments = [...state.payments.filter((item) => item.paymentId !== payment.paymentId), payment];
  state.tickets = [...state.tickets.filter((item) => item.ticketId !== created.ticketId), created];
  refreshAll();
  showTicketSuccess(created, amount);
  resetBookingForm();
  notify('Ticket issued successfully');
}

function showTicketSuccess(ticket, amount) {
  const stage = $('#success-stage');
  const reveal = $('#ticket-reveal-stage');
  const amountEl = $('#success-amount');
  const routeEl = $('#success-route');

  amountEl.textContent = money(amount ?? 0);
  routeEl.textContent = `${stationName(ticket.sourceStationId)} → ${stationName(ticket.destStationId)}`;

  // Reset to the success (pre-reveal) stage every time this view is entered.
  stage.classList.remove('success-stage-exit');
  reveal.hidden = true;
  reveal.classList.remove('ticket-reveal-in');

  $('#success-ticket-slot').innerHTML = ticketCardHtml(ticket, { compact: true });
  mountTicketCanvases($('#success-ticket-slot'));

  $$('.view').forEach((element) => element.classList.toggle('active-view', element.id === 'view-ticket-success'));
  $$('.nav-item').forEach((item) => item.classList.remove('active'));

  // Hold on the success confirmation briefly, then slide/fade the ticket into view.
  clearTimeout(showTicketSuccess._timer);
  showTicketSuccess._timer = setTimeout(() => {
    stage.classList.add('success-stage-exit');
    reveal.hidden = false;
    requestAnimationFrame(() => reveal.classList.add('ticket-reveal-in'));
  }, 900);
}

async function deleteTicket(ticketId) {
  if (!confirm(`Delete ticket ${ticketId}?`)) return;
  await api(`tickets/${encodeURIComponent(ticketId)}`, { method: 'DELETE' });
  state.tickets = state.tickets.filter((ticket) => ticket.ticketId !== ticketId);
  state.payments = state.payments.filter((payment) => payment.ticketId !== ticketId);
  refreshAll();
  notify('Ticket and its demo payment record deleted');
}

async function cancelTicket(ticketId) {
  if (!confirm(`Cancel ticket ${ticketId}?`)) return;
  await api(`tickets/${encodeURIComponent(ticketId)}`, { method: 'DELETE' });
  state.tickets = state.tickets.filter((ticket) => ticket.ticketId !== ticketId);
  state.payments = state.payments.filter((payment) => payment.ticketId !== ticketId);
  refreshAll();
  notify('Ticket cancelled and demo payment record removed');
}

/* ---------------- Home journey planner → prefill booking ---------------- */
function startBookingFromJourney() {
  const from = $('#journey-from').value;
  const to = $('#journey-to').value;
  if (!from || !to || from === to) return;
  navigate('book');
  requestAnimationFrame(() => {
    $('#booking-from').value = from;
    $('#booking-to').value = to;
    $('#booking-type').value = $('#journey-type').value;
    $('#booking-passenger-count').value = $('#journey-passengers').value;
    goToBookingStep(1);
    updateRouteRecap();
  });
}

/* ---------------- Admin row actions ---------------- */
function askText(label, currentValue) {
  const value = window.prompt(label, currentValue == null ? '' : String(currentValue));
  return value === null ? null : value.trim();
}

async function deleteIfUnreferenced(resource, id, references, description) {
  if (references.some((items) => items.some((item) => item === id))) {
    notify(`This ${description} is already in use. Deactivate it instead of deleting it.`, true);
    return false;
  }
  if (!window.confirm(`Delete ${description} "${id}"? This cannot be undone.`)) return false;
  await api(`${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return true;
}

async function runAdminAction(action, id) {
  const station = state.stations.find((item) => item.stationId === id);
  const route = state.routes.find((item) => item.routeId === id);
  const train = state.trains.find((item) => item.trainId === id);
  const schedule = state.schedules.find((item) => item.scheduleId === id);
  const fare = state.fares.find((item) => item.fareId === id);
  const user = state.users.find((item) => item.userId === id);
  const card = state.metroCards.find((item) => item.cardId === id);
  const issue = state.maintenanceIssues.find((item) => item.issueId === id);
  let changed = false;
  const sendUpdate = async (resource, key, item, values) => api(`${resource}/${encodeURIComponent(key)}`, {
    method: 'PUT', body: JSON.stringify({ ...item, ...values })
  });

  switch (action) {
    case 'edit-station': {
      if (!station) break;
      const stationCode = askText('Station code', station.stationCode);
      if (stationCode === null) return;
      const address = askText('Station address', station.address || '');
      if (address === null) return;
      const lineColor = askText('Line colour (hex, e.g. #2563EB)', station.lineColor || '#2563EB');
      if (lineColor === null) return;
      if (!stationCode || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(lineColor)) { notify('Enter a station code and a valid hex colour.', true); return; }
      await sendUpdate('stations', id, station, { stationCode, address, lineColor }); changed = true; break;
    }
    case 'toggle-station':
      if (!station) break;
      await sendUpdate('stations', id, station, { isActive: station.isActive === false }); changed = true; break;
    case 'delete-station': {
      if (!station) break;
      const referenced = [
        state.tickets.some((item) => item.sourceStationId === id || item.destStationId === id),
        state.fares.some((item) => item.sourceStationId === id || item.destStationId === id),
        state.routeStations.some((item) => item.stationId === id),
        state.routes.some((item) => item.startStationId === id || item.endStationId === id),
        state.maintenanceIssues.some((item) => item.stationId === id),
        state.metroCards.some((item) => item.stationId === id)
      ];
      if (referenced.some(Boolean)) { notify('This station is referenced by existing records. Close it instead of deleting it.', true); return; }
      if (!window.confirm(`Delete station "${station.stationCode || id}"?`)) return;
      await api(`stations/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    }
    case 'edit-route': {
      if (!route) break;
      const routeNameValue = askText('Route name', route.routeName);
      if (routeNameValue === null) return;
      const distanceText = askText('Total distance (km)', route.totalDistance);
      if (distanceText === null) return;
      const timeText = askText('Estimated duration (minutes)', route.estimatedTime);
      if (timeText === null) return;
      const lineColor = askText('Line colour (hex)', route.lineColor || '#2563EB');
      if (lineColor === null) return;
      const totalDistance = Number(distanceText), estimatedTime = Number(timeText);
      if (!routeNameValue || !Number.isFinite(totalDistance) || totalDistance <= 0 || !Number.isInteger(estimatedTime) || estimatedTime <= 0 || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(lineColor)) {
        notify('Enter a route name, positive distance and duration, and a valid hex colour.', true); return;
      }
      await sendUpdate('routes', id, route, { routeName: routeNameValue, totalDistance, estimatedTime, lineColor, updatedAt: localDateTimeString() }); changed = true; break;
    }
    case 'delete-route': {
      if (!route) break;
      if (!window.confirm(`Delete route "${route.routeName || id}" and its schedules and station mappings?`)) return;
      for (const item of state.schedules.filter((entry) => entry.routeId === id)) await api(`schedules/${encodeURIComponent(item.scheduleId)}`, { method: 'DELETE' });
      for (const item of state.routeStations.filter((entry) => entry.routeId === id)) await api(`route-stations/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      await api(`routes/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    }
    case 'delete-route-station': {
      const mapping = state.routeStations.find((item) => String(item.id) === String(id));
      if (!mapping) break;
      const siblings = state.routeStations.filter((item) => item.routeId === mapping.routeId)
        .sort((a, b) => Number(a.sequenceNumber || 0) - Number(b.sequenceNumber || 0));
      if (siblings.length <= 2 || mapping.id === siblings[0].id || mapping.id === siblings[siblings.length - 1].id) {
        notify('Keep at least two endpoint stops. Delete or edit the route if its endpoints need to change.', true); return;
      }
      if (!window.confirm(`Remove ${stationName(mapping.stationId)} from ${routeName(mapping.routeId)}?`)) return;
      await api(`routes/${encodeURIComponent(mapping.routeId)}/stops/${encodeURIComponent(mapping.id)}`, { method: 'DELETE' }); changed = true; break;
    }
    case 'edit-train': {
      if (!train) break;
      const trainNumber = askText('Train number', train.trainNumber);
      if (trainNumber === null) return;
      const capacity = Number(askText('Capacity', train.capacity));
      const coaches = Number(askText('Number of coaches', train.totalCoaches));
      const year = Number(askText('Manufacture year', train.manufactureYear));
      if (!trainNumber || !Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(coaches) || coaches < 1 || !Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) {
        notify('Enter a valid train number, positive capacity/coaches, and a valid manufacture year.', true); return;
      }
      await sendUpdate('trains', id, train, { trainNumber, capacity, totalCoaches: coaches, manufactureYear: year }); changed = true; break;
    }
    case 'toggle-train':
      if (!train) break;
      await sendUpdate('trains', id, train, { isActive: train.isActive === false }); changed = true; break;
    case 'delete-train': {
      if (!train) break;
      if (state.schedules.some((item) => item.trainId === id) || state.maintenanceIssues.some((item) => item.trainId === id)) {
        notify('This train is referenced by schedules or maintenance issues. Deactivate it instead of deleting it.', true); return;
      }
      if (!window.confirm(`Delete train "${train.trainNumber || id}"?`)) return;
      await api(`trains/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    }
    case 'edit-schedule': {
      if (!schedule) break;
      const dayOptions = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
      const dayOfWeek = (askText(`Day of week (${dayOptions.join('/')})`, schedule.dayOfWeek) || '').toUpperCase();
      if (!dayOptions.includes(dayOfWeek)) { notify('Choose a valid weekday name.', true); return; }
      const existingDep = String(schedule.scheduledDeparture || '').slice(0,16);
      const existingArr = String(schedule.scheduledArrival || '').slice(0,16);
      const departureValue = askText('Departure (YYYY-MM-DDTHH:mm)', existingDep);
      if (departureValue === null) return;
      const arrivalValue = askText('Arrival (YYYY-MM-DDTHH:mm)', existingArr);
      if (arrivalValue === null) return;
      const departure = parseDateValue(departureValue), arrival = parseDateValue(arrivalValue);
      if (!departure || !arrival || Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime()) || arrival <= departure) { notify('Enter valid local departure and later arrival times.', true); return; }
      const actualDay = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][departure.getDay()];
      if (actualDay !== dayOfWeek) { notify(`The departure date falls on ${actualDay}; choose that weekday or change the date.`, true); return; }
      const validFrom = askText('Valid from (YYYY-MM-DD)', schedule.validFrom || localDateString(departure));
      if (validFrom === null) return;
      const validTo = askText('Valid through (YYYY-MM-DD)', schedule.validTo || '');
      if (validTo === null) return;
      if (!isValidDateOnly(validFrom) || (validTo && !isValidDateOnly(validTo)) || (validTo && parseDateValue(validTo) < parseDateValue(validFrom))) { notify('Enter valid schedule dates, and ensure valid through is not before valid from.', true); return; }
      await sendUpdate('schedules', id, schedule, { dayOfWeek, scheduledDeparture: localDateTimeString(departure), scheduledArrival: localDateTimeString(arrival), validFrom, validTo: validTo || null }); changed = true; break;
    }
    case 'toggle-schedule':
      if (!schedule) break;
      await sendUpdate('schedules', id, schedule, { isActive: schedule.isActive === false }); changed = true; break;
    case 'delete-schedule':
      if (!schedule) break;
      if (!window.confirm(`Delete schedule "${id}"?`)) return;
      await api(`schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    case 'edit-fare': {
      if (!fare) break;
      const sources = state.stations.filter((item) => item.isActive !== false);
      const sourcePrompt = `Source station ID (${sources.map((item) => item.stationId).join(', ')})`;
      const sourceStationId = askText(sourcePrompt, fare.sourceStationId);
      if (sourceStationId === null) return;
      const destStationId = askText(`Destination station ID (${sources.map((item) => item.stationId).join(', ')})`, fare.destStationId);
      if (destStationId === null) return;
      const amountText = askText('Fare amount (₹)', fare.baseFare);
      if (amountText === null) return;
      const baseFare = Number(amountText);
      if (!sources.some((item) => item.stationId === sourceStationId) || !sources.some((item) => item.stationId === destStationId) || sourceStationId === destStationId || !Number.isFinite(baseFare) || baseFare <= 0) {
        notify('Choose two different active stations and a positive fare.', true); return;
      }
      await sendUpdate('fares', id, fare, { sourceStationId, destStationId, baseFare }); changed = true; break;
    }
    case 'delete-fare':
      if (!fare) break;
      if (state.tickets.some((item) => item.fareId === id)) { notify('This fare is used by existing tickets. Keep it so ticket history stays readable.', true); return; }
      if (!window.confirm(`Delete fare "${id}"?`)) return;
      await api(`fares/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    case 'edit-user': {
      if (!user) break;
      const firstName = askText('First name', user.firstName || '');
      if (firstName === null) return;
      const lastName = askText('Last name', user.lastName || '');
      if (lastName === null) return;
      const contact = askText('Contact / email', user.contact || '');
      if (contact === null) return;
      const role = (askText('Role (USER or ADMIN)', user.role || 'USER') || '').toUpperCase();
      if (!['USER','ADMIN'].includes(role) || !firstName || !lastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) { notify('Enter first name, last name, a valid email, and role USER or ADMIN.', true); return; }
      await sendUpdate('users', id, user, { firstName, lastName, contact, role }); changed = true; break;
    }
    case 'toggle-user':
      if (!user) break;
      if (user.userId === state.currentUser?.userId && user.isActive !== false) { notify('You cannot deactivate the account you are currently using.', true); return; }
      await sendUpdate('users', id, user, { isActive: user.isActive === false }); changed = true; break;
    case 'delete-user': {
      if (!user) break;
      if (user.userId === state.currentUser?.userId) { notify('You cannot delete the account you are currently using.', true); return; }
      if (state.tickets.some((item) => item.passengerId === id) || state.metroCards.some((item) => item.passengerId === id) || state.maintenanceIssues.some((item) => item.reportedBy === id)) {
        notify('This user has tickets, a metro card, or maintenance reports. Deactivate the account instead of deleting it.', true); return;
      }
      if (!window.confirm(`Delete user "${displayName(user)}" (${id})?`)) return;
      await api(`users/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    }
    case 'edit-card': {
      if (!card) break;
      const passengers = state.users.filter((item) => item.role !== 'ADMIN' && item.isActive !== false);
      const passengerId = askText(`Passenger ID (${passengers.map((item) => item.userId).join(', ')})`, card.passengerId);
      if (passengerId === null) return;
      const balanceText = askText('Card balance (₹)', card.balance);
      if (balanceText === null) return;
      const expiryDate = askText('Expiry date (YYYY-MM-DD)', card.expiryDate);
      if (expiryDate === null) return;
      const balance = Number(balanceText);
      if (!passengers.some((item) => item.userId === passengerId) || !Number.isFinite(balance) || balance < 0 || !isValidDateOnly(expiryDate) || !isValidDateOnly(card.issueDate) || parseDateValue(expiryDate) < parseDateValue(card.issueDate)) {
        notify('Choose an existing passenger, non-negative balance, and valid expiry date.', true); return;
      }
      await sendUpdate('metro-cards', id, card, { passengerId, balance, expiryDate }); changed = true; break;
    }
    case 'toggle-card':
      if (!card) break;
      await sendUpdate('metro-cards', id, card, { isActive: card.isActive === false }); changed = true; break;
    case 'delete-card':
      if (!card) break;
      if (!window.confirm(`Delete metro card "${id}"?`)) return;
      await api(`metro-cards/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    case 'edit-issue': {
      if (!issue) break;
      const issueType = askText('Issue type', issue.issueType || '');
      if (issueType === null) return;
      const description = askText('Description', issue.description || '');
      if (description === null) return;
      const priority = (askText('Priority (LOW, MEDIUM, HIGH)', issue.priority || 'MEDIUM') || '').toUpperCase();
      const status = (askText('Status (OPEN, IN_PROGRESS, RESOLVED)', issue.status || 'OPEN') || '').toUpperCase();
      if (!issueType || !description || !['LOW','MEDIUM','HIGH'].includes(priority) || !['OPEN','IN_PROGRESS','RESOLVED'].includes(status)) { notify('Enter a description and valid priority and status.', true); return; }
      await sendUpdate('maintenance-issues', id, issue, { issueType, description, priority, status, resolvedAt: status === 'RESOLVED' ? (issue.resolvedAt || localDateTimeString()) : null }); changed = true; break;
    }
    case 'resolve-issue':
      if (!issue) break;
      await sendUpdate('maintenance-issues', id, issue, { status: 'RESOLVED', resolvedAt: localDateTimeString() }); changed = true; break;
    case 'delete-issue':
      if (!issue) break;
      if (!window.confirm(`Delete maintenance issue "${id}"?`)) return;
      await api(`maintenance-issues/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    default:
      return;
  }
  if (changed) {
    await loadData();
    notify('Changes saved');
  }
}

/* ---------------- Event binding ---------------- */
function bindEvents() {
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-admin-action]');
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      await runAdminAction(button.dataset.adminAction, button.dataset.id);
    } catch (error) {
      notify(`Action failed: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  });

  // Auth tabs
  $$('.auth-tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.auth-tab').forEach((item) => item.classList.toggle('active', item === tab));
    $('.auth-tab.active')?.setAttribute('aria-selected', 'true');
    $$('.auth-form').forEach((form) => form.classList.toggle('active-auth-form', form.id === `${tab.dataset.authTab}-form`));
  }));

  $('#signin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#signin-error').textContent = '';
    try {
      await signIn($('#signin-user').value.trim(), $('#signin-password').value);
    } catch (error) {
      $('#signin-error').textContent = error.message?.startsWith('Could not load metro data')
        ? 'Could not load metro data. Please sign in again and retry.'
        : 'Invalid user ID or password.';
    }
  });

  $('#signup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#signup-error').textContent = '';
    try {
      await signUp({
        userId: $('#signup-user').value.trim(),
        firstName: $('#signup-first').value.trim(),
        lastName: $('#signup-last').value.trim(),
        contact: $('#signup-contact').value.trim(),
        password: $('#signup-password').value,
        role: $('#signup-role').value
      });
    } catch (error) {
      $('#signup-error').textContent = error.message || 'Could not create account.';
    }
  });

  $('#signup-role').addEventListener('change', () => {
    $('#signup-submit span').textContent = $('#signup-role').value === 'ADMIN'
      ? 'Create admin account'
      : 'Create passenger account';
  });

  $('#signout-button').addEventListener('click', () => {
    localStorage.removeItem('metroUser');
    state.currentUser = null;
    location.hash = '';
    setupShell();
  });

  // Mobile sidebar
  $('#menu-button').addEventListener('click', openSidebar);
  $('#sidebar-close').addEventListener('click', closeSidebar);
  $('#sidebar-scrim').addEventListener('click', closeSidebar);

  // Station info panel
  $('#station-panel-scrim')?.addEventListener('click', closeStationPanel);

  // Theme toggle
  $('#theme-toggle-auth')?.addEventListener('click', toggleTheme);
  $('#theme-toggle-sidebar')?.addEventListener('click', toggleTheme);

  $('#quick-book-button').addEventListener('click', () => { navigate('book'); resetBookingForm(); });
  $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.goView)));
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'dashboard'));

  // Home journey planner
  ['#journey-from', '#journey-to', '#journey-passengers', '#journey-type'].forEach((sel) => $(sel).addEventListener('change', renderJourneyCard));
  $('#journey-swap').addEventListener('click', () => {
    const from = $('#journey-from').value, to = $('#journey-to').value;
    $('#journey-from').value = to; $('#journey-to').value = from;
    renderJourneyCard();
  });
  $('#journey-form').addEventListener('submit', (event) => { event.preventDefault(); startBookingFromJourney(); });

  // Booking stepper
  $$('[data-step-next]').forEach((button) => button.addEventListener('click', () => {
    if (Number(button.dataset.stepNext) === 2) {
      const { from, to } = currentBookingRoute();
      if (isAdmin() && !$('#booking-passenger').value) {
        $('#booking-step1-error').textContent = 'Select a passenger to book for.';
        return;
      }
      if (!from || !to || from === to) {
        $('#booking-step1-error').textContent = 'Choose two different stations to continue.';
        return;
      }
      if (!pathBetween(from, to)) {
        $('#booking-step1-error').textContent = 'No connected route exists between these stations.';
        return;
      }
      $('#booking-step1-error').textContent = '';
    }
    if (Number(button.dataset.stepNext) === 4) {
      const pricing = calculateBookingFare($('#booking-from').value, $('#booking-to').value,
        $('#booking-type').value, Number($('#booking-passenger-count').value || 1));
      if (!pricing) {
        notify('A connected route and valid fare are required before checkout.', true);
        updateFareBreakdown();
        return;
      }
    }
    goToBookingStep(Number(button.dataset.stepNext));
  }));
  $$('[data-step-prev]').forEach((button) => button.addEventListener('click', () => goToBookingStep(Number(button.dataset.stepPrev))));
  $('#booking-swap').addEventListener('click', () => {
    const from = $('#booking-from').value, to = $('#booking-to').value;
    $('#booking-from').value = to; $('#booking-to').value = from;
    updateRouteRecap();
  });
  $('#booking-passenger-count').addEventListener('change', () => { updateFareBreakdown(); updatePaymentSummary(); });
  $('#booking-type').addEventListener('change', () => { updateRouteRecap(); updateFareBreakdown(); updatePaymentSummary(); });
  ['#booking-from', '#booking-to'].forEach((selector) => $(selector).addEventListener('change', () => { updateRouteRecap(); updateFareBreakdown(); updatePaymentSummary(); }));

  $('#booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await createTicket();
    } catch (error) {
      notify(`Ticket could not be issued: ${error.message}`, true);
    }
  });

  // Search inputs
  $('#ticket-search')?.addEventListener('input', (event) => renderTicketsPage(event.target.value));
  $('#admin-ticket-search')?.addEventListener('input', (event) => renderAdminTickets(event.target.value));
  $('#admin-station-search')?.addEventListener('input', (event) => renderAdminStations(event.target.value));
  $('#user-search')?.addEventListener('input', (event) => renderUsers(event.target.value));

  // Admin: route creation also creates ordered endpoint mappings.
  $('#route-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const routeId = $('#route-id').value.trim();
    const startStationId = $('#route-start').value;
    const endStationId = $('#route-end').value;
    const totalDistance = Number($('#route-distance').value);
    const estimatedTime = Number($('#route-time').value);
    if (!routeId || !$('#route-name').value.trim() || !startStationId || !endStationId || startStationId === endStationId
        || !Number.isFinite(totalDistance) || totalDistance <= 0
        || !Number.isInteger(estimatedTime) || estimatedTime <= 0) {
      notify('Enter a unique route ID, two different stations, positive distance, and positive whole-number duration.', true);
      return;
    }
    if (state.routes.some((route) => route.routeId === routeId)) {
      notify('That route ID already exists.', true);
      return;
    }
    if (state.routes.some((route) => route.routeName?.trim().toLowerCase() === $('#route-name').value.trim().toLowerCase())) {
      notify('A route with that name already exists.', true);
      return;
    }
    let createdRoute = null;
    const createdMappings = [];
    try {
      createdRoute = await api('routes', {
        method: 'POST',
        body: JSON.stringify({
          routeId,
          routeName: $('#route-name').value.trim(),
          startStationId,
          endStationId,
          totalDistance,
          estimatedTime,
          lineColor: $('#route-color').value,
          createdAt: localDateTimeString(),
          updatedAt: localDateTimeString()
        })
      });
      for (const [stationId, sequenceNumber] of [[startStationId, 1], [endStationId, 2]]) {
        createdMappings.push(await api('route-stations', {
          method: 'POST',
          body: JSON.stringify({ routeId, stationId, sequenceNumber })
        }));
      }
      event.target.reset();
      $('#route-color').value = '#7c3aed';
      await loadData();
      navigate('admin-routes');
      notify('Route and its endpoint stops saved. Add intermediate stops to complete the line.');
    } catch (error) {
      // Best-effort rollback if an endpoint mapping failed after route creation.
      for (const mapping of createdMappings.reverse()) {
        try { await api(`route-stations/${mapping.id}`, { method: 'DELETE' }); } catch {}
      }
      if (createdRoute) {
        try { await api(`routes/${encodeURIComponent(routeId)}`, { method: 'DELETE' }); } catch {}
      }
      notify(`Could not save route: ${error.message}`, true);
    }
  });

  // New route stops are inserted before the terminal station; the backend preserves sequence order transactionally.
  $('#route-station-route')?.addEventListener('change', () => {
    const routeId = $('#route-station-route').value;
    const highest = state.routeStations.filter((item) => item.routeId === routeId)
      .reduce((value, item) => Math.max(value, Number(item.sequenceNumber) || 0), 0);
    $('#route-station-sequence').min = '2';
    $('#route-station-sequence').max = String(Math.max(2, highest));
    $('#route-station-sequence').value = String(Math.max(2, highest));
  });
  $('#route-station-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const routeId = $('#route-station-route').value;
    const stationId = $('#route-station-station').value;
    const sequenceNumber = Number($('#route-station-sequence').value);
    if (!routeId || !stationId || !Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
      notify('Choose a route and station and enter a valid stop sequence.', true);
      return;
    }
    const routeStops = state.routeStations.filter((item) => item.routeId === routeId);
    if (routeStops.some((item) => item.stationId === stationId)) {
      notify('That station is already part of this route.', true);
      return;
    }
    if (routeStops.length < 2 || sequenceNumber < 2 || sequenceNumber > routeStops.length) {
      notify(`Choose a sequence between 2 and ${Math.max(2, routeStops.length)} to insert before the terminal station.`, true);
      return;
    }
    try {
      await api(`routes/${encodeURIComponent(routeId)}/stops`, {
        method: 'POST',
        body: JSON.stringify({ stationId, sequenceNumber })
      });
      event.target.reset();
      $('#route-station-sequence').value = '2';
      await loadData();
      navigate('admin-routes');
      notify('Stop inserted into route order');
    } catch (error) {
      notify(`Could not add route stop: ${error.message}`, true);
    }
  });

  // Admin: station
  $('#station-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const stationId = $('#station-id').value.trim();
      const stationCode = $('#station-code').value.trim();
      if (!stationId || !stationCode) { notify('Enter a station ID and name.', true); return; }
      if (state.stations.some((item) => item.stationId === stationId)) { notify('That station ID already exists.', true); return; }
      if (state.stations.some((item) => item.stationCode?.trim().toLowerCase() === stationCode.toLowerCase())) { notify('That station name already exists.', true); return; }
      const station = await api('stations', {
        method: 'POST',
        body: JSON.stringify({
          stationId,
          stationCode,
          address: $('#station-address').value.trim(),
          lineColor: $('#station-color').value,
          openedDate: localDateString(),
          isActive: true
        })
      });
      state.stations.push(station);
      event.target.reset();
      refreshAll();
      notify('Station saved');
    } catch (error) {
      notify(`Could not save station: ${error.message}`, true);
    }
  });

  // Admin: fare
  $('#fare-admin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const fareId = $('#fare-id').value.trim();
      const sourceStationId = $('#admin-fare-from').value;
      const destStationId = $('#admin-fare-to').value;
      const baseFare = Number($('#admin-fare-amount').value);
      if (!fareId || !sourceStationId || !destStationId || sourceStationId === destStationId || !Number.isFinite(baseFare) || baseFare <= 0) {
        notify('Enter a fare ID, two different stations, and a positive fare.', true); return;
      }
      if (state.fares.some((item) => item.fareId === fareId)) { notify('That fare ID already exists.', true); return; }
      if (state.fares.some((item) => (item.sourceStationId === sourceStationId && item.destStationId === destStationId)
          || (item.sourceStationId === destStationId && item.destStationId === sourceStationId))) {
        notify('A fare for this station pair already exists. Edit the existing fare instead.', true); return;
      }
      const fare = await api('fares', {
        method: 'POST',
        body: JSON.stringify({ fareId, sourceStationId, destStationId, baseFare })
      });
      state.fares.push(fare);
      event.target.reset();
      refreshAll();
      notify('Fare saved');
    } catch (error) {
      notify(`Could not save fare: ${error.message}`, true);
    }
  });

  // Admin: user
  $('#admin-user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const userId = $('#admin-user-id').value.trim();
    const nameParts = $('#admin-user-name').value.trim().split(/\s+/).filter(Boolean);
    const [firstName, ...rest] = nameParts;
    const lastName = rest.join(' ');
    const contact = $('#admin-user-contact').value.trim();
    const password = $('#admin-user-password').value;
    if (!userId || userId.length < 3 || !firstName || !lastName || !contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || password.length < 6) {
      notify('Enter a user ID (at least 3 characters), full name, valid email, and password (at least 6 characters).', true); return;
    }
    if (state.users.some((item) => item.userId === userId)) { notify('That user ID already exists.', true); return; }
    try {
      const user = await api('users', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          firstName,
          lastName,
          contact,
          role: $('#admin-user-role').value,
          password,
          registrationDate: localDateString(),
          isActive: true
        })
      });
      state.users.push(user);
      event.target.reset();
      refreshAll();
      notify('User saved');
    } catch (error) {
      notify(`Could not save user: ${error.message}`, true);
    }
  });

  // Admin: train
  $('#train-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const trainId = $('#train-id').value.trim();
    const trainNumber = $('#train-number').value.trim();
    const capacity = Number($('#train-capacity').value);
    const totalCoaches = Number($('#train-coaches').value);
    const manufactureYear = Number($('#train-year').value);
    if (!trainId || !trainNumber || !Number.isInteger(capacity) || capacity < 1 || !Number.isInteger(totalCoaches) || totalCoaches < 1
        || !Number.isInteger(manufactureYear) || manufactureYear < 1900 || manufactureYear > new Date().getFullYear() + 1) {
      notify('Enter a unique train ID and number, positive capacity/coaches, and a valid manufacture year.', true); return;
    }
    if (state.trains.some((item) => item.trainId === trainId)) { notify('That train ID already exists.', true); return; }
    if (state.trains.some((item) => item.trainNumber === trainNumber)) { notify('That train number already exists.', true); return; }
    try {
      const train = await api('trains', {
        method: 'POST',
        body: JSON.stringify({
          trainId,
          trainNumber,
          capacity,
          totalCoaches,
          manufactureYear,
          createdAt: localDateTimeString(),
          isActive: true
        })
      });
      state.trains.push(train);
      event.target.reset();
      refreshAll();
      notify('Train saved');
    } catch (error) {
      notify(`Could not save train: ${error.message}`, true);
    }
  });

  // Keep the weekday selector aligned with the chosen departure date.
  $('#schedule-departure')?.addEventListener('change', () => {
    const departure = parseDateValue($('#schedule-departure').value);
    if (!departure || Number.isNaN(departure.getTime())) return;
    $('#schedule-day').value = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][departure.getDay()];
    if (!$('#schedule-valid-to').value) {
      const fallbackEnd = new Date(departure.getTime());
      fallbackEnd.setMonth(fallbackEnd.getMonth() + 6);
      $('#schedule-valid-to').value = localDateString(fallbackEnd);
    }
  });

  // Admin: schedule
  $('#schedule-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const scheduleId = $('#schedule-id').value.trim();
      const trainId = $('#schedule-train').value;
      const routeId = $('#schedule-route').value;
      if (!scheduleId || !trainId || !routeId) {
        notify('Enter a schedule ID and select a train and route.', true); return;
      }
      if (state.schedules.some((item) => item.scheduleId === scheduleId)) {
        notify('That schedule ID already exists.', true); return;
      }
      if (!state.trains.some((item) => item.trainId === trainId && item.isActive !== false)
          || !state.routes.some((item) => item.routeId === routeId)) {
        notify('Choose an active train and an existing route.', true); return;
      }
      const departureValue = $('#schedule-departure').value;
      const arrivalValue = $('#schedule-arrival').value;
      const departure = parseDateValue(departureValue);
      const arrival = parseDateValue(arrivalValue);
      if (!departure || !arrival || Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime()) || arrival <= departure) {
        notify('Arrival must be later than departure.', true);
        return;
      }
      const selectedDay = $('#schedule-day').value;
      const departureDay = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][departure.getDay()];
      if (selectedDay !== departureDay) {
        notify(`The selected departure date is ${departureDay}. Choose that day of week or change the date.`, true);
        return;
      }
      const validFrom = localDateString(departure);
      const fallbackEnd = new Date(departure.getTime());
      fallbackEnd.setMonth(fallbackEnd.getMonth() + 6);
      const validTo = $('#schedule-valid-to').value || localDateString(fallbackEnd);
      if (parseDateValue(validTo) < parseDateValue(validFrom)) {
        notify('The schedule end date must be on or after its departure date.', true);
        return;
      }
      const schedule = await api('schedules', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId,
          trainId,
          routeId,
          dayOfWeek: selectedDay,
          scheduledDeparture: localDateTimeString(departure),
          scheduledArrival: localDateTimeString(arrival),
          validFrom,
          validTo,
          isActive: true,
          createdAt: localDateTimeString()
        })
      });
      state.schedules.push(schedule);
      event.target.reset();
      $('#schedule-valid-to').value = '';
      refreshAll();
      notify('Schedule saved');
    } catch (error) {
      notify(`Could not save schedule: ${error.message}`, true);
    }
  });

  // Admin: metro card
  $('#metrocard-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const cardId = $('#metrocard-id').value.trim();
    const passengerId = $('#metrocard-passenger').value;
    const balance = Number($('#metrocard-balance').value);
    const passenger = state.users.find((item) => item.userId === passengerId && item.role !== 'ADMIN' && item.isActive !== false);
    if (!cardId || !passenger || !Number.isFinite(balance) || balance < 0) {
      notify('Enter a card ID, choose an active passenger, and provide a non-negative opening balance.', true); return;
    }
    if (state.metroCards.some((item) => item.cardId === cardId)) { notify('That metro card ID already exists.', true); return; }
    if (state.metroCards.some((item) => item.passengerId === passengerId && item.isActive !== false)) { notify('This passenger already has an active metro card.', true); return; }
    try {
      const today = localDateString();
      const card = await api('metro-cards', {
        method: 'POST',
        body: JSON.stringify({
          cardId,
          passengerId,
          balance,
          issueDate: today,
          expiryDate: localDateString(new Date(new Date().getFullYear() + 3, new Date().getMonth(), new Date().getDate())),
          createdAt: localDateTimeString(),
          isActive: true
        })
      });
      state.metroCards.push(card);
      event.target.reset();
      refreshAll();
      notify('Metro card issued');
    } catch (error) {
      notify(`Could not issue card: ${error.message}`, true);
    }
  });

  // Admin: maintenance
  $('#maintenance-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const issueId = $('#maintenance-id').value.trim();
    const issueType = $('#maintenance-type').value.trim();
    const description = $('#maintenance-description').value.trim();
    const trainId = $('#maintenance-train').value || null;
    const stationId = $('#maintenance-station').value || null;
    if (!issueId || !issueType || !description || (!trainId && !stationId)) {
      notify('Enter an issue ID, issue type, description, and select at least a train or station.', true); return;
    }
    if (state.maintenanceIssues.some((item) => item.issueId === issueId)) { notify('That issue ID already exists.', true); return; }
    try {
      const issue = await api('maintenance-issues', {
        method: 'POST',
        body: JSON.stringify({
          issueId,
          trainId,
          stationId,
          reportedBy: state.currentUser.userId,
          issueType,
          description,
          priority: $('#maintenance-priority').value,
          status: 'OPEN',
          createdAt: localDateTimeString()
        })
      });
      state.maintenanceIssues.push(issue);
      event.target.reset();
      refreshAll();
      notify('Issue logged');
    } catch (error) {
      notify(`Could not log issue: ${error.message}`, true);
    }
  });
}

/* ---------------- Auth screen live stats ---------------- */
async function loadAuthStats() {
  try {
    const [stationsList, routesList] = await Promise.all([api('stations'), api('routes')]);
    $('#auth-stat-stations').textContent = stationsList.length;
    $('#auth-stat-lines').textContent = routesList.length;
  } catch {
    $('#auth-stat-stations').textContent = '—';
    $('#auth-stat-lines').textContent = '—';
  }
}

bindEvents();
setupShell();
seedSceneStars();
applyScenePerformanceTier();
window.addEventListener('resize', applyScenePerformanceTier);
window.addEventListener('scroll', onSceneScroll, { passive: true });
updateSceneParallax();
if (window.matchMedia) {
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  (motionQuery.addEventListener ? motionQuery.addEventListener.bind(motionQuery) : motionQuery.addListener.bind(motionQuery))('change', applyScenePerformanceTier);
}
if (!state.currentUser) loadAuthStats();
loadData().catch((error) => {
  state.currentUser = null;
  localStorage.removeItem('metroUser');
  setupShell();
  notify(`Could not load metro data: ${error.message}`, true);
});
setInterval(() => {
  if (!state.currentUser) return;
  renderNetworkStatusSummary();
  if (isAdmin()) lineStatusRows('#admin-line-status');
}, 60000);
