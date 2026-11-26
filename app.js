(function () {
  'use strict';
  const common = window.RundreiseCore;
  const config = window.RUNDREISE_CONFIG;
  const $ = id => document.getElementById(id);
  const number = new Intl.NumberFormat('de-DE');
  const svgNS = 'http://www.w3.org/2000/svg';
  const query = new URLSearchParams(window.location.search);
  let task = Object.hasOwn(window.RundreiseTasks, query.get('aufgabe')) ? query.get('aufgabe') : '12';
  let data = window.RundreiseTasks[task];
  let map = task === '22' ? window.RundreiseMap22 : window.RundreiseMap;
  let core = common.forTask(task);
  const projector = query.get('ansicht') === 'rangliste';
  const configured = /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(config.supabaseUrl) &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey);
  let route = [];
  let player = null;
  let submitting = false;
  let submitted = '';
  let boardRequest = 0;
  let lastReadFailed = false;
  const transientPlayers = new Map();
  const drafts = new Map();

  function readStorage(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
  }
  function saveStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Sitzung funktioniert auch ohne lokalen Speicher. */ }
  }
  function roomCode() { return player ? player.room : common.cleanRoom($('room-code').value); }
  function validRoom(room) { return /^[a-z0-9_-]{3,32}$/.test(room); }
  function getPlayer(name, room) {
    const storageKey = (task === '12' ? 'rundreise-player:' : 'rundreise-player-22:') + room + ':' + name.toLocaleLowerCase('de-DE');
    const stored = readStorage(storageKey, null) || transientPlayers.get(storageKey);
    const token = stored && /^[a-f0-9-]{36}$/i.test(stored.token) ? stored.token : crypto.randomUUID();
    const next = { name, room, token, publicId: stored ? stored.publicId : null, storageKey };
    transientPlayers.set(storageKey, next);
    saveStorage(storageKey, next);
    return next;
  }
  function point(index) {
    return [map.cities[index].x, map.cities[index].y];
  }
  function svg(tag, attrs) {
    const el = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, String(value));
    return el;
  }
  function makeMap() {
    $('city-markers').replaceChildren();
    $('city-options').replaceChildren();
    $('map').setAttribute('viewBox', map.viewBox.join(' '));
    const [left, top, width, height] = map.viewBox;
    for (const [key, value] of Object.entries({x: left, y: top, width, height})) $('map-background').setAttribute(key, value);
    const image = map.image || {href: 'germany.svg', width: 164, height: 219};
    for (const [key, value] of Object.entries(image)) $('country').setAttribute(key, value);
    $('map').style.setProperty('--label-size', (map.labelSize || 10) + 'px');
    $('map').style.setProperty('--order-size', (map.orderSize || 4.8) + 'px');
    $('map').style.setProperty('--route-width', map.routeWidth || 1.1);
    data.cities.forEach((city, index) => {
      const [x, y] = point(index);
      const position = map.cities[index];
      const marker = svg('g', { class: 'city inactive', role: 'button', tabindex: 0, 'aria-label': city.name, 'aria-disabled': 'true', 'data-city': index });
      marker.append(svg('circle', { class: 'city-hit', cx: x, cy: y, r: map.hitRadius || 6.25 }));
      marker.append(svg('rect', {
        class: 'city-hit', x: position.labelX - 1.5, y: position.labelTop - 1.5,
        width: position.labelWidth + 3, height: position.labelHeight + 3
      }));
      marker.append(svg('circle', { class: 'city-dot', cx: x, cy: y, r: map.dotRadius || 3.55 }));
      const label = svg('text', { class: 'city-label', x: position.labelX, y: position.labelY });
      label.textContent = city.name;
      const order = svg('text', { class: 'city-order', x, y });
      marker.append(label, order);
      marker.addEventListener('click', () => chooseCity(index));
      marker.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseCity(index); }
      });
      $('city-markers').append(marker);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'button secondary'; button.dataset.city = index;
      button.textContent = city.name; button.addEventListener('click', () => chooseCity(index));
      $('city-options').append(button);
    });
  }
  function chooseCity(index) {
    if (!player || submitting || route.includes(index)) return;
    route = core.addCity(route, index);
    submitted = '';
    message('');
    renderRoute();
  }
  function message(text, error) {
    $('submission-message').textContent = text;
    $('submission-message').dataset.error = error ? 'true' : 'false';
  }
  function renderRoute() {
    const complete = core.isValidRoute(route, true);
    $('city-count').textContent = route.length;
    $('distance').textContent = number.format(core.routeLength(route));
    $('trip-heading').textContent = complete ? 'Deine Rundreise' : 'Strecke bisher';
    $('route-state').textContent = complete ? 'Alle Städte besucht' : (route.length ? 'Noch ' + (data.cities.length - route.length) + ' Städte' : 'Wähle deinen Start');
    $('distance-note').textContent = complete ? 'Inklusive Rückweg nach ' + data.cities[route[0]].name + '.' : 'Der Rückweg zählt mit, sobald alle Städte besucht sind.';
    $('map-hint').textContent = !player ? 'Gib deinen Namen ein. Dann kann die Reise beginnen.' : complete ? 'Runde komplett! Reiche deine Tour ein oder probiere eine neue Reihenfolge.' : route.length ? 'Wähle die nächste noch nicht besuchte Stadt.' : 'Klicke eine beliebige Stadt als Start und Ziel an.';
    $('progress').setAttribute('aria-valuenow', route.length);
    $('progress-fill').style.width = (route.length / data.cities.length * 100) + '%';
    $('undo').disabled = route.length === 0 || submitting;
    $('reset').disabled = route.length === 0 || submitting;
    $('change-player').disabled = submitting;
    document.querySelectorAll('.task-choice').forEach(button => { button.disabled = submitting; });
    $('submit-tour').disabled = !complete || !player || !configured || submitting || submitted === route.join(',');
    $('submit-tour').textContent = submitting ? 'Wird eingereicht …' : submitted === route.join(',') && complete ? 'Tour eingereicht' : 'Tour einreichen';
    $('route-lines').replaceChildren();
    if (route.length > 1) {
      $('route-lines').append(svg('polyline', { class: 'route-line', points: route.map(i => point(i).join(',')).join(' ') }));
      if (complete) {
        const [x1,y1] = point(route[route.length - 1]), [x2,y2] = point(route[0]);
        $('route-lines').append(svg('line', { class: 'route-line return-line', x1,y1,x2,y2 }));
      }
    }
    Array.from($('city-markers').children).forEach((marker, index) => {
      const position = route.indexOf(index);
      marker.classList.toggle('visited', position !== -1);
      marker.classList.toggle('start', position === 0);
      marker.classList.toggle('inactive', !player);
      marker.setAttribute('aria-disabled', String(!player || position !== -1 || submitting));
      marker.setAttribute('aria-label', data.cities[index].name + (position === -1 ? ', als nächste Stadt wählen' : ', Station ' + (position + 1) + (position === 0 ? ', Start und Ziel' : '')));
      marker.querySelector('.city-dot').setAttribute('r', position === -1 ? (map.dotRadius || 3.55) : (map.visitedRadius || 4.4));
      marker.querySelector('.city-order').textContent = position === -1 ? '' : position + 1;
    });
    Array.from($('city-options').children).forEach((button, index) => {
      button.disabled = !player || route.includes(index) || submitting;
      button.textContent = (route.includes(index) ? (route.indexOf(index) + 1) + '. ' : '') + data.cities[index].name;
    });
    const list = $('route-list');
    list.replaceChildren();
    if (route.length === 0) {
      const empty = document.createElement('li'); empty.className = 'route-empty';
      empty.textContent = 'Deine erste Stadt wird dein Start und Ziel.'; list.append(empty);
    }
    route.forEach((index, position) => appendStop(index, String(position + 1), position ? data.distances[route[position - 1]][index] : null, false));
    if (complete) appendStop(route[0], 'Ziel', data.distances[route[route.length - 1]][route[0]], true);
    list.scrollTop = list.scrollHeight;
  }
  function appendStop(index, position, length, returnStop) {
    const li = document.createElement('li');
    if (returnStop) li.className = 'return-stop';
    const badge = document.createElement('span'); badge.className = 'route-number'; badge.textContent = position;
    const name = document.createElement('span'); name.textContent = data.cities[index].name;
    li.append(badge, name);
    if (length !== null) { const leg = document.createElement('span'); leg.className = 'route-leg'; leg.textContent = number.format(length) + ' km'; li.append(leg); }
    $('route-list').append(li);
  }
  async function rpc(fn, payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(config.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal, cache: 'no-store'
      });
      const result = await response.json();
      if (!response.ok) {
        // Nur absichtlich formulierte Datenbankmeldungen anzeigen.
        throw new Error(result.code === 'P0001' ? result.message : 'Die Rangliste ist gerade nicht erreichbar. Bitte versuche es erneut.');
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Keine Verbindung zur Rangliste. Deine Route bleibt hier erhalten.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function refreshBoard() {
    const room = roomCode();
    const requestedTask = task;
    const request = ++boardRequest;
    if (!configured || !validRoom(room)) return;
    $('refresh').disabled = true;
    try {
      const entries = await rpc('get_tsp_leaderboard', { p_room: room, p_city_count: data.cities.length });
      if (request !== boardRequest || room !== roomCode() || task !== requestedTask) return;
      lastReadFailed = false;
      const body = $('leaderboard-body'); body.replaceChildren();
      for (const entry of entries) {
        const row = document.createElement('tr');
        const own = player && entry.public_id === player.publicId;
        if (own) row.className = 'own-score';
        const rank = document.createElement('td'); rank.textContent = entry.place + '.';
        const name = document.createElement('td'); name.textContent = entry.player_name;
        if (own) { const tag = document.createElement('span'); tag.className = 'you-label'; tag.textContent = 'Du'; name.append(tag); }
        const length = document.createElement('td'); length.className = 'numeric'; length.textContent = number.format(entry.distance_km) + ' km';
        row.append(rank, name, length); body.append(row);
      }
      $('leaderboard-table').hidden = entries.length === 0;
      $('leaderboard-status').dataset.error = 'false';
      const context = 'Workshop ' + room + ' · ' + data.cities.length + ' Städte';
      $('leaderboard-status').textContent = entries.length ? context + ' · Aktualisiert um ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' · Automatisch alle ' + config.refreshSeconds + ' Sekunden' : context + ': Noch keine Tour eingereicht. Mach den Anfang!';
    } catch (error) {
      if (request !== boardRequest) return;
      lastReadFailed = true;
      $('leaderboard-status').dataset.error = 'true';
      $('leaderboard-status').textContent = error.message + ($('leaderboard-body').children.length ? ' Angezeigte Ergebnisse sind möglicherweise veraltet.' : '');
    } finally { if (request === boardRequest) $('refresh').disabled = false; }
  }
  function clearBoard() {
    boardRequest++;
    lastReadFailed = false;
    $('refresh').disabled = !configured;
    $('leaderboard-body').replaceChildren(); $('leaderboard-table').hidden = true;
    $('leaderboard-status').dataset.error = 'false';
    $('leaderboard-status').textContent = configured ? 'Rangliste wird geladen …' : 'Die gemeinsame Rangliste ist noch nicht verbunden.';
  }
  function updateTask() {
    $('task-title').textContent = data.cities.length === 22 ? '22 Städte.' : 'Zwölf Städte.';
    $('city-total').textContent = data.cities.length;
    $('map-title').textContent = 'Karte mit ' + data.cities.length + ' Städten in Deutschland';
    $('progress').setAttribute('aria-valuemax', data.cities.length);
    $('leaderboard-heading').textContent = 'Die kürzesten Touren · ' + data.cities.length + ' Städte';
    $('leaderboard-description').textContent = 'Pro Teilnahme zählt die beste eingereichte Rundreise mit ' + data.cities.length + ' Städten.';
    document.querySelectorAll('.task-choice').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.task === task));
    });
    makeMap(); renderRoute(); clearBoard();
  }
  function switchTask(next) {
    if (submitting || next === task || !Object.hasOwn(window.RundreiseTasks, next)) return;
    drafts.set(task, {route: route.slice(), submitted});
    task = next;
    data = window.RundreiseTasks[task];
    map = task === '22' ? window.RundreiseMap22 : window.RundreiseMap;
    core = common.forTask(task);
    const draft = drafts.get(task);
    route = draft ? draft.route.slice() : [];
    submitted = draft ? draft.submitted : '';
    if (player) player = getPlayer(player.name, player.room);
    message('');
    const url = new URL(window.location.href);
    url.searchParams.set('aufgabe', task);
    try { history.replaceState(null, '', url); } catch (_) { /* Auch als lokale Datei spielbar. */ }
    updateTask(); refreshBoard();
  }
  document.querySelectorAll('.task-choice').forEach(button => {
    button.addEventListener('click', () => switchTask(button.dataset.task));
  });
  $('player-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = common.cleanName($('player-name').value), room = common.cleanRoom($('room-code').value);
    if (!name || Array.from(name).length > 30 || !validRoom(room)) return;
    player = getPlayer(name, room);
    route = []; submitted = ''; drafts.clear(); message('');
    $('active-name').textContent = name; $('active-room').textContent = room;
    $('room-code').value = room;
    $('player-form').hidden = true; $('player-summary').hidden = false;
    saveStorage('rundreise-last-player', { name, room });
    clearBoard(); renderRoute(); refreshBoard();
    const first = $('city-markers').querySelector('[data-city="5"]'); first.focus({ preventScroll: true });
  });
  $('change-player').addEventListener('click', () => {
    if (submitting) return;
    player = null; route = []; submitted = ''; drafts.clear(); message('');
    $('player-form').hidden = false; $('player-summary').hidden = true;
    renderRoute(); $('player-name').focus();
  });
  $('undo').addEventListener('click', () => { if (submitting) return; route.pop(); submitted = ''; message(''); renderRoute(); });
  $('reset').addEventListener('click', () => { if (submitting) return; route = []; submitted = ''; message(''); renderRoute(); });
  $('refresh').addEventListener('click', refreshBoard);
  $('room-code').addEventListener('change', () => { if (!player) { clearBoard(); refreshBoard(); } });
  $('submit-tour').addEventListener('click', async () => {
    if (!player || !configured || submitting || !core.isValidRoute(route, true)) return;
    submitting = true; message('Deine Rundreise wird geprüft …'); renderRoute();
    try {
      const result = await rpc('submit_tsp_tour', { p_room: player.room, p_player_token: player.token, p_name: player.name, p_route: route.slice(), p_city_count: data.cities.length });
      player.publicId = result.public_id;
      transientPlayers.set(player.storageKey, player); saveStorage(player.storageKey, player);
      submitted = route.join(',');
      message(result.improved ? 'Gespeichert! Deine beste Runde: ' + number.format(result.best_km) + ' km.' : 'Tour geprüft. Deine bisherige Bestleistung bleibt: ' + number.format(result.best_km) + ' km.');
      await refreshBoard();
      if (lastReadFailed) message('Tour gespeichert. Die Rangliste konnte noch nicht aktualisiert werden.');
    } catch (error) { message(error.message, true); }
    finally { submitting = false; renderRoute(); }
  });

  const previous = readStorage('rundreise-last-player', {});
  $('player-name').value = typeof previous.name === 'string' ? previous.name : '';
  const requestedRoom = common.cleanRoom(query.get('raum') || previous.room || config.defaultRoom);
  $('room-code').value = validRoom(requestedRoom) ? requestedRoom : config.defaultRoom;
  $('setup-notice').hidden = configured;
  $('refresh').disabled = !configured;
  if (projector) document.body.classList.add('projector');
  updateTask();
  if (configured) {
    refreshBoard();
    setInterval(() => { if (!document.hidden) refreshBoard(); }, Math.max(10, config.refreshSeconds) * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBoard(); });
  }
})();
