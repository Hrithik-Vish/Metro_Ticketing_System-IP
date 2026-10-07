/* ============================================================
   MetroPass — frontend logic
   Talks to the existing Spring Boot API under /api. No backend
   changes required; this only changes presentation & UX.
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
    throw new Error(text || `${response.status} ${response.statusText}`);
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
const formatDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
const formatTime = (value) => value ? new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '--:--';
const ticketPool = () => isAdmin() ? state.tickets : state.tickets.filter((ticket) => ticket.passengerId === state.currentUser?.userId);

function notify(message, isError = false) {
  const toast = $('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function findFare(from, to) {
  return state.fares.find((fare) => fare.sourceStationId === from && fare.destStationId === to)
    || state.fares.find((fare) => fare.sourceStationId === to && fare.destStationId === from);
}

function lineColorFor(routeId, index) {
  const route = state.routes.find((r) => r.routeId === routeId);
  return route?.lineColor || LINE_COLORS[index % LINE_COLORS.length];
}

function estimateStops(from, to) {
  for (const route of state.routes) {
    const stops = state.routeStations.filter((rs) => rs.routeId === route.routeId).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const fromIdx = stops.findIndex((s) => s.stationId === from);
    const toIdx = stops.findIndex((s) => s.stationId === to);
    if (fromIdx !== -1 && toIdx !== -1) {
      return { count: Math.abs(toIdx - fromIdx) + 1, minutes: route.estimatedTime || null };
    }
  }
  return { count: null, minutes: null };
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
  const passengers = ticket._passengerCount || 1;
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
    button.addEventListener('click', () => notify('Ticket saved to your downloads (demo).'));
  });
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
  fillSelect('#booking-passenger', state.users.filter((user) => user.role !== 'ADMIN'), 'userId', displayName, 'Passenger');
  fillSelect('#schedule-train', state.trains, 'trainId', (train) => train.trainNumber || train.trainId, 'Train');
  fillSelect('#schedule-route', state.routes, 'routeId', (route) => route.routeName || route.routeId, 'Route');
  fillSelect('#metrocard-passenger', state.users.filter((user) => user.role !== 'ADMIN'), 'userId', displayName, 'Passenger');
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
  $('#quick-book-button').classList.toggle('hidden', isAdmin());
  $('#booking-passenger-wrap').classList.toggle('hidden', !isAdmin());

  renderNav();
}

/* ---------------- Dashboard ---------------- */
function renderJourneyCard() {
  const from = $('#journey-from').value;
  const to = $('#journey-to').value;
  const fare = findFare(from, to);
  const summary = $('#journey-summary');
  const submit = $('#journey-submit');
  if (from && to && from !== to) {
    summary.hidden = false;
    $('#journey-summary-from').textContent = stationName(from);
    $('#journey-summary-to').textContent = stationName(to);
    $('#journey-summary-fare').textContent = fare ? money(fare.baseFare) : 'Not set';
    const est = estimateStops(from, to);
    $('#journey-summary-time').textContent = est.minutes ? `${est.minutes} min` : '—';
    $('#journey-summary-stops').textContent = est.count ? est.count : '—';
    submit.disabled = false;
    submit.querySelector('span').textContent = 'BUY TICKET →';
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

/* Ordered list of stationIds between `from` and `to` on whichever route connects them (inclusive). */
function pathBetween(from, to) {
  if (!from || !to || from === to) return null;
  for (const route of state.routes) {
    const stops = state.routeStations
      .filter((rs) => rs.routeId === route.routeId)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const fromIdx = stops.findIndex((s) => s.stationId === from);
    const toIdx = stops.findIndex((s) => s.stationId === to);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
      return { routeId: route.routeId, stationIds: stops.slice(lo, hi + 1).map((s) => s.stationId) };
    }
  }
  return null;
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
    const stops = state.routeStations
      .filter((rs) => rs.routeId === route.routeId)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    if (!stops.length) return;
    const y = laneGap * (i + 1);
    const stepX = (width - 100) / Math.max(stops.length - 1, 1);
    const color = route.lineColor || LINE_COLORS[i % LINE_COLORS.length];
    const isHighlightedRoute = highlight && highlight.routeId === route.routeId;
    const dimmed = highlight && !isHighlightedRoute;
    const points = stops.map((stop, idx) => {
      const x = 60 + idx * stepX;
      if (!stationPositions[stop.stationId]) stationPositions[stop.stationId] = { x, y, color, routeIds: [route.routeId] };
      else stationPositions[stop.stationId].routeIds.push(route.routeId);
      return `${x},${y}`;
    });
    svgLines += `<polyline data-route="${escapeHtml(route.routeId)}" points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="${isHighlightedRoute ? 7 : 5}" stroke-linecap="round" stroke-linejoin="round" opacity="${dimmed ? 0.22 : 0.85}" class="${isHighlightedRoute ? 'network-line-active' : ''}" />`;

    if (isHighlightedRoute && highlight.stationIds.length > 1) {
      // Draw a brighter overlay just for the selected span between the two chosen stations.
      const segIdx = highlight.stationIds.map((sid) => stops.findIndex((s) => s.stationId === sid));
      const segPoints = segIdx.map((idx) => `${60 + idx * stepX},${y}`);
      svgLines += `<polyline points="${segPoints.join(' ')}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" class="network-segment-highlight" />`;
    }
  });

  Object.entries(stationPositions).forEach(([stationId, pos]) => {
    const station = stationById(stationId);
    const label = station?.stationCode || stationId;
    const closed = station?.isActive === false;
    const onPath = highlightSet && highlightSet.has(stationId);
    const isEndpoint = stationId === sel.from || stationId === sel.to;
    const dimmed = highlight && !onPath;
    svgStations += `
      <g class="network-node${onPath ? ' network-node-active' : ''}${dimmed ? ' network-node-dim' : ''}" data-station="${escapeHtml(stationId)}">
        <circle cx="${pos.x}" cy="${pos.y}" r="${isEndpoint ? 9 : 7}" fill="${closed ? '#94a3b8' : (isEndpoint ? pos.color : 'white')}" stroke="${pos.color}" stroke-width="3.5" />
        <text class="network-station-label" x="${pos.x}" y="${pos.y - 14}" text-anchor="middle">${escapeHtml(label)}</text>
      </g>`;
  });

  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Metro network diagram">${svgLines}${svgStations}</svg>`;
  container.querySelectorAll('[data-station]').forEach((node) => {
    node.addEventListener('click', () => openStationPanel(node.dataset.station));
  });
}

