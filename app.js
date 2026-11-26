(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const number = new Intl.NumberFormat('de-DE');
  const svgNS = 'http://www.w3.org/2000/svg';
  const query = new URLSearchParams(window.location.search);
  let task = Object.hasOwn(window.RundreiseTasks, query.get('aufgabe')) ? query.get('aufgabe') : '12';
  let data = window.RundreiseTasks[task];
  let map = task === '22' ? window.RundreiseMap22 : window.RundreiseMap;
  let core = window.RundreiseCore.forTask(task);
  let route = [];
  let routeHistory = [];
  let selectedEdges = [];
  let swapNotice = '';
  let editNotice = '';
  // Angefangene Routen bleiben ausschließlich in diesem geöffneten Tab.
  const drafts = new Map();

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
      const marker = svg('g', { class: 'city', role: 'button', tabindex: 0, 'aria-label': city.name, 'aria-disabled': 'false', 'data-city': index });
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
    if (route.includes(index)) return;
    routeHistory.push(route.slice());
    route = core.addCity(route, index);
    clearSelection(); editNotice = '';
    renderRoute();
  }
  function clearSelection() {
    selectedEdges = []; swapNotice = '';
  }
  function edgeName(index) {
    return data.cities[route[index]].name + ' – ' + data.cities[route[(index + 1) % route.length]].name;
  }
  function describeChange(delta) {
    return delta === 0 ? 'gleich lang' : number.format(Math.abs(delta)) + ' km ' + (delta < 0 ? 'kürzer' : 'länger');
  }
  function chooseEdge(index) {
    if (!core.isValidRoute(route, true) || !Number.isInteger(index) || index < 0 || index >= route.length) return;
    swapNotice = '';
    if (selectedEdges.includes(index)) {
      selectedEdges = selectedEdges.filter(edge => edge !== index);
    } else if (selectedEdges.length !== 1) {
      selectedEdges = [index];
    } else if (core.canTwoOpt(route, selectedEdges[0], index)) {
      selectedEdges.push(index);
    } else {
      swapNotice = 'Diese Kanten haben eine gemeinsame Stadt. Wählen Sie eine andere zweite Kante.';
    }
    renderSwap();
    if (selectedEdges.length === 2) {
      $('swap-apply').focus({preventScroll: true});
      $('two-opt-panel').scrollIntoView({block: 'nearest'});
    }
  }
  function renderSwap() {
    const complete = core.isValidRoute(route, true);
    $('two-opt-panel').hidden = !complete;
    $('city-picker').hidden = complete;
    $('swap-preview').replaceChildren();
    $('swap-clear').disabled = selectedEdges.length === 0;
    $('swap-apply').disabled = !complete || selectedEdges.length !== 2;
    $('swap-distance').hidden = true;
    $('swap-distance').textContent = '';
    $('undo').disabled = routeHistory.length === 0 && selectedEdges.length === 0;
    for (const element of document.querySelectorAll('.route-edge, #edge-options button')) {
      const selected = selectedEdges.includes(Number(element.dataset.edge));
      element.classList.toggle('is-selected', selected);
      element.setAttribute('aria-pressed', String(selected));
    }
    if (!complete) return;
    $('map-hint').textContent = swapNotice || (selectedEdges.length === 2 ? 'Grün zeigt die neuen Verbindungen. Übernehmen Sie den Tausch oder wählen Sie andere Kanten.' : selectedEdges.length === 1 ? 'Eine Kante ist gewählt. Klicken Sie eine zweite ohne gemeinsame Stadt an.' : 'Klicken Sie zwei Kanten an, um Ihre Rundreise mit 2-opt zu verändern.');
    $('swap-status').textContent = swapNotice || (selectedEdges.length === 2 ? 'Zwei Kanten gewählt. Prüfen Sie die neue Strecke, bevor Sie tauschen.' : selectedEdges.length === 1 ? 'Ausgewählt: ' + edgeName(selectedEdges[0]) + '. Wählen Sie eine zweite Kante ohne gemeinsame Stadt.' : 'Klicken Sie zwei Kanten ohne gemeinsame Stadt an.');
    if (selectedEdges.length !== 2) return;
    const candidate = core.twoOpt(route, ...selectedEdges);
    const nextLength = core.routeLength(candidate);
    const delta = nextLength - core.routeLength(route);
    $('swap-distance').hidden = false;
    $('swap-distance').dataset.change = delta < 0 ? 'shorter' : delta > 0 ? 'longer' : 'equal';
    $('swap-distance').textContent = 'Nach dem Tausch: ' + number.format(nextLength) + ' km · ' + describeChange(delta);
    const [left, right] = selectedEdges.slice().sort((a, b) => a - b);
    for (const [a, b] of [[route[left], route[right]], [route[left + 1], route[(right + 1) % route.length]]]) {
      const [x1, y1] = point(a), [x2, y2] = point(b);
      $('swap-preview').append(svg('line', {class: 'swap-preview-line', x1, y1, x2, y2}));
    }
  }
  function drawEdges(complete) {
    $('route-lines').replaceChildren(); $('edge-options').replaceChildren();
    if (route.length < 2) return;
    if (!complete) {
      $('route-lines').append(svg('polyline', {class: 'route-line', 'aria-hidden': 'true', points: route.map(i => point(i).join(',')).join(' ')}));
      return;
    }
    route.forEach((city, index) => {
      const next = route[(index + 1) % route.length];
      const [x1, y1] = point(city), [x2, y2] = point(next);
      const edge = svg('g', {class: 'route-edge', role: 'button', tabindex: 0, 'data-edge': index, 'aria-pressed': 'false', 'aria-label': edgeName(index) + ', ' + number.format(data.distances[city][next]) + ' Kilometer, für 2-opt auswählen'});
      edge.append(svg('line', {class: 'edge-hit', x1, y1, x2, y2}));
      edge.append(svg('line', {class: 'route-line' + (index === route.length - 1 ? ' return-line' : ''), x1, y1, x2, y2}));
      edge.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseEdge(index); }
      });
      $('route-lines').append(edge);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'button secondary'; button.dataset.edge = index;
      button.setAttribute('aria-pressed', 'false');
      button.textContent = edgeName(index) + ' (' + number.format(data.distances[city][next]) + ' km)';
      button.addEventListener('click', () => chooseEdge(index));
      $('edge-options').append(button);
    });
  }
  function nearestEdge(event) {
    // In Bildschirmkoordinaten messen, damit schmale Karten auf Smartphones
    // genauso gut bedienbar sind. Bei überlappenden Klickflächen zählt die Nähe.
    const matrix = $('map').getScreenCTM();
    if (!matrix) return null;
    let closest = null, bestDistance = 14;
    route.forEach((city, index) => {
      const [ax, ay] = point(city), [bx, by] = point(route[(index + 1) % route.length]);
      const a = new DOMPoint(ax, ay).matrixTransform(matrix), b = new DOMPoint(bx, by).matrixTransform(matrix);
      const dx = b.x - a.x, dy = b.y - a.y;
      const projection = Math.max(0, Math.min(1, ((event.clientX - a.x) * dx + (event.clientY - a.y) * dy) / (dx * dx + dy * dy)));
      const distance = Math.hypot(event.clientX - a.x - projection * dx, event.clientY - a.y - projection * dy);
      if (distance < bestDistance) { closest = index; bestDistance = distance; }
    });
    return closest;
  }
  function renderRoute() {
    const complete = core.isValidRoute(route, true);
    const length = number.format(core.routeLength(route));
    $('city-count').textContent = route.length;
    $('distance').textContent = length;
    $('trip-heading').textContent = complete ? 'Ihr Ergebnis' : 'Strecke bisher';
    $('trip-panel').classList.toggle('is-complete', complete);
    $('route-state').textContent = complete ? 'Alle Städte besucht' : (route.length ? 'Noch ' + (data.cities.length - route.length) + ' Städte' : 'Wählen Sie Ihren Start');
    $('distance-note').textContent = complete ? 'Inklusive Rückweg nach ' + data.cities[route[0]].name + '.' : 'Der Rückweg zählt mit, sobald alle Städte besucht sind.';
    $('map-hint').textContent = complete ? 'Klicken Sie zwei Kanten an, um Ihre Rundreise mit 2-opt zu verändern.' : route.length ? 'Wählen Sie die nächste noch nicht besuchte Stadt.' : 'Klicken Sie eine beliebige Stadt als Start und Ziel an.';
    $('result-message').textContent = complete ? (editNotice || 'Geschafft! Ihre Rundreise ist ' + length + ' km lang.') : '';
    $('progress').setAttribute('aria-valuenow', route.length);
    $('progress-fill').style.width = (route.length / data.cities.length * 100) + '%';
    $('reset').disabled = route.length === 0;
    $('map').classList.toggle('has-tour', complete);
    drawEdges(complete);
    Array.from($('city-markers').children).forEach((marker, index) => {
      const position = route.indexOf(index);
      marker.classList.toggle('visited', position !== -1);
      marker.classList.toggle('start', position === 0);
      marker.setAttribute('aria-disabled', String(position !== -1));
      marker.setAttribute('tabindex', complete ? '-1' : '0');
      marker.setAttribute('aria-label', data.cities[index].name + (position === -1 ? ', als nächste Stadt wählen' : ', Station ' + (position + 1) + (position === 0 ? ', Start und Ziel' : '')));
      marker.querySelector('.city-dot').setAttribute('r', position === -1 ? (map.dotRadius || 3.55) : (map.visitedRadius || 4.4));
      marker.querySelector('.city-order').textContent = position === -1 ? '' : position + 1;
    });
    Array.from($('city-options').children).forEach((button, index) => {
      button.disabled = route.includes(index);
      button.textContent = (route.includes(index) ? (route.indexOf(index) + 1) + '. ' : '') + data.cities[index].name;
    });
    const list = $('route-list');
    list.replaceChildren();
    if (route.length === 0) {
      const empty = document.createElement('li'); empty.className = 'route-empty';
      empty.textContent = 'Die erste gewählte Stadt ist Ihr Start und Ziel.'; list.append(empty);
    }
    route.forEach((index, position) => appendStop(index, String(position + 1), position ? data.distances[route[position - 1]][index] : null, false));
    if (complete) appendStop(route[0], 'Ziel', data.distances[route[route.length - 1]][route[0]], true);
    list.scrollTop = list.scrollHeight;
    renderSwap();
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
  function updateTask() {
    $('task-title').textContent = data.cities.length === 22 ? '22 Städte.' : 'Zwölf Städte.';
    $('city-total').textContent = data.cities.length;
    $('map-title').textContent = 'Karte mit ' + data.cities.length + ' Städten in Deutschland';
    $('progress').setAttribute('aria-valuemax', data.cities.length);
    document.querySelectorAll('.task-choice').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.task === task));
    });
    makeMap(); renderRoute();
  }
  function switchTask(next) {
    if (next === task || !Object.hasOwn(window.RundreiseTasks, next)) return;
    drafts.set(task, {route: route.slice(), history: routeHistory.map(previous => previous.slice())});
    task = next;
    data = window.RundreiseTasks[task];
    map = task === '22' ? window.RundreiseMap22 : window.RundreiseMap;
    core = window.RundreiseCore.forTask(task);
    const draft = drafts.get(task);
    route = draft ? draft.route.slice() : [];
    routeHistory = draft ? draft.history.map(previous => previous.slice()) : [];
    clearSelection(); editNotice = '';
    const url = new URL(window.location.href);
    url.searchParams.set('aufgabe', task);
    try { history.replaceState(null, '', url); } catch (_) { /* Auch als lokale Datei spielbar. */ }
    updateTask();
  }
  document.querySelectorAll('.task-choice').forEach(button => {
    button.addEventListener('click', () => switchTask(button.dataset.task));
  });
  $('map').addEventListener('click', event => {
    if (event.target.closest('.city')) return;
    if (!core.isValidRoute(route, true)) return;
    const target = event.target.closest('.route-edge');
    const index = nearestEdge(event) ?? (target ? Number(target.dataset.edge) : null);
    if (index !== null) chooseEdge(index);
  });
  $('swap-clear').addEventListener('click', () => { clearSelection(); renderSwap(); });
  $('swap-apply').addEventListener('click', () => {
    if (selectedEdges.length !== 2 || !core.canTwoOpt(route, ...selectedEdges)) return;
    const focusEdge = Math.min(...selectedEdges);
    const candidate = core.twoOpt(route, ...selectedEdges);
    const delta = core.routeLength(candidate) - core.routeLength(route);
    routeHistory.push(route.slice()); route = candidate;
    clearSelection();
    editNotice = '2-opt übernommen: ' + describeChange(delta) + '. Ihre Rundreise ist ' + number.format(core.routeLength(route)) + ' km lang.';
    renderRoute();
    $('route-lines').querySelector('[data-edge="' + focusEdge + '"]').focus({preventScroll: true});
  });
  $('undo').addEventListener('click', () => {
    if (selectedEdges.length) { clearSelection(); renderSwap(); return; }
    if (!routeHistory.length) return;
    route = routeHistory.pop(); clearSelection(); editNotice = ''; renderRoute();
  });
  $('reset').addEventListener('click', () => {
    route = []; routeHistory = []; clearSelection(); editNotice = ''; renderRoute();
  });
  updateTask();
})();
