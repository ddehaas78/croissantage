/* drunk.js — moteur d'ivresse global (0-100), partagé par toutes les pages
   (bar, blackjack, roulette, columbus, poker...).
   Persisté en localStorage, comme wallet.js, pour que l'effet suive le
   joueur d'une page à l'autre et redescende tout seul avec le temps,
   même après un changement de page ou un reload.
*/
const Drunk = (() => {
  const STORAGE_KEY = 'casino_drunk_level_v1';
  const LAST_TICK_KEY = 'casino_drunk_last_tick_v1';
  const MAX = 100;
  const DECAY_PER_TICK = 2;
  const TICK_MS = 4000;

  function clamp(v) {
    return Math.max(0, Math.min(MAX, v));
  }

  let level = Number(localStorage.getItem(STORAGE_KEY));
  if (!Number.isFinite(level) || level < 0) level = 0;
  level = clamp(level);

  // Rattrape la décroissance qui aurait dû se produire pendant que le
  // joueur était sur une autre page (ou onglet fermé), sinon l'effet
  // resterait figé au niveau quitté avant la navigation.
  const lastTick = Number(localStorage.getItem(LAST_TICK_KEY)) || Date.now();
  const missedTicks = Math.floor((Date.now() - lastTick) / TICK_MS);
  if (missedTicks > 0) level = clamp(level - missedTicks * DECAY_PER_TICK);

  let currentTierClass = null;
  const listeners = new Set();

  function stateLabel(v) {
    if (v < 12) return 'Sobre';
    if (v < 32) return 'Pompette';
    if (v < 55) return 'Éméché';
    if (v < 80) return 'Ivre';
    return 'Complètement bourré';
  }

  function tierForLevel(v) {
    if (v >= 80) return 'drunk-4';
    if (v >= 55) return 'drunk-3';
    if (v >= 32) return 'drunk-2';
    if (v >= 12) return 'drunk-1';
    return null;
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, String(level));
    localStorage.setItem(LAST_TICK_KEY, String(Date.now()));
  }

  function applyEffects() {
    const body = document.body;
    const tier = tierForLevel(level);
    // On ne touche aux classes que si le palier a réellement changé,
    // sinon retirer/rajouter la classe à chaque tick redémarre
    // l'animation CSS et provoque un petit sursaut visuel désagréable.
    if (tier !== currentTierClass) {
      if (currentTierClass) body.classList.remove(currentTierClass);
      if (tier) body.classList.add(tier);
      currentTierClass = tier;
    }
    body.style.setProperty('--drunk-level', (level / MAX).toFixed(3));
  }

  function notify() {
    applyEffects();
    persist();
    listeners.forEach((fn) => fn(level));
  }

  function addDose(amount) {
    level = clamp(level + amount);
    notify();
  }

  function getLevel() {
    return level;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // Redescend doucement tout seul, comme le temps qui passe.
  setInterval(() => {
    if (level > 0) {
      level = clamp(level - DECAY_PER_TICK);
      notify();
    } else {
      persist();
    }
  }, TICK_MS);

  document.addEventListener('DOMContentLoaded', applyEffects);

  return { addDose, getLevel, stateLabel, onChange, MAX };
})();