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
    function canTwoOpt(route, first, second) {
      if (!isValidRoute(route, true) || !Number.isInteger(first) || !Number.isInteger(second)) return false;
      if (first < 0 || second < 0 || first >= route.length || second >= route.length) return false;
      const gap = Math.abs(first - second);
      return gap > 1 && gap < route.length - 1;
    }
    function twoOpt(route, first, second) {
      if (!canTwoOpt(route, first, second)) throw new Error('Wählen Sie zwei Kanten ohne gemeinsame Stadt.');
      const left = Math.min(first, second), right = Math.max(first, second);
      return route.slice(0, left + 1).concat(route.slice(left + 1, right + 1).reverse(), route.slice(right + 1));
    }
    return Object.freeze({ isValidRoute, routeLength, addCity, canTwoOpt, twoOpt });
  }
  window.RundreiseCore = Object.freeze({ forTask });
})();
