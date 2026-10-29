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
  renderDashboardTransit();
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
    const passengerCard = state.metroCards.find((card) => card.passengerId === state.currentUser?.userId);
    await loadMetroCardActivity(passengerCard?.cardId);
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
  window.scrollTo(0, 0);
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
  updatePaymentMethodOptions();
}

function bookingPassengerId() {
  return isAdmin() ? $('#booking-passenger')?.value : state.currentUser?.userId;
}
function selectedPaymentMethod() {
  return document.querySelector('input[name="payment-method"]:checked')?.value || 'DEMO';
}

/* The metro card option is only offered when the paying passenger has an active, unexpired card. */
function updatePaymentMethodOptions() {
  const cardRadio = document.querySelector('input[name="payment-method"][value="METRO_CARD"]');
  const demoRadio = document.querySelector('input[name="payment-method"][value="DEMO"]');
  const note = $('#pay-card-note');
  if (!cardRadio || !demoRadio || !note) return;
  const passengerId = bookingPassengerId();
  const card = passengerId ? state.metroCards.find((item) => item.passengerId === passengerId && cardIsUsable(item)) : null;
  const validPass = card && state.metroCardPasses.find((pass) => pass.cardId === card.cardId
    && new Date(pass.startsAt) <= new Date() && new Date(pass.expiresAt) > new Date());
  const total = Number($('#booking-amount').value || 0);
  if (!card) {
    const anyCard = passengerId ? state.metroCards.some((item) => item.passengerId === passengerId) : false;
    note.textContent = anyCard ? 'The card is inactive or expired' : 'No metro card on file';
    cardRadio.disabled = true;
    if (cardRadio.checked) demoRadio.checked = true;
  } else {
    cardRadio.disabled = false;
    note.textContent = validPass
      ? `${validPass.passType} unlimited pass · valid until ${new Date(validPass.expiresAt).toLocaleString()}`
      : total > Number(card.balance || 0)
      ? `Balance ${money(card.balance)} on ${card.cardId}. About ${money(total)} is needed, so top up first.`
      : `Balance ${money(card.balance)} on ${card.cardId}`;
  }
  $('#pay-option-card')?.classList.toggle('disabled', cardRadio.disabled);
  const method = selectedPaymentMethod();
  const paymentNote = $('#payment-note');
  if (paymentNote) {
    paymentNote.textContent = method === 'METRO_CARD'
      ? (validPass ? 'Your active time pass covers this ride. No wallet balance will be deducted.' : 'The fare is deducted from the metro card when you confirm. The server calculates the final amount.')
      : 'This is a demo checkout. Confirming will simulate payment and generate your ticket immediately.';
  }
  const submitLabel = $('#booking-submit span');
  if (submitLabel) submitLabel.textContent = method === 'METRO_CARD' ? (validPass ? 'Use time pass' : 'Pay with metro card') : 'Pay & generate ticket';
}

function updateBookingPreview() {
  if ($('#booking-from') && $('#booking-to')) updateRouteRecap();
  updatePaymentMethodOptions();
}

