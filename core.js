(function () {
  'use strict';
  function forTask(id) {
    const data = window.RundreiseTasks[String(id)];
    if (!data) throw new Error('Unbekannte Aufgabe.');
    function isValidRoute(route, complete) {
      return Array.isArray(route) && route.length <= data.cities.length &&
        (!complete || route.length === data.cities.length) &&
        Array.from(route).every(i => Number.isInteger(i) && i >= 0 && i < data.cities.length) &&
        new Set(route).size === route.length;
    }
    function routeLength(route) {
      if (!isValidRoute(route, false)) throw new Error('Ungültige Route.');
      let total = 0;
      for (let i = 1; i < route.length; i++) total += data.distances[route[i - 1]][route[i]];
      if (route.length === data.cities.length) total += data.distances[route[route.length - 1]][route[0]];
      return total;
    }
    function addCity(route, index) {
      const next = route.concat(index);
      return isValidRoute(next, false) ? next : route.slice();
    }
    return Object.freeze({ isValidRoute, routeLength, addCity });
  }
  function cleanName(name) {
    return String(name || '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  }
  function cleanRoom(room) {
    return String(room || '').trim().toLowerCase();
  }
  window.RundreiseCore = Object.freeze({ ...forTask('12'), forTask, cleanName, cleanRoom });
})();
