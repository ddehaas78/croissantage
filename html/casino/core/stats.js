/* stats.js — statistiques du joueur, partagées par toutes les pages.
   Tout est enregistré en localStorage (comme Wallet, Drunk, Skins) et
   consultable au Distributeur (ATM) du lobby : games/atm/atm.html.

   Sources des données :
   - core/wallet.js appelle Stats.money('out' | 'in', montant) à chaque
     mise / gain, et Stats.recharge(montant) à chaque recharge. Le jeu
     concerné est déduit de l'adresse de la page (games/<jeu>/ ou
     games/arcade/<jeu>/), donc rien à faire dans les jeux pour l'argent.
   - chaque jeu appelle Stats.round() au début d'une partie / d'un tour,
     et éventuellement Stats.best(multiplicateur) quand il en a un.
   - le bar appelle Stats.bar('cocktails' | 'remedies' | 'cases' | 'duplicates').
   - le temps de jeu est compté tout seul tant qu'une page est visible.
*/
const Stats = (() => {
  const STORAGE_KEY = 'croissantage_stats_v1';
  const TICK_MS = 10000;

  function empty() {
    return {
      v: 1,
      firstSeen: Date.now(),
      playMs: 0,
      games: {},
      recharges: 0,
      recharged: 0,
      peakBalance: 0,
      bar: { cocktails: 0, remedies: 0, cases: 0, duplicates: 0 },
    };
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && data.v === 1) {
        data.bar = Object.assign(empty().bar, data.bar || {});
        data.games = data.games || {};
        return data;
      }
    } catch (e) { /* stockage indisponible ou corrompu */ }
    return empty();
  }

  function save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* tant pis */ }
  }

  // Jeu de la page courante, d'après son adresse
  function currentGame() {
    const path = decodeURIComponent(location.pathname).replace(/\\/g, '/');
    let m = path.match(/\/games\/arcade\/([^/]+)\/[^/]+\.html$/);
    if (m) return m[1];
    m = path.match(/\/games\/([^/]+)\/[^/]+\.html$/);
    if (m) return m[1];
    return 'lobby';
  }

  function gameEntry(data, id) {
    if (!data.games[id]) data.games[id] = { rounds: 0, wagered: 0, returned: 0, biggestWin: 0, bestMult: 0 };
    return data.games[id];
  }

  function update(fn) {
    const data = load();
    fn(data);
    if (typeof Wallet !== 'undefined' && typeof Wallet.get === 'function') data.peakBalance = Math.max(data.peakBalance || 0, Wallet.get());
    save(data);
  }

  /* ---------------- API ---------------- */
  function money(kind, amount, game) {
    amount = Math.round(amount);
    if (!(amount > 0)) return;
    update((d) => {
      const g = gameEntry(d, game || currentGame());
      if (kind === 'out') g.wagered += amount;
      else {
        g.returned += amount;
        g.biggestWin = Math.max(g.biggestWin, amount);
      }
    });
  }

  function round(game) {
    update((d) => { gameEntry(d, game || currentGame()).rounds += 1; });
  }

  function best(mult, game) {
    if (!(mult > 0)) return;
    update((d) => {
      const g = gameEntry(d, game || currentGame());
      g.bestMult = Math.max(g.bestMult || 0, Math.round(mult * 100) / 100);
    });
  }

  function recharge(amount) {
    update((d) => {
      d.recharges += 1;
      d.recharged += Math.max(0, Math.round(amount));
    });
  }

  function bar(field) {
    update((d) => { d.bar[field] = (d.bar[field] || 0) + 1; });
  }

  function get() {
    return load();
  }

  function reset() {
    save(empty());
  }

  /* ---------------- Temps de jeu ---------------- */
  let last = Date.now();
  function tick() {
    const now = Date.now();
    const dt = now - last;
    last = now;
    if (document.visibilityState === 'visible' && dt > 0 && dt < TICK_MS * 3) {
      update((d) => { d.playMs += dt; });
    }
  }
  setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') last = Date.now();
    else tick();
  });
  window.addEventListener('pagehide', tick);

  return { money, round, best, recharge, bar, get, reset, currentGame };
})();

// `const` ne crée pas de propriété sur window : on l'expose explicitement pour
// que wallet.js et les jeux puissent tester `window.Stats` sans planter si
// stats.js n'est pas inclus sur une page.
window.Stats = Stats;