function resetBookingForm() {
  $('#booking-form').reset();
  updatePaymentMethodOptions();
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
  const paymentMethod = selectedPaymentMethod();
  if (paymentMethod === 'METRO_CARD' && !state.metroCards.some((item) => item.passengerId === passengerId && cardIsUsable(item))) {
    throw new Error('This passenger has no active, unexpired metro card. Choose the demo checkout instead.');
  }
  const result = await api('bookings', {
    method: 'POST',
    body: JSON.stringify({ passengerId, sourceStationId: from, destStationId: to, ticketType, passengerCount, paymentMethod })
  });
  const created = result.ticket;
  const payment = result.payment;
  const amount = Number(result.amount);
  if (!created || !payment || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('The booking service returned an incomplete booking. Please refresh before retrying.');
  }
  state.payments = [...state.payments.filter((item) => item.paymentId !== payment.paymentId), payment];
  state.tickets = [...state.tickets.filter((item) => item.ticketId !== created.ticketId), created];
  const paidByCard = payment.paymentMethod === 'METRO_CARD' && payment.metroCardId;
  if (paidByCard && result.remainingCardBalance != null) {
    state.metroCards = state.metroCards.map((item) => item.cardId === payment.metroCardId
      ? { ...item, balance: result.remainingCardBalance } : item);
  }
  refreshAll();
  showTicketSuccess(created, amount);
  resetBookingForm();
  notify(paidByCard && result.remainingCardBalance != null
    ? `Ticket issued. ${money(result.remainingCardBalance)} left on the metro card.`
    : 'Ticket issued successfully');
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

/* Deleting or cancelling a ticket paid with a metro card refunds the card on the server (unless the ticket was used).
   The toast reports what actually happened to the balance after the data is reloaded. */
async function removeTicket(ticketId, cancel) {
  const verb = cancel ? 'cancelled' : 'deleted';
  const ticket = state.tickets.find((item) => item.ticketId === ticketId);
  const payment = state.payments.find((item) => item.ticketId === ticketId);
  const paidByCard = ['METRO_CARD', 'METRO_CARD_PASS'].includes(payment?.paymentMethod) && Boolean(payment.metroCardId);
  const refundable = payment?.paymentMethod === 'METRO_CARD' && Number(payment.amount) > 0 && paidByCard && !ticket?.isUsed;
  const cardBefore = refundable ? state.metroCards.find((item) => item.cardId === payment.metroCardId) : null;
  const balanceBefore = cardBefore ? Number(cardBefore.balance) : null;
  const refundNote = cardBefore ? ` ${money(payment.amount)} will be refunded to the metro card.` : '';
  if (!(await confirmAction({ title: `${cancel ? 'Cancel' : 'Delete'} ticket?`, message: `Ticket ${ticketId}.${refundNote}`, confirmLabel: cancel ? 'Cancel ticket' : 'Delete ticket', danger: true }))) return;

  try {
    await api(`tickets/${encodeURIComponent(ticketId)}`, { method: 'DELETE' });
  } catch (error) {
    // A failure usually means the data on screen is stale, so reload it before reporting.
    try { await loadData(); } catch {}
    notify(`Could not ${cancel ? 'cancel' : 'delete'} the ticket: ${error.message}`, true);
    return;
  }
  state.tickets = state.tickets.filter((item) => item.ticketId !== ticketId);
  state.payments = state.payments.filter((item) => item.ticketId !== ticketId);
  let reloaded = true;
  try { await loadData(); } catch { reloaded = false; refreshAll(); }

  if (!paidByCard) { notify(`Ticket ${verb} and its demo payment record removed.`); return; }
  if (ticket?.isUsed) { notify(`Ticket ${verb}. A used ticket is not refunded.`); return; }
  if (payment?.paymentMethod === 'METRO_CARD_PASS') { notify(`Ticket ${verb}. Your time pass remains valid.`); return; }
  if (!cardBefore) { notify(`Ticket ${verb}. The metro card no longer exists, so nothing was refunded.`); return; }
  if (!reloaded) { notify(`Ticket ${verb}. Refresh the page to see the updated card balance.`); return; }
  const cardAfter = state.metroCards.find((item) => item.cardId === cardBefore.cardId);
  if (!cardAfter) { notify(`Ticket ${verb}. The metro card no longer exists, so nothing was refunded.`); return; }
  if (Number(cardAfter.balance) > balanceBefore) {
    notify(`Ticket ${verb}, ${money(payment.amount)} refunded to ${isAdmin() ? "the passenger's" : 'your'} metro card.`);
  } else {
    notify(`Ticket ${verb}, but the metro card balance did not change. Check the card.`, true);
  }
}

const deleteTicket = (ticketId) => removeTicket(ticketId, false);
const cancelTicket = (ticketId) => removeTicket(ticketId, true);

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
async function deleteIfUnreferenced(resource, id, references, description) {
  if (references.some((items) => items.some((item) => item === id))) {
    notify(`This ${description} is already in use. Deactivate it instead of deleting it.`, true);
    return false;
  }
  if (!(await confirmAction({ title: `Delete ${description}?`, message: `Delete "${id}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return false;
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
      openModal({ title: `Edit station ${station.stationCode || id}`, fields: [
        { name: 'stationCode', label: 'Station code', value: station.stationCode || '' },
        { name: 'address', label: 'Address', value: station.address || '' },
        { name: 'lineColor', label: 'Line colour', type: 'color', value: station.lineColor || '#2563EB' }
      ], onSubmit: async ({ stationCode, address, lineColor }) => {
        if (!stationCode) throw new ApiError('Station code is required.', 400, { stationCode: 'Enter a station code.' });
        await sendUpdate('stations', id, station, { stationCode, address, lineColor });
        await loadData(); notify('Changes saved');
      }}); return;
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
        state.maintenanceIssues.some((item) => item.stationId === id)
      ];
      if (referenced.some(Boolean)) { notify('This station is referenced by existing records. Close it instead of deleting it.', true); return; }
      if (!(await confirmAction({ title: 'Delete station?', message: `Delete ${station.stationCode || id}?`, confirmLabel: 'Delete station', danger: true }))) return;
      await api(`stations/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    }
    case 'edit-route': {
      if (!route) break;
      openModal({ title: `Edit route ${route.routeName || id}`, fields: [
        { name: 'routeName', label: 'Route name', value: route.routeName || '' },
        { name: 'totalDistance', label: 'Total distance (km)', type: 'number', min: '0.1', step: '0.1', value: route.totalDistance },
        { name: 'estimatedTime', label: 'Estimated duration (minutes)', type: 'number', min: '1', step: '1', value: route.estimatedTime },
        { name: 'lineColor', label: 'Line colour', type: 'color', value: route.lineColor || '#2563EB' }
      ], onSubmit: async ({ routeName, totalDistance, estimatedTime, lineColor }) => {
        const distance = Number(totalDistance), duration = Number(estimatedTime), problems = {};
        if (!routeName) problems.routeName = 'Route name is required.';
        if (!Number.isFinite(distance) || distance <= 0) problems.totalDistance = 'Enter a positive distance.';
        if (!Number.isInteger(duration) || duration <= 0) problems.estimatedTime = 'Enter a positive whole number of minutes.';
        if (Object.keys(problems).length) throw new ApiError(Object.values(problems)[0], 400, problems);
        await sendUpdate('routes', id, route, { routeName, totalDistance: distance, estimatedTime: duration, lineColor, updatedAt: localDateTimeString() });
        await loadData(); notify('Changes saved');
      }}); return;
    }
    case 'delete-route': {
      if (!route) break;
      if (!(await confirmAction({ title: 'Delete route?', message: `Delete ${route.routeName || id} and its schedules and station mappings?`, confirmLabel: 'Delete route', danger: true }))) return;
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
      if (!(await confirmAction({ title: 'Remove route stop?', message: `Remove ${stationName(mapping.stationId)} from ${routeName(mapping.routeId)}?`, confirmLabel: 'Remove stop', danger: true }))) return;
      await api(`routes/${encodeURIComponent(mapping.routeId)}/stops/${encodeURIComponent(mapping.id)}`, { method: 'DELETE' }); changed = true; break;
    }
    case 'edit-train': {
      if (!train) break;
      openModal({ title: `Edit train ${train.trainNumber || id}`, fields: [
        { name: 'trainNumber', label: 'Train number', value: train.trainNumber || '' },
        { name: 'capacity', label: 'Capacity', type: 'number', min: '1', step: '1', value: train.capacity },
        { name: 'totalCoaches', label: 'Number of coaches', type: 'number', min: '1', step: '1', value: train.totalCoaches },
        { name: 'manufactureYear', label: 'Manufacture year', type: 'number', min: '1900', max: String(new Date().getFullYear() + 1), step: '1', value: train.manufactureYear }
      ], onSubmit: async ({ trainNumber, capacity, totalCoaches, manufactureYear }) => {
        const problems = {}, cap = Number(capacity), coaches = Number(totalCoaches), year = Number(manufactureYear);
        if (!trainNumber) problems.trainNumber = 'Train number is required.';
        if (!Number.isInteger(cap) || cap < 1) problems.capacity = 'Enter a positive whole number.';
        if (!Number.isInteger(coaches) || coaches < 1) problems.totalCoaches = 'Enter a positive whole number.';
        if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) problems.manufactureYear = 'Enter a valid year.';
        if (Object.keys(problems).length) throw new ApiError(Object.values(problems)[0], 400, problems);
        await sendUpdate('trains', id, train, { trainNumber, capacity: cap, totalCoaches: coaches, manufactureYear: year });
        await loadData(); notify('Changes saved');
      }}); return;
    }
    case 'toggle-train':
      if (!train) break;
      await sendUpdate('trains', id, train, { isActive: train.isActive === false }); changed = true; break;
    case 'delete-train': {
      if (!train) break;
      if (state.schedules.some((item) => item.trainId === id) || state.maintenanceIssues.some((item) => item.trainId === id)) {
        notify('This train is referenced by schedules or maintenance issues. Deactivate it instead of deleting it.', true); return;
      }
      if (!(await confirmAction({ title: 'Delete train?', message: `Delete train ${train.trainNumber || id}?`, confirmLabel: 'Delete train', danger: true }))) return;
      await api(`trains/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    }
    case 'edit-schedule': {
      if (!schedule) break;
      const dayOptions = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
      const existingDep = String(schedule.scheduledDeparture || '').slice(0,16);
      const existingArr = String(schedule.scheduledArrival || '').slice(0,16);
      openModal({ title: `Edit schedule ${id}`, fields: [
        { name: 'dayOfWeek', label: 'Day of week', type: 'select', value: schedule.dayOfWeek, options: dayOptions.map((value) => ({ value, label: value[0] + value.slice(1).toLowerCase() })) },
        { name: 'departure', label: 'Departure', type: 'datetime-local', value: existingDep },
        { name: 'arrival', label: 'Arrival', type: 'datetime-local', value: existingArr },
        { name: 'validFrom', label: 'Valid from', type: 'date', value: schedule.validFrom || '' },
        { name: 'validTo', label: 'Valid through', type: 'date', value: schedule.validTo || '' }
      ], onSubmit: async ({ dayOfWeek, departure: departureValue, arrival: arrivalValue, validFrom, validTo }) => {
        const departure = parseDateValue(departureValue), arrival = parseDateValue(arrivalValue), problems = {};
        if (!departure || !arrival || Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime()) || arrival <= departure) problems.arrival = 'Arrival must be after departure.';
        if (departure && !Number.isNaN(departure.getTime())) {
          const actualDay = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][departure.getDay()];
          if (actualDay !== dayOfWeek) problems.dayOfWeek = `Departure falls on ${actualDay}.`;
        }
        if (!isValidDateOnly(validFrom)) problems.validFrom = 'Enter a valid start date.';
        if (validTo && (!isValidDateOnly(validTo) || (validFrom && parseDateValue(validTo) < parseDateValue(validFrom)))) problems.validTo = 'End date must be on or after the start date.';
        if (Object.keys(problems).length) throw new ApiError(Object.values(problems)[0], 400, problems);
        await sendUpdate('schedules', id, schedule, { dayOfWeek, scheduledDeparture: localDateTimeString(departure), scheduledArrival: localDateTimeString(arrival), validFrom, validTo: validTo || null });
        await loadData(); notify('Changes saved');
      }}); return;
    }
    case 'toggle-schedule':
      if (!schedule) break;
      await sendUpdate('schedules', id, schedule, { isActive: schedule.isActive === false }); changed = true; break;
    case 'delete-schedule':
      if (!schedule) break;
      if (!(await confirmAction({ title: 'Delete schedule?', message: `Delete schedule ${id}?`, confirmLabel: 'Delete schedule', danger: true }))) return;
      await api(`schedules/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    case 'edit-fare': {
      if (!fare) break;
      const sources = state.stations.filter((item) => item.isActive !== false);
      const stationOptions = sources.map((item) => ({ value: item.stationId, label: `${item.stationCode || item.stationId} (${item.stationId})` }));
      openModal({ title: `Edit fare ${id}`, fields: [
        { name: 'sourceStationId', label: 'From', type: 'select', value: fare.sourceStationId, options: stationOptions },
        { name: 'destStationId', label: 'To', type: 'select', value: fare.destStationId, options: stationOptions },
        { name: 'baseFare', label: 'Fare amount (₹)', type: 'number', min: '0.01', step: '0.01', value: fare.baseFare }
      ], onSubmit: async ({ sourceStationId, destStationId, baseFare: amountText }) => {
        const amount = Number(amountText), problems = {};
        if (!sources.some((item) => item.stationId === sourceStationId)) problems.sourceStationId = 'Choose an active station.';
        if (!sources.some((item) => item.stationId === destStationId) || sourceStationId === destStationId) problems.destStationId = 'Choose a different active station.';
        if (!Number.isFinite(amount) || amount <= 0) problems.baseFare = 'Enter a positive fare.';
        if (Object.keys(problems).length) throw new ApiError(Object.values(problems)[0], 400, problems);
        await sendUpdate('fares', id, fare, { sourceStationId, destStationId, baseFare: amount });
        await loadData(); notify('Changes saved');
      }}); return;
    }
    case 'delete-fare':
      if (!fare) break;
      if (state.tickets.some((item) => item.fareId === id)) { notify('This fare is used by existing tickets. Keep it so ticket history stays readable.', true); return; }
      if (!(await confirmAction({ title: 'Delete fare?', message: `Delete fare ${id}?`, confirmLabel: 'Delete fare', danger: true }))) return;
      await api(`fares/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    case 'edit-user': {
      if (!user) break;
      openModal({
        title: `Edit user ${user.userId}`,
        fields: [
          { name: 'firstName', label: 'First name', value: user.firstName || '' },
          { name: 'lastName', label: 'Last name (optional)', value: user.lastName || '' },
          { name: 'contact', label: 'Email', type: 'email', value: user.contact || '' },
          { name: 'role', label: 'Role', type: 'select', value: user.role || 'USER',
            options: [{ value: 'USER', label: 'Passenger' }, { value: 'ADMIN', label: 'Admin' }] }
        ],
        submitLabel: 'Save changes',
        onSubmit: async ({ firstName, lastName, contact, role }) => {
          const problems = {};
          if (!firstName) problems.firstName = 'First name is required.';
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) problems.contact = 'Enter a valid email address.';
          if (user.userId === state.currentUser?.userId && role !== 'ADMIN') problems.role = 'You cannot remove your own admin role.';
          if (Object.keys(problems).length) throw new ApiError(Object.values(problems)[0], 400, problems);
          await sendUpdate('users', id, user, { firstName, lastName: lastName || null, contact, role });
          try { await loadData(); } catch {}
          notify('Changes saved');
        }
      });
      return;
    }
    case 'reset-password': {
      if (!user) break;
      openModal({
        title: `Reset password for ${user.userId}`,
        intro: 'The new password replaces the current one. Share it with the user directly.',
        fields: [{ name: 'password', label: 'New password', type: 'password', maxlength: '72', minlength: '6', autocomplete: 'new-password', hint: '6 to 72 characters.' }],
        submitLabel: 'Reset password',
        onSubmit: async ({ password }) => {
          // Untrimmed on purpose: spaces are valid password characters.
          const raw = $('#modal-field-password').value;
          if (raw.length < 6 || raw.length > 72) {
            const message = 'Password must be 6 to 72 characters.';
            throw new ApiError(message, 400, { password: message });
          }
          await sendUpdate('users', id, user, { password: raw });
          notify(`Password reset for ${displayName(user)}.`);
        }
      });
      return;
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
      if (!(await confirmAction({ title: 'Delete user?', message: `Delete ${displayName(user)} (${id})?`, confirmLabel: 'Delete user', danger: true }))) return;
      await api(`users/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    }
    case 'topup-card':
      openTopUpModal(id);
      return;
    case 'edit-card': {
      if (!card) break;
      const passengers = state.users.filter((item) => item.role !== 'ADMIN' && (item.isActive !== false || item.userId === card.passengerId));
      openModal({
        title: `Edit card ${card.cardId}`,
        fields: [
          { name: 'passengerId', label: 'Passenger', type: 'select', value: card.passengerId,
            options: passengers.map((item) => ({ value: item.userId, label: `${displayName(item)} (${item.userId})` })) },
          { name: 'balance', label: 'Balance (₹)', type: 'number', min: '0', step: '0.01', value: card.balance ?? 0 },
          { name: 'expiryDate', label: 'Expiry date', type: 'date', value: card.expiryDate || '' }
        ],
        submitLabel: 'Save changes',
        onSubmit: async ({ passengerId, balance: balanceText, expiryDate }) => {
          const problems = {};
          const balance = Number(balanceText);
          if (!passengers.some((item) => item.userId === passengerId)) problems.passengerId = 'Choose an existing passenger.';
          if (balanceText === '' || !Number.isFinite(balance) || balance < 0) problems.balance = 'Enter a balance of 0 or more.';
          if (!isValidDateOnly(expiryDate)) problems.expiryDate = 'Enter a valid expiry date.';
          else if (isValidDateOnly(card.issueDate) && parseDateValue(expiryDate) < parseDateValue(card.issueDate)) problems.expiryDate = 'Expiry cannot be before the issue date.';
          if (Object.keys(problems).length) throw new ApiError(Object.values(problems)[0], 400, problems);
          await sendUpdate('metro-cards', id, card, { passengerId, balance, expiryDate });
          try { await loadData(); } catch {}
          notify('Changes saved');
        }
      });
      return;
    }
    case 'toggle-card':
      if (!card) break;
      await sendUpdate('metro-cards', id, card, { isActive: card.isActive === false }); changed = true; break;
    case 'delete-card':
      if (!card) break;
      if (!(await confirmAction({ title: 'Delete metro card?', message: `Delete card ${id}?`, confirmLabel: 'Delete card', danger: true }))) return;
      await api(`metro-cards/${encodeURIComponent(id)}`, { method: 'DELETE' }); changed = true; break;
    case 'edit-issue': {
      if (!issue) break;
      openModal({ title: `Edit maintenance issue ${id}`, fields: [
        { name: 'issueType', label: 'Issue type', value: issue.issueType || '' },
        { name: 'description', label: 'Description', value: issue.description || '' },
        { name: 'priority', label: 'Priority', type: 'select', value: issue.priority || 'MEDIUM', options: ['LOW','MEDIUM','HIGH'].map((value) => ({ value, label: value[0] + value.slice(1).toLowerCase() })) },
        { name: 'status', label: 'Status', type: 'select', value: issue.status || 'OPEN', options: [{ value: 'OPEN', label: 'Open' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'RESOLVED', label: 'Resolved' }] }
      ], onSubmit: async ({ issueType, description, priority, status }) => {
        const problems = {};
        if (!issueType) problems.issueType = 'Issue type is required.';
        if (!description) problems.description = 'Description is required.';
        if (Object.keys(problems).length) throw new ApiError(Object.values(problems)[0], 400, problems);
        await sendUpdate('maintenance-issues', id, issue, { issueType, description, priority, status, resolvedAt: status === 'RESOLVED' ? (issue.resolvedAt || localDateTimeString()) : null });
        await loadData(); notify('Changes saved');
      }}); return;
    }
    case 'resolve-issue':
      if (!issue) break;
      await sendUpdate('maintenance-issues', id, issue, { status: 'RESOLVED', resolvedAt: localDateTimeString() }); changed = true; break;
    case 'delete-issue':
      if (!issue) break;
      if (!(await confirmAction({ title: 'Delete maintenance issue?', message: `Delete issue ${id}?`, confirmLabel: 'Delete issue', danger: true }))) return;
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
  // Close expandable add panels after a successful form reset.
  document.addEventListener('reset', (event) => {
    const panel = event.target.closest?.('details');
    if (panel) panel.open = false;
  });
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-admin-action]');
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      await runAdminAction(button.dataset.adminAction, button.dataset.id);
    } catch (error) {
      // A 404 or 409 usually means another admin changed the record, so reload before reporting.
      try { await loadData(); } catch {}
      notify(`Action failed: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  });

  // Passenger wallet: top-up button
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-topup-card]');
    if (!button || button.disabled) return;
    openTopUpModal(button.dataset.topupCard);
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-buy-pass]');
    if (!button || button.disabled) return;
    buyMetroPass(button.dataset.cardId, button.dataset.buyPass, Number(button.dataset.price), button.dataset.label);
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
      const message = error.message || '';
      $('#signin-error').textContent = message.startsWith('Could not load metro data')
        ? 'Could not load metro data. Please sign in again and retry.'
        : error.status === 401 ? 'Invalid user ID or password.' : (message || 'Could not sign in.');
    }
  });

  $('#signup-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#signup-error').textContent = '';
    const signupForm = $('#signup-form');
    clearFieldErrors(signupForm);
    try {
      // Sign-up only creates passenger accounts; the server assigns the role.
      await signUp({
        userId: $('#signup-user').value.trim(),
        firstName: $('#signup-first').value.trim(),
        lastName: $('#signup-last').value.trim(),
        contact: $('#signup-contact').value.trim(),
        password: $('#signup-password').value
      });
    } catch (error) {
      showFieldErrors(signupForm, error.fields, {
        userId: 'signup-user', firstName: 'signup-first', lastName: 'signup-last',
        contact: 'signup-contact', password: 'signup-password'
      });
      $('#signup-error').textContent = error.message || 'Could not create account.';
    }
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
  $$('input[name="payment-method"]').forEach((radio) => radio.addEventListener('change', updatePaymentMethodOptions));
  $('#booking-passenger')?.addEventListener('change', updatePaymentMethodOptions);
  ['#booking-from', '#booking-to'].forEach((selector) => $(selector).addEventListener('change', () => { updateRouteRecap(); updateFareBreakdown(); updatePaymentSummary(); }));

  $('#booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const paidWithCard = selectedPaymentMethod() === 'METRO_CARD';
    try {
      await createTicket();
    } catch (error) {
      notify(`Ticket could not be issued: ${error.message}`, true);
      if (paidWithCard) {
        // The card balance may have changed elsewhere; refresh it so the amounts shown are current.
        try {
          state.metroCards = await api('metro-cards');
          renderMetroCard();
          updatePaymentMethodOptions();
        } catch {}
      }
    }
  });

  // Search inputs
  $('#ticket-search')?.addEventListener('input', (event) => renderTicketsPage(event.target.value));
  $('#admin-ticket-search')?.addEventListener('input', (event) => renderAdminTickets(event.target.value));
  $('#admin-station-search')?.addEventListener('input', (event) => renderAdminStations(event.target.value));
  $('#user-search')?.addEventListener('input', (event) => renderUsers(event.target.value));

  // Admin: compose route stops in order before saving the route.
  $('#route-intermediate-add')?.addEventListener('click', () => addRouteStopEditorRow());
  $('#route-intermediate-list')?.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    const row = button?.closest('.route-stop-editor-row');
    if (!row) return;
    if (button.hasAttribute('data-stop-remove')) row.remove();
    else if (button.dataset.stopMove === 'up' && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
    else if (button.dataset.stopMove === 'down' && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
    renumberRouteStopRows();
  });
  $('#route-form')?.addEventListener('reset', () => { $('#route-intermediate-list').replaceChildren(); });
  $('#route-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const routeId = $('#route-id').value.trim();
    const startStationId = $('#route-start').value;
    const endStationId = $('#route-end').value;
    const intermediateStationIds = $$('#route-intermediate-list [data-route-stop-station]').map((select) => select.value);
    const routeStationIds = [startStationId, ...intermediateStationIds, endStationId];
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
    if (intermediateStationIds.some((stationId) => !stationId) || new Set(routeStationIds).size !== routeStationIds.length) {
      notify('Choose a different station for every stop. Start and end stations cannot be repeated.', true);
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
      for (const [sequenceNumber, stationId] of routeStationIds.entries()) {
        createdMappings.push(await api('route-stations', {
          method: 'POST',
          body: JSON.stringify({ routeId, stationId, sequenceNumber: sequenceNumber + 1 })
        }));
      }
      event.target.reset();
      $('#route-color').value = '#7c3aed';
      await loadData();
      navigate('admin-routes');
      notify(intermediateStationIds.length
        ? `Route saved with ${intermediateStationIds.length} intermediate stop${intermediateStationIds.length === 1 ? '' : 's'}.`
        : 'Route and endpoint stops saved.');
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
      if (!stationId || !stationCode) { notify('Enter a station ID and station code.', true); return; }
      if (state.stations.some((item) => item.stationId === stationId)) { notify('That station ID already exists.', true); return; }
      if (state.stations.some((item) => item.stationCode?.trim().toLowerCase() === stationCode.toLowerCase())) { notify('That station code already exists.', true); return; }
      const latText = $('#station-lat').value.trim();
      const lngText = $('#station-lng').value.trim();
      const latitude = latText === '' ? null : Number(latText);
      const longitude = lngText === '' ? null : Number(lngText);
      if ((latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90))
          || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
        notify('Latitude must be between -90 and 90, and longitude between -180 and 180.', true); return;
      }
      const openedValue = $('#station-opened').value;
      if (openedValue && !isValidDateOnly(openedValue)) { notify('Enter a valid opened date.', true); return; }
      const station = await api('stations', {
        method: 'POST',
        body: JSON.stringify({
          stationId,
          stationCode,
          address: $('#station-address').value.trim(),
          lineColor: $('#station-color').value,
          ...(latitude !== null ? { latitude } : {}),
          ...(longitude !== null ? { longitude } : {}),
          openedDate: openedValue || localDateString(),
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
    const form = event.target;
    clearFieldErrors(form);
    const idMap = {
      userId: 'admin-user-id', firstName: 'admin-user-first', lastName: 'admin-user-last',
      contact: 'admin-user-contact', password: 'admin-user-password', role: 'admin-user-role'
    };
    const userId = $('#admin-user-id').value.trim();
    const firstName = $('#admin-user-first').value.trim();
    const lastName = $('#admin-user-last').value.trim();
    const contact = $('#admin-user-contact').value.trim();
    const password = $('#admin-user-password').value;
    const problems = {};
    if (userId.length < 3) problems.userId = 'User ID must be at least 3 characters.';
    else if (state.users.some((item) => item.userId === userId)) problems.userId = 'That user ID already exists.';
    if (!firstName) problems.firstName = 'First name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) problems.contact = 'Enter a valid email address.';
    if (password.length < 6 || password.length > 72) problems.password = 'Password must be 6 to 72 characters.';
    if (Object.keys(problems).length) {
      showFieldErrors(form, problems, idMap);
      notify(Object.values(problems)[0], true);
      return;
    }
    try {
      const user = await api('users', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          firstName,
          lastName: lastName || null,
          contact,
          role: $('#admin-user-role').value,
          stationId: $('#admin-user-station').value || null,
          hireDate: $('#admin-user-hire-date').value || null,
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
      showFieldErrors(form, error.fields, idMap);
      if (error.status === 409) loadData().catch(() => {});
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
      const departureDate = localDateString(departure);
      const validFrom = $('#schedule-valid-from').value || departureDate;
      if (!isValidDateOnly(validFrom)) { notify('Enter a valid "Valid from" date.', true); return; }
      if (parseDateValue(validFrom) > parseDateValue(departureDate)) {
        notify('"Valid from" cannot be after the departure date.', true);
        return;
      }
      const fallbackEnd = new Date(departure.getTime());
      fallbackEnd.setMonth(fallbackEnd.getMonth() + 6);
      const validTo = $('#schedule-valid-to').value || localDateString(fallbackEnd);
      if (parseDateValue(validTo) < parseDateValue(validFrom)) {
        notify('"Valid through" must be on or after "Valid from".', true);
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
  const setMetroCardFormDefaults = () => {
    const today = new Date();
    const expiry = new Date(today.getFullYear() + 3, today.getMonth(), today.getDate());
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if ($('#metrocard-issue')) $('#metrocard-issue').value = localDateString(today);
    if ($('#metrocard-expiry')) {
      $('#metrocard-expiry').value = localDateString(expiry);
      $('#metrocard-expiry').min = localDateString(tomorrow);
    }
    if ($('#metrocard-active')) $('#metrocard-active').checked = true;
  };
  setMetroCardFormDefaults();
  $('#metrocard-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    clearFieldErrors(form);
    const idMap = {
      cardId: 'metrocard-id', passengerId: 'metrocard-passenger', balance: 'metrocard-balance',
      issueDate: 'metrocard-issue', expiryDate: 'metrocard-expiry'
    };
    const cardId = $('#metrocard-id').value.trim();
    const passengerId = $('#metrocard-passenger').value;
    const balanceText = $('#metrocard-balance').value;
    const balance = Number(balanceText);
    const issueDate = $('#metrocard-issue').value;
    const expiryDate = $('#metrocard-expiry').value;
    const isActive = $('#metrocard-active').checked;
    const passenger = state.users.find((item) => item.userId === passengerId && item.role !== 'ADMIN' && item.isActive !== false);
    const problems = {};
    if (!cardId) problems.cardId = 'Enter a card ID.';
    else if (state.metroCards.some((item) => item.cardId === cardId)) problems.cardId = 'That metro card ID already exists.';
    if (!passenger) problems.passengerId = 'Choose an active passenger.';
    else if (isActive && state.metroCards.some((item) => item.passengerId === passengerId && item.isActive !== false)) {
      problems.passengerId = 'This passenger already has an active metro card.';
    }
    if (balanceText === '' || !Number.isFinite(balance) || balance < 0) problems.balance = 'Enter an opening balance of 0 or more.';
    if (!isValidDateOnly(issueDate)) problems.issueDate = 'Enter a valid issue date.';
    if (!isValidDateOnly(expiryDate)) problems.expiryDate = 'Enter a valid expiry date.';
    else if (isValidDateOnly(issueDate) && parseDateValue(expiryDate) <= parseDateValue(issueDate)) problems.expiryDate = 'Expiry must be after the issue date.';
    else if (parseDateValue(expiryDate) < startOfToday()) problems.expiryDate = 'Expiry cannot be in the past.';
    if (Object.keys(problems).length) {
      showFieldErrors(form, problems, idMap);
      notify(Object.values(problems)[0], true);
      return;
    }
    try {
      const card = await api('metro-cards', {
        method: 'POST',
        body: JSON.stringify({ cardId, passengerId, balance, issueDate, expiryDate, isActive })
      });
      state.metroCards.push(card);
      event.target.reset();
      setMetroCardFormDefaults();
      refreshAll();
      notify('Metro card issued');
    } catch (error) {
      showFieldErrors(form, error.fields, idMap);
      if (error.status === 409) loadData().catch(() => {});
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
  const message = window.location.protocol === 'file:'
    ? 'Start the preview server, then open http://localhost:8080 to sign in and load metro data.'
    : `Could not load metro data: ${error.message}`;
  notify(message, true);
});
setInterval(() => {
  if (!state.currentUser) return;
  renderNetworkStatusSummary();
  if (isAdmin()) lineStatusRows('#admin-line-status');
}, 60000);
