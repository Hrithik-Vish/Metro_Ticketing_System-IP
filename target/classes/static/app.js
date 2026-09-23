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
  maintenanceIssues: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const resources = ['users', 'stations', 'routes', 'fares', 'tickets', 'payments'];
const resourceEndpoints = { trains: 'trains', schedules: 'schedules', metroCards: 'metro-cards', maintenanceIssues: 'maintenance-issues' };
const opsResources = Object.keys(resourceEndpoints);

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
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}[char]));

const isAdmin = () => state.currentUser?.role === 'ADMIN';
const displayName = (user) => `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.userId || 'Metro user';
const stationName = (id) => state.stations.find((station) => station.stationId === id)?.stationCode || id || 'Unknown';
const trainName = (id) => state.trains.find((train) => train.trainId === id)?.trainNumber || id || 'Unknown';
const routeName = (id) => state.routes.find((route) => route.routeId === id)?.routeName || id || 'Unknown';
const money = (value) => `Rs ${Number(value || 0).toFixed(2)}`;
const formatDate = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
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

function fillSelect(selector, items, valueKey, labelFn, placeholder = 'Select') {
  const select = $(selector);
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>` + items.map((item) => (
    `<option value="${escapeHtml(item[valueKey])}">${escapeHtml(labelFn(item))}</option>`
  )).join('');
  select.value = current;
}

function populateSelects() {
  const activeStations = state.stations.filter((station) => station.isActive !== false);
  fillSelect('#fare-from', activeStations, 'stationId', (station) => station.stationCode || station.stationId, 'From station');
  fillSelect('#fare-to', activeStations, 'stationId', (station) => station.stationCode || station.stationId, 'To station');
  fillSelect('#booking-from', activeStations, 'stationId', (station) => station.stationCode || station.stationId, 'From station');
  fillSelect('#booking-to', activeStations, 'stationId', (station) => station.stationCode || station.stationId, 'To station');
  fillSelect('#admin-fare-from', activeStations, 'stationId', (station) => station.stationCode || station.stationId, 'From station');
  fillSelect('#admin-fare-to', activeStations, 'stationId', (station) => station.stationCode || station.stationId, 'To station');
  fillSelect('#booking-passenger', state.users.filter((user) => user.role !== 'ADMIN'), 'userId', displayName, 'Passenger');
  fillSelect('#schedule-train', state.trains, 'trainId', (train) => train.trainNumber || train.trainId, 'Train');
  fillSelect('#schedule-route', state.routes, 'routeId', (route) => route.routeName || route.routeId, 'Route');
  fillSelect('#metrocard-passenger', state.users.filter((user) => user.role !== 'ADMIN'), 'userId', displayName, 'Passenger');
  fillSelect('#maintenance-train', state.trains, 'trainId', (train) => train.trainNumber || train.trainId, 'Train (optional)');
  fillSelect('#maintenance-station', activeStations, 'stationId', (station) => station.stationCode || station.stationId, 'Station (optional)');
}