/* ---------------- Station info panel ---------------- */
function openStationPanel(stationId) {
  const station = stationById(stationId);
  if (!station) return;
  const lines = routesForStation(stationId);
  const isInterchange = lines.length > 1;
  const now = new Date();
  const scheduledOnRoute = state.schedules.filter((s) => lines.some((r) => r.routeId === s.routeId));

  let nextTrainsHtml;
  if (scheduledOnRoute.length) {
    nextTrainsHtml = scheduledOnRoute.slice(0, 3).map((s) =>
      `<div class="next-train-row"><span>${escapeHtml(routeName(s.routeId))}</span><strong>${formatTime(s.scheduledDeparture)}</strong></div>`).join('');
  } else {
    // No scheduled runs on file for this line yet — show an illustrative cadence rather than inventing real times.
    nextTrainsHtml = [4, 12, 20].map((mins) => {
      const t = new Date(now.getTime() + mins * 60000);
      return `<div class="next-train-row"><span>Est. arrival</span><strong>${formatTime(t)}</strong></div>`;
    }).join('') + '<p class="next-train-note">Illustrative — no live schedule feed connected.</p>';
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
    navigate('dashboard');
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
    el.innerHTML = '<p class="empty-state">Click two stations, or use a station\'s panel, to preview a route here.</p>';
    return;
  }
  const path = pathBetween(sel.from, sel.to);
  const fromLabel = sel.from ? stationName(sel.from) : 'Select a station';
  const toLabel = sel.to ? stationName(sel.to) : 'Select a station';
  const est = sel.from && sel.to ? estimateStops(sel.from, sel.to) : { count: null, minutes: null };
  const fare = sel.from && sel.to ? findFare(sel.from, sel.to) : null;
  el.innerHTML = `
    <div class="route-recap"><strong>${escapeHtml(fromLabel)}</strong><span class="route-arrow">→</span><strong>${escapeHtml(toLabel)}</strong></div>
    ${sel.from && sel.to ? `
      <div class="journey-summary-stats">
        <div><strong>${fare ? money(fare.baseFare) : '—'}</strong><span>Estimated fare</span></div>
        <div><strong>${est.minutes ? est.minutes + ' min' : '—'}</strong><span>Journey time</span></div>
        <div><strong>${est.count ?? '—'}</strong><span>Stations</span></div>
      </div>
      ${path ? '' : '<p class="empty-state">These stations aren\'t on the same line yet.</p>'}
      <div class="step-actions">
        <button class="ghost-action" type="button" id="network-selection-clear">Clear</button>
        <button class="primary-action" type="button" id="network-selection-book">Book this journey</button>
      </div>` : `<div class="step-actions"><button class="ghost-action" type="button" id="network-selection-clear">Clear</button></div>`}
  `;
  const clearBtn = $('#network-selection-clear');
  if (clearBtn) clearBtn.addEventListener('click', clearNetworkSelection);
  const bookBtn = $('#network-selection-book');
  if (bookBtn) bookBtn.addEventListener('click', () => {
    $('#journey-from').value = sel.from;
    $('#journey-to').value = sel.to;
    renderJourneyCard();
    navigate('dashboard');
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
  const revenue = state.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
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
      <td></td>
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
    </tr>
  `).join('') : '<tr><td colspan="4" class="empty-state">No routes configured.</td></tr>';
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
  const rows = [...state.payments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
    </tr>
  `).join('') : '<tr><td colspan="3" class="empty-state">No fares configured.</td></tr>';
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
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No users found.</td></tr>';
}

function renderOperations() {
  $('#trains-table').innerHTML = state.trains.length ? state.trains.map((train) => `
    <tr>
      <td><strong>${escapeHtml(train.trainNumber || train.trainId)}</strong><small>${escapeHtml(train.trainId)}</small></td>
      <td>${escapeHtml(train.capacity ?? '-')}</td>
      <td>${escapeHtml(train.totalCoaches ?? '-')}</td>
      <td>${escapeHtml(train.manufactureYear ?? '-')}</td>
      <td><span class="badge ${train.isActive === false ? 'muted' : 'good'}">${train.isActive === false ? 'Inactive' : 'Active'}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No trains configured.</td></tr>';

  $('#schedules-table').innerHTML = state.schedules.length ? state.schedules.map((schedule) => `
    <tr>
      <td><strong>${escapeHtml(schedule.scheduleId)}</strong></td>
      <td>${escapeHtml(trainName(schedule.trainId))}</td>
      <td>${escapeHtml(routeName(schedule.routeId))}</td>
      <td>${escapeHtml(schedule.dayOfWeek || '-')}</td>
      <td>${schedule.scheduledDeparture ? new Date(schedule.scheduledDeparture).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No schedules configured.</td></tr>';

  $('#metrocards-table').innerHTML = state.metroCards.length ? state.metroCards.map((card) => `
    <tr>
      <td><strong>${escapeHtml(card.cardId)}</strong></td>
      <td>${escapeHtml(displayName(state.users.find((user) => user.userId === card.passengerId)) || card.passengerId)}</td>
      <td>${money(card.balance)}</td>
      <td>${formatDate(card.expiryDate)}</td>
      <td><span class="badge ${card.isActive === false ? 'muted' : 'good'}">${card.isActive === false ? 'Inactive' : 'Active'}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No metro cards issued.</td></tr>';

  $('#maintenance-table').innerHTML = state.maintenanceIssues.length ? state.maintenanceIssues.map((issue) => `
    <tr>
      <td><strong>${escapeHtml(issue.issueId)}</strong><small>${formatDate(issue.createdAt)}</small></td>
      <td>${escapeHtml(issue.trainId ? trainName(issue.trainId) : '-')}${issue.stationId ? ` / ${escapeHtml(stationName(issue.stationId))}` : ''}</td>
      <td>${escapeHtml(issue.issueType || '-')}</td>
      <td><span class="fare-chip">${escapeHtml(issue.priority || '-')}</span></td>
      <td><span class="badge ${issue.status === 'RESOLVED' ? 'good' : 'muted'}">${escapeHtml(issue.status || 'OPEN')}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No maintenance issues logged.</td></tr>';
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
    const opsValues = await Promise.all(opsResources.map((resource) => api(resourceEndpoints[resource])));
    opsResources.forEach((resource, index) => { state[resource] = opsValues[index] || []; });
    refreshAll();
    navigate(location.hash.slice(1) || 'dashboard');
  } catch (error) {
    notify(`Could not load metro data: ${error.message}`, true);
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
  await loadData();
  notify(`Signed in as ${displayName(user)}`);
}

async function signUp(payload) {
  const user = await api('auth/signup', { method: 'POST', body: JSON.stringify(payload) });
  state.currentUser = user;
  localStorage.setItem('metroUser', JSON.stringify(user));
  await loadData();
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
  const fare = findFare(from, to);
  const count = Number($('#booking-passenger-count').value || 1);
  const base = Number(fare?.baseFare || 0);
  const total = base * count;
  $('#fare-breakdown-rows').innerHTML = `
    <tr><td>Journey fare</td><td>${money(base)}</td></tr>
    <tr><td>Passengers</td><td>× ${count}</td></tr>
  `;
  $('#fare-total').textContent = money(total);
  $('#booking-amount').value = total.toFixed(2);
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
  const fare = findFare(from, to);
  const now = new Date();
  const passengerId = isAdmin() ? $('#booking-passenger').value : state.currentUser.userId;
  if (!passengerId) throw new Error('Select a passenger before issuing a ticket.');
  const passengerCount = Number($('#booking-passenger-count').value || 1);
  const ticketType = $('#booking-type').value;
  const ticket = {
    ticketId: `T-${Date.now().toString().slice(-8)}`,
    passengerId,
    fareId: fare?.fareId || '',
    sourceStationId: from,
    destStationId: to,
    ticketType,
    validUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19),
    isUsed: false,
    issueTime: now.toISOString().slice(0, 19),
    createdAt: now.toISOString().slice(0, 19)
  };
  const created = await api('tickets', { method: 'POST', body: JSON.stringify(ticket) });
  const amount = Number($('#booking-amount').value || fare?.baseFare || 0);
  if (amount > 0) {
    const payment = await api('payments', {
      method: 'POST',
      body: JSON.stringify({ paymentId: `P-${Date.now().toString().slice(-8)}`, ticketId: created.ticketId, amount, createdAt: ticket.createdAt })
    });
    state.payments.push(payment);
  }
  created._passengerCount = passengerCount;
  state.tickets.push(created);
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
  refreshAll();
  notify('Ticket deleted');
}

async function cancelTicket(ticketId) {
  if (!confirm(`Cancel ticket ${ticketId}?`)) return;
  await api(`tickets/${encodeURIComponent(ticketId)}`, { method: 'DELETE' });
  state.tickets = state.tickets.filter((ticket) => ticket.ticketId !== ticketId);
  refreshAll();
  notify('Ticket cancelled');
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

/* ---------------- Event binding ---------------- */
function bindEvents() {
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
      $('#signin-error').textContent = 'Invalid user ID or password.';
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
      $('#booking-step1-error').textContent = '';
    }
    goToBookingStep(Number(button.dataset.stepNext));
  }));
  $$('[data-step-prev]').forEach((button) => button.addEventListener('click', () => goToBookingStep(Number(button.dataset.stepPrev))));
  $('#booking-swap').addEventListener('click', () => {
    const from = $('#booking-from').value, to = $('#booking-to').value;
    $('#booking-from').value = to; $('#booking-to').value = from;
    updateRouteRecap();
  });
  $('#booking-passenger-count').addEventListener('change', updateFareBreakdown);
  $('#booking-type').addEventListener('change', updateRouteRecap);

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

  // Admin: station
  $('#station-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const station = await api('stations', {
        method: 'POST',
        body: JSON.stringify({
          stationId: $('#station-id').value.trim(),
          stationCode: $('#station-code').value.trim(),
          address: $('#station-address').value.trim(),
          lineColor: $('#station-color').value,
          openedDate: new Date().toISOString().slice(0, 10),
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
      const fare = await api('fares', {
        method: 'POST',
        body: JSON.stringify({
          fareId: $('#fare-id').value.trim(),
          sourceStationId: $('#admin-fare-from').value,
          destStationId: $('#admin-fare-to').value,
          baseFare: Number($('#admin-fare-amount').value)
        })
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
    const [firstName, ...rest] = $('#admin-user-name').value.trim().split(' ');
    try {
      const user = await api('users', {
        method: 'POST',
        body: JSON.stringify({
          userId: $('#admin-user-id').value.trim(),
          firstName,
          lastName: rest.join(' '),
          contact: $('#admin-user-contact').value.trim(),
          role: $('#admin-user-role').value,
          password: $('#admin-user-password').value,
          registrationDate: new Date().toISOString().slice(0, 10),
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
    try {
      const train = await api('trains', {
        method: 'POST',
        body: JSON.stringify({
          trainId: $('#train-id').value.trim(),
          trainNumber: $('#train-number').value.trim(),
          capacity: Number($('#train-capacity').value),
          totalCoaches: Number($('#train-coaches').value),
          manufactureYear: Number($('#train-year').value),
          createdAt: new Date().toISOString().slice(0, 19),
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

  // Admin: schedule
  $('#schedule-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const schedule = await api('schedules', {
        method: 'POST',
        body: JSON.stringify({
          scheduleId: $('#schedule-id').value.trim(),
          trainId: $('#schedule-train').value,
          routeId: $('#schedule-route').value,
          dayOfWeek: $('#schedule-day').value,
          scheduledDeparture: $('#schedule-departure').value,
          scheduledArrival: $('#schedule-arrival').value,
          validFrom: today,
          isActive: true,
          createdAt: new Date().toISOString().slice(0, 19)
        })
      });
      state.schedules.push(schedule);
      event.target.reset();
      refreshAll();
      notify('Schedule saved');
    } catch (error) {
      notify(`Could not save schedule: ${error.message}`, true);
    }
  });

  // Admin: metro card
  $('#metrocard-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const card = await api('metro-cards', {
        method: 'POST',
        body: JSON.stringify({
          cardId: $('#metrocard-id').value.trim(),
          passengerId: $('#metrocard-passenger').value,
          balance: Number($('#metrocard-balance').value),
          issueDate: today,
          expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 3)).toISOString().slice(0, 10),
          createdAt: new Date().toISOString().slice(0, 19),
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
    try {
      const issue = await api('maintenance-issues', {
        method: 'POST',
        body: JSON.stringify({
          issueId: $('#maintenance-id').value.trim(),
          trainId: $('#maintenance-train').value || null,
          stationId: $('#maintenance-station').value || null,
          reportedBy: state.currentUser.userId,
          issueType: $('#maintenance-type').value.trim(),
          description: $('#maintenance-description').value.trim(),
          priority: $('#maintenance-priority').value,
          status: 'OPEN',
          createdAt: new Date().toISOString().slice(0, 19)
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
loadData();
