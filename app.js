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
    route = core.addCity(route, index);
    renderRoute();
  }
  function renderRoute() {
    const complete = core.isValidRoute(route, true);
    const length = number.format(core.routeLength(route));
    $('city-count').textContent = route.length;
    $('distance').textContent = length;
    $('trip-heading').textContent = complete ? 'Dein Ergebnis' : 'Strecke bisher';
    $('trip-panel').classList.toggle('is-complete', complete);
    $('route-state').textContent = complete ? 'Alle Städte besucht' : (route.length ? 'Noch ' + (data.cities.length - route.length) + ' Städte' : 'Wähle deinen Start');
    $('distance-note').textContent = complete ? 'Inklusive Rückweg nach ' + data.cities[route[0]].name + '.' : 'Der Rückweg zählt mit, sobald alle Städte besucht sind.';
    $('map-hint').textContent = complete ? 'Runde komplett! Probiere eine andere Reihenfolge, um die Strecke zu verkürzen.' : route.length ? 'Wähle die nächste noch nicht besuchte Stadt.' : 'Klicke eine beliebige Stadt als Start und Ziel an.';
    $('result-message').textContent = complete ? 'Geschafft! Deine Rundreise ist ' + length + ' km lang.' : '';
    $('progress').setAttribute('aria-valuenow', route.length);
    $('progress-fill').style.width = (route.length / data.cities.length * 100) + '%';
    $('undo').disabled = route.length === 0;
    $('reset').disabled = route.length === 0;
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
      marker.setAttribute('aria-disabled', String(position !== -1));
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
    drafts.set(task, route.slice());
    task = next;
    data = window.RundreiseTasks[task];
    map = task === '22' ? window.RundreiseMap22 : window.RundreiseMap;
    core = window.RundreiseCore.forTask(task);
    route = (drafts.get(task) || []).slice();
    const url = new URL(window.location.href);
    url.searchParams.set('aufgabe', task);
    try { history.replaceState(null, '', url); } catch (_) { /* Auch als lokale Datei spielbar. */ }
    updateTask();
  }
  document.querySelectorAll('.task-choice').forEach(button => {
    button.addEventListener('click', () => switchTask(button.dataset.task));
  });
  $('undo').addEventListener('click', () => { route.pop(); renderRoute(); });
  $('reset').addEventListener('click', () => { route = []; renderRoute(); });
  updateTask();
})();
