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

function renderDashboardTransit() {
  const map = $('#dashboard-map-preview');
  const departures = $('#dashboard-departures');
  if (!map || !departures) return;
  renderNetworkSvg('#dashboard-map-preview');
  const now = new Date();
  const activeTrainIds = new Set(state.trains.filter((train) => train.isActive !== false).map((train) => train.trainId));
  const upcoming = state.schedules
    .filter((schedule) => schedule.isActive !== false && activeTrainIds.has(schedule.trainId))
    .map((schedule) => ({ schedule, departure: nextScheduleDeparture(schedule, now) }))
    .filter((item) => item.departure)
    .sort((a, b) => a.departure - b.departure)
    .slice(0, 3);
  departures.innerHTML = upcoming.length ? upcoming.map(({ schedule, departure }) => {
    const route = state.routes.find((item) => item.routeId === schedule.routeId);
    const color = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(route?.lineColor || '')) ? route.lineColor : '#2478f2';
    const timeLabel = departure.toDateString() === now.toDateString()
      ? `Today · ${departure.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : departure.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return `<article class="dashboard-departure"><span class="dashboard-departure-line" style="--line-color:${escapeHtml(color)}"></span><div><strong>${escapeHtml(routeName(schedule.routeId))}</strong><span>${escapeHtml(trainName(schedule.trainId))}</span></div><time>${escapeHtml(timeLabel)}</time></article>`;
  }).join('') : '<p class="dashboard-departures-empty">No upcoming departures are scheduled.</p>';
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
    slot.innerHTML = `<section class="panel wallet-empty"><span class="wallet-empty-icon">🚇</span><p class="eyebrow">MetroPass wallet</p><h3>Your travel card is on its way</h3><p>No card is linked to this account yet. A station administrator can issue one, then you can top it up or choose a time pass here.</p></section>`;
    return;
  }
  const now = Date.now();
  const activePass = state.metroCardPasses.find((pass) => new Date(pass.startsAt).getTime() <= now && new Date(pass.expiresAt).getTime() > now);
  const nextPass = state.metroCardPasses.filter((pass) => new Date(pass.startsAt).getTime() > now).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];
  const passNames = { DAY: '24-hour unlimited', WEEK: '7-day unlimited', MONTH: '30-day unlimited' };
  const passOptions = [
    { type: 'DAY', label: '24-hour pass', price: 120, detail: 'Unlimited rides for 24 hours' },
    { type: 'WEEK', label: '7-day pass', price: 600, detail: 'Unlimited rides for 7 days' },
    { type: 'MONTH', label: '30-day pass', price: 1800, detail: 'Unlimited rides for 30 days' }
  ];
  slot.innerHTML = `
    <div class="wallet-layout">
    <div class="wallet-card-stack">
    <div class="wallet-card">
      <div class="wallet-card-top"><strong>METROPASS CARD</strong><span class="wallet-chip"></span></div>
      <p class="wallet-balance-label">Stored value · available to ride or buy a pass</p>
      <div class="wallet-balance">${money(card.balance)}</div>
      <div class="wallet-card-bottom">
        <div>Card ID<strong>${escapeHtml(card.cardId)}</strong></div>
        <div>Expires<strong>${formatDate(card.expiryDate)}</strong></div>
        <div>Status<strong>${card.isActive === false ? 'Inactive' : cardIsExpired(card) ? 'Expired' : 'Active'}</strong></div>
      </div>
    </div>
    <div class="wallet-actions">
      <button type="button" class="primary-action wallet-topup" data-topup-card="${escapeHtml(card.cardId)}"${cardIsUsable(card) ? '' : ' disabled'}>＋ Add money</button>
      ${cardIsUsable(card) ? '' : '<span class="field-hint">This card is inactive or expired, so it cannot be topped up.</span>'}
    </div>
    </div>
    <aside class="wallet-city-art" aria-label="Metro route map">
      <div id="wallet-map-preview" class="wallet-map-preview" aria-label="Configured metro lines"></div>
      <div class="wallet-city-art-caption"><span>YOUR METRO NETWORK</span><strong>One city.<br>Every stop.</strong><a href="#network">Explore the lines <span aria-hidden="true">↗</span></a></div>
    </aside>
    </div>
    <section class="panel pass-panel">
      <div class="panel-heading"><div><p class="eyebrow">Unlimited travel</p><h3>Time passes</h3><p>Buy with your stored balance. A new pass starts after your current pass ends.</p></div><span class="badge ${activePass ? 'good' : 'muted'}">${activePass ? 'Pass active' : 'Pay as you go'}</span></div>
      ${activePass ? `<div class="active-pass-banner"><span class="active-pass-icon">✓</span><div><strong>${escapeHtml(passNames[activePass.passType] || 'Unlimited pass')} is active</strong><span>Until ${new Date(activePass.expiresAt).toLocaleString()}</span></div></div>` : nextPass ? `<div class="active-pass-banner upcoming"><span class="active-pass-icon">◷</span><div><strong>${escapeHtml(passNames[nextPass.passType] || 'Unlimited pass')} is ready next</strong><span>Starts ${new Date(nextPass.startsAt).toLocaleString()}</span></div></div>` : ''}
      <div class="pass-options">${passOptions.map((pass) => `<article class="pass-option"><div class="pass-option-icon">${pass.type === 'DAY' ? '☀' : pass.type === 'WEEK' ? '▦' : '♾'}</div><div class="pass-option-copy"><strong>${pass.label}</strong><span>${pass.detail}</span></div><div class="pass-option-buy"><strong>${money(pass.price)}</strong><button class="ghost-action" type="button" data-buy-pass="${pass.type}" data-card-id="${escapeHtml(card.cardId)}" data-price="${pass.price}" data-label="${pass.label}"${cardIsUsable(card) && Number(card.balance) >= pass.price ? '' : ' disabled'}>Buy</button></div></article>`).join('')}</div>
      ${cardIsUsable(card) ? '' : '<p class="field-hint">Pass purchases are available when the card is active and unexpired.</p>'}
    </section>
    <section class="panel wallet-activity">
      <div class="panel-heading"><div><p class="eyebrow">Your wallet</p><h3>Recent activity</h3></div><span class="count-label">Latest 20</span></div>
      ${state.metroCardTransactions.length ? `<div class="wallet-activity-list">${state.metroCardTransactions.map((item) => { const credit = ['TOP_UP', 'REFUND'].includes(item.transactionType); return `<div class="wallet-activity-row"><span class="wallet-activity-icon ${credit ? 'credit' : ''}">${credit ? '＋' : item.transactionType === 'PASS_PURCHASE' ? '◷' : '↗'}</span><div><strong>${escapeHtml(item.description || item.transactionType)}</strong><span>${new Date(item.createdAt).toLocaleString()}</span></div><div class="wallet-activity-amount"><strong>${credit ? '+' : '−'}${money(item.amount)}</strong><span>Balance ${money(item.balanceAfter)}</span></div></div>`; }).join('')}</div>` : '<p class="empty-state">Your top-ups, pass purchases, and rides will appear here.</p>'}
    </section>
    </div>
  `;
  renderNetworkSvg('#wallet-map-preview');
}

function renderProfile() {
  const user = state.users.find((u) => u.userId === state.currentUser?.userId) || state.currentUser;
  const rows = [
    ['Name', displayName(user)],
    ['User ID', user.userId],
    ['Email', user.contact || '—'],
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
      <td>${escapeHtml(paymentLabel(payment))}</td>
      <td>${formatDate(payment.createdAt)}</td>
    </tr>
  `).join('') : '<tr><td colspan="5" class="empty-state">No payments recorded.</td></tr>';
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
      <td><div class="row-actions"><button class="text-action" type="button" data-admin-action="edit-user" data-id="${escapeHtml(user.userId)}">Edit</button><button class="text-action" type="button" data-admin-action="reset-password" data-id="${escapeHtml(user.userId)}">Reset password</button><button class="text-action" type="button" data-admin-action="toggle-user" data-id="${escapeHtml(user.userId)}">${user.isActive === false ? 'Activate' : 'Deactivate'}</button><button class="danger-action" type="button" data-admin-action="delete-user" data-id="${escapeHtml(user.userId)}">Delete</button></div></td>
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
      <td><span class="badge ${card.isActive === false || cardIsExpired(card) ? 'muted' : 'good'}">${card.isActive === false ? 'Inactive' : cardIsExpired(card) ? 'Expired' : 'Active'}</span></td>
      <td><div class="row-actions">${cardIsUsable(card) ? `<button class="text-action" type="button" data-admin-action="topup-card" data-id="${escapeHtml(card.cardId)}">Top up</button>` : ''}<button class="text-action" type="button" data-admin-action="edit-card" data-id="${escapeHtml(card.cardId)}">Edit</button><button class="text-action" type="button" data-admin-action="toggle-card" data-id="${escapeHtml(card.cardId)}">${card.isActive === false ? 'Activate' : 'Deactivate'}</button><button class="danger-action" type="button" data-admin-action="delete-card" data-id="${escapeHtml(card.cardId)}">Delete</button></div></td>
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