function setupShell() {
  const signedIn = Boolean(state.currentUser);
  $('#auth-screen').classList.toggle('hidden', signedIn);
  $('#app-shell').classList.toggle('hidden', !signedIn);
  if (!signedIn) return;

  $('#account-name').textContent = displayName(state.currentUser);
  $('#account-id').textContent = state.currentUser.userId;
  $('#account-role').textContent = isAdmin() ? 'Admin view' : 'Passenger view';
  $('#today-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('#quick-book-button').textContent = isAdmin() ? 'Issue ticket' : 'New ticket';
  $('#booking-passenger-wrap').classList.toggle('hidden', !isAdmin());

  const navItems = isAdmin()
    ? [['dashboard', 'Dashboard'], ['book', 'Issue ticket'], ['tickets', 'Tickets'], ['network', 'Network'], ['users', 'Users'], ['operations', 'Operations'], ['admin', 'Admin']]
    : [['dashboard', 'Home'], ['book', 'Book'], ['tickets', 'My tickets'], ['network', 'Network']];
  $('#nav-list').innerHTML = navItems.map(([view, label]) => `<a class="nav-item" href="#${view}" data-view="${view}"><span>${label}</span></a>`).join('');
  $$('.nav-item').forEach((item) => item.addEventListener('click', () => navigate(item.dataset.view)));

  $('#hero-title').textContent = isAdmin() ? 'Metro operations at a glance.' : `Hi ${state.currentUser.firstName || state.currentUser.userId}, ready to ride?`;
  $('#hero-copy').textContent = isAdmin()
    ? 'Track active stations, riders, ticket volume, and revenue from one dashboard.'
    : 'Check fares, book tickets, and review your journey history.';
}

function renderStats() {
  const tickets = ticketPool();
  const revenue = isAdmin()
    ? state.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
    : state.payments.filter((payment) => tickets.some((ticket) => ticket.ticketId === payment.ticketId)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const stats = isAdmin()
    ? [['Riders', state.users.filter((user) => user.role !== 'ADMIN').length], ['Tickets', state.tickets.length], ['Stations', state.stations.filter((station) => station.isActive !== false).length], ['Revenue', money(revenue)]]
    : [['My tickets', tickets.length], ['Active tickets', tickets.filter(isTicketActive).length], ['Stations', state.stations.length], ['Spent', money(revenue)]];
  $('#stats-grid').innerHTML = stats.map(([label, value]) => `<article class="stat-card"><span>${label}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
}

function isTicketActive(ticket) {
  return !ticket.isUsed && (!ticket.validUntil || new Date(ticket.validUntil) > new Date());
}

function renderRecent() {
  $('#activity-title').textContent = isAdmin() ? 'Recent tickets' : 'My recent tickets';
  const rows = [...ticketPool()].sort((a, b) => new Date(b.createdAt || b.issueTime) - new Date(a.createdAt || a.issueTime)).slice(0, 5);
  $('#recent-list').innerHTML = rows.length ? rows.map((ticket) => `
    <div class="activity-row">
      <div><strong>${escapeHtml(stationName(ticket.sourceStationId))} to ${escapeHtml(stationName(ticket.destStationId))}</strong><small>${escapeHtml(ticket.ticketId)} - ${formatDate(ticket.issueTime || ticket.createdAt)}</small></div>
      <span class="fare-chip">${escapeHtml(ticket.ticketType || 'SINGLE')}</span>
    </div>
  `).join('') : '<p class="empty-state">No tickets yet.</p>';
}

function renderTickets(filter = '') {
  const normalized = filter.toLowerCase();
  const rows = ticketPool().filter((ticket) => `${ticket.ticketId} ${ticket.passengerId} ${stationName(ticket.sourceStationId)} ${stationName(ticket.destStationId)}`.toLowerCase().includes(normalized));
  $('#ticket-count').textContent = `${rows.length} ticket${rows.length === 1 ? '' : 's'}`;
  $('#tickets-heading').textContent = isAdmin() ? 'All tickets' : 'My tickets';
  $('#tickets-copy').textContent = isAdmin() ? 'Review and remove ticket records.' : 'Your current and past metro journeys.';
  $$('.admin-only').forEach((element) => element.classList.toggle('hidden', !isAdmin()));
  $('#tickets-table').innerHTML = rows.length ? rows.map((ticket) => `
    <tr>
      <td><strong>${escapeHtml(ticket.ticketId)}</strong><small>${escapeHtml(ticket.ticketType || 'SINGLE')}</small></td>
      <td>${escapeHtml(ticket.passengerId)}</td>
      <td>${escapeHtml(stationName(ticket.sourceStationId))} to ${escapeHtml(stationName(ticket.destStationId))}</td>
      <td>${formatDate(ticket.issueTime || ticket.createdAt)}</td>
      <td><span class="badge ${isTicketActive(ticket) ? 'good' : 'muted'}">${isTicketActive(ticket) ? 'Active' : ticket.isUsed ? 'Used' : 'Expired'}</span></td>
      <td class="${isAdmin() ? '' : 'hidden'}"><button class="danger-action" type="button" data-delete-ticket="${escapeHtml(ticket.ticketId)}">Delete</button></td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-state">No tickets found.</td></tr>';
  $$('[data-delete-ticket]').forEach((button) => button.addEventListener('click', () => deleteTicket(button.dataset.deleteTicket)));
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

function renderNetwork() {
  $('#station-count').textContent = `${state.stations.length} stations`;
  $('#station-list').innerHTML = state.stations.map((station) => `
    <div class="stack-item">
      <span class="color-dot" style="background:${escapeHtml(station.lineColor || '#2f80ed')}"></span>
      <div><strong>${escapeHtml(station.stationCode || station.stationId)}</strong><small>${escapeHtml(station.address || 'No address')} - ${station.isActive === false ? 'Offline' : 'Online'}</small></div>
    </div>
  `).join('') || '<p class="empty-state">No stations configured.</p>';
  $('#network-map').innerHTML = state.stations.map((station, index) => `
    <div class="network-station" style="left:${8 + (index * 17) % 78}%;top:${16 + (index * 23) % 65}%">
      <span style="background:${escapeHtml(station.lineColor || '#2f80ed')}"></span>
      <strong>${escapeHtml(station.stationCode || station.stationId)}</strong>
    </div>
  `).join('');
}

function renderOperations() {
  if (!isAdmin()) return;
  $('#train-count').textContent = `${state.trains.length} train${state.trains.length === 1 ? '' : 's'}`;
  $('#trains-table').innerHTML = state.trains.length ? state.trains.map((train) => `
    <tr>
      <td><strong>${escapeHtml(train.trainNumber || train.trainId)}</strong><small>${escapeHtml(train.trainId)}</small></td>
      <td>${escapeHtml(train.capacity ?? '-')}</td>
      <td>${escapeHtml(train.totalCoaches ?? '-')}</td>
      <td>${escapeHtml(train.manufactureYear ?? '-')}</td>
      <td><span class="badge ${train.isActive === false ? 'muted' : 'good'}">${train.isActive === false ? 'Inactive' : 'Active'}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No trains configured.</td></tr>';

  $('#schedule-count').textContent = `${state.schedules.length} schedule${state.schedules.length === 1 ? '' : 's'}`;
  $('#schedules-table').innerHTML = state.schedules.length ? state.schedules.map((schedule) => `
    <tr>
      <td><strong>${escapeHtml(schedule.scheduleId)}</strong></td>
      <td>${escapeHtml(trainName(schedule.trainId))}</td>
      <td>${escapeHtml(routeName(schedule.routeId))}</td>
      <td>${escapeHtml(schedule.dayOfWeek || '-')}</td>
      <td>${schedule.scheduledDeparture ? new Date(schedule.scheduledDeparture).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No schedules configured.</td></tr>';

  $('#metrocard-count').textContent = `${state.metroCards.length} card${state.metroCards.length === 1 ? '' : 's'}`;
  $('#metrocards-table').innerHTML = state.metroCards.length ? state.metroCards.map((card) => `
    <tr>
      <td><strong>${escapeHtml(card.cardId)}</strong></td>
      <td>${escapeHtml(displayName(state.users.find((user) => user.userId === card.passengerId)) || card.passengerId)}</td>
      <td>${money(card.balance)}</td>
      <td>${formatDate(card.expiryDate)}</td>
      <td><span class="badge ${card.isActive === false ? 'muted' : 'good'}">${card.isActive === false ? 'Inactive' : 'Active'}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No metro cards issued.</td></tr>';

  $('#maintenance-count').textContent = `${state.maintenanceIssues.length} issue${state.maintenanceIssues.length === 1 ? '' : 's'}`;
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

function refreshAll() {
  if (!state.currentUser) return;
  setupShell();
  populateSelects();
  renderStats();
  renderRecent();
  renderTickets($('#ticket-search')?.value || '');
  renderUsers($('#user-search')?.value || '');
  renderNetwork();
  renderOperations();
  updatePreview();
}

async function loadData() {
  if (!state.currentUser) {
    setupShell();
    return;
  }
  try {
    const values = await Promise.all(resources.map((resource) => api(resource)));
    resources.forEach((resource, index) => { state[resource] = values[index] || []; });
    if (isAdmin()) {
      const opsValues = await Promise.all(opsResources.map((resource) => api(resourceEndpoints[resource])));
      opsResources.forEach((resource, index) => { state[resource] = opsValues[index] || []; });
    }
    refreshAll();
    navigate(location.hash.slice(1) || 'dashboard');
  } catch (error) {
    notify(`Could not load metro data: ${error.message}`, true);
  }
}

function navigate(view) {
  if (!state.currentUser) return;
  const allowed = isAdmin() ? ['dashboard', 'book', 'tickets', 'network', 'users', 'operations', 'admin'] : ['dashboard', 'book', 'tickets', 'network'];
  const nextView = allowed.includes(view) ? view : 'dashboard';
  $$('.view').forEach((element) => element.classList.toggle('active-view', element.id === `view-${nextView}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === nextView));
  $('#view-title').textContent = isAdmin() && nextView === 'admin' ? 'Admin controls' : nextView === 'book' ? 'Book ticket' : nextView[0].toUpperCase() + nextView.slice(1);
  if (location.hash.slice(1) !== nextView) location.hash = nextView;
}

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

async function createTicket() {
  const from = $('#booking-from').value;
  const to = $('#booking-to').value;
  if (from === to) {
    notify('Choose two different stations.', true);
    return;
  }
  const fare = findFare(from, to);
  const now = new Date();
  const passengerId = isAdmin() ? $('#booking-passenger').value : state.currentUser.userId;
  const ticket = {
    ticketId: `T-${Date.now().toString().slice(-8)}`,
    passengerId,
    fareId: fare?.fareId || '',
    sourceStationId: from,
    destStationId: to,
    ticketType: $('#booking-type').value,
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
  state.tickets.push(created);
  $('#booking-form').reset();
  refreshAll();
  navigate('tickets');
  notify('Ticket issued successfully');
}

async function deleteTicket(ticketId) {
  if (!confirm(`Delete ticket ${ticketId}?`)) return;
  await api(`tickets/${encodeURIComponent(ticketId)}`, { method: 'DELETE' });
  state.tickets = state.tickets.filter((ticket) => ticket.ticketId !== ticketId);
  refreshAll();
  notify('Ticket deleted');
}

function updatePreview() {
  const from = $('#booking-from')?.value;
  const to = $('#booking-to')?.value;
  const fare = findFare(from, to);
  $('#preview-route').textContent = from && to ? `${stationName(from)} to ${stationName(to)}` : 'Select a journey';
  $('#preview-fare').textContent = fare ? money(fare.baseFare) : '-';
  if (fare && !$('#booking-amount').value) $('#booking-amount').value = Number(fare.baseFare).toFixed(2);
}

function bindEvents() {
  $$('.auth-tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.auth-tab').forEach((item) => item.classList.toggle('active', item === tab));
    $$('.auth-form').forEach((form) => form.classList.toggle('active-auth-form', form.id === `${tab.dataset.authTab}-form`));
  }));

  $('#signin-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await signIn($('#signin-user').value.trim(), $('#signin-password').value);
    } catch (error) {
      notify('Invalid user ID or password.', true);
    }
  });

  $('#signup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
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
      notify(`Could not create account: ${error.message}`, true);
    }
  });

  $('#signup-role').addEventListener('change', () => {
    $('#signup-submit').textContent = $('#signup-role').value === 'ADMIN'
      ? 'Create admin account'
      : 'Create passenger account';
  });

  $('#signout-button').addEventListener('click', () => {
    localStorage.removeItem('metroUser');
    state.currentUser = null;
    location.hash = '';
    setupShell();
  });

  $('#quick-book-button').addEventListener('click', () => navigate('book'));
  $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.goView)));
  window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'dashboard'));
  $('#ticket-search').addEventListener('input', (event) => renderTickets(event.target.value));
  $('#user-search').addEventListener('input', (event) => renderUsers(event.target.value));
  ['#booking-from', '#booking-to', '#booking-type'].forEach((selector) => $(selector).addEventListener('change', updatePreview));

  $('#fare-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const from = $('#fare-from').value;
    const to = $('#fare-to').value;
    const fare = findFare(from, to);
    $('#fare-result').innerHTML = fare
      ? `<strong>${money(fare.baseFare)}</strong><span>${escapeHtml(stationName(from))} to ${escapeHtml(stationName(to))}</span>`
      : '<span>No fare is configured for this station pair.</span>';
  });

  $('#booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await createTicket();
    } catch (error) {
      notify(`Ticket could not be issued: ${error.message}`, true);
    }
  });

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

bindEvents();
setupShell();
loadData();
