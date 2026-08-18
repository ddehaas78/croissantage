/* wallet.js
   Single source of truth for the fictional chip balance shared by every
   room (slots, bar, blackjack, roulette). No real money is involved:
   this is a play-chip counter persisted in localStorage so it survives
   reloads on GitHub Pages.
*/
const Wallet = (() => {
  const STORAGE_KEY = 'casino_wallet_balance_v1';
  const STARTING_BALANCE = 1000;
  const RECHARGE_THRESHOLD = 100; // recharge possible seulement si le solde est en dessous de ça
  const RECHARGE_TARGET = 750;    // le solde remonte jusqu'à ce montant

  let balance = Number(localStorage.getItem(STORAGE_KEY));
  if (!Number.isFinite(balance) || balance < 0) {
    balance = STARTING_BALANCE;
    localStorage.setItem(STORAGE_KEY, String(balance));
  }

  const listeners = new Set();

  function persist() {
    localStorage.setItem(STORAGE_KEY, String(balance));
  }

  function updateRechargeButtons() {
    const eligible = balance < RECHARGE_THRESHOLD;
    document.querySelectorAll('[data-recharge-btn]').forEach((btn) => {
      btn.disabled = !eligible;
      btn.removeAttribute('title'); // on utilise le tooltip custom, pas le natif (trop lent, pas stylable)
      btn.dataset.tooltip = eligible
        ? `Recharger jusqu'à ${RECHARGE_TARGET.toLocaleString('fr-FR')} 🪙`
        : `Recharge disponible sous ${RECHARGE_THRESHOLD} 🪙 (solde actuel : ${balance.toLocaleString('fr-FR')})`;
    });
  }

  /* --- Tooltip custom : apparition instantanée + style casino --- */
  const TOOLTIP_ID = 'wallet-tooltip';

  function ensureTooltipStyles() {
    if (document.getElementById('wallet-tooltip-styles')) return;
    const style = document.createElement('style');
    style.id = 'wallet-tooltip-styles';
    style.textContent = `
      #${TOOLTIP_ID} {
        position: fixed;
        z-index: 9999;
        pointer-events: none;
        background: #241130;
        color: #f5d98c;
        border: 1px solid rgba(245, 217, 140, 0.55);
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
        padding: 5px 9px;
        border-radius: 7px;
        font-size: 11.5px;
        font-weight: 500;
        line-height: 1.3;
        max-width: 200px;
        text-align: center;
        white-space: normal;
        opacity: 0;
        transform: translate(-50%, 4px);
        transition: opacity 0.08s ease, transform 0.08s ease;
      }
      #${TOOLTIP_ID}.visible {
        opacity: 1;
        transform: translate(-50%, 0);
      }
      #${TOOLTIP_ID}::after {
        content: '';
        position: absolute;
        left: 50%;
        top: -5px;
        width: 9px;
        height: 9px;
        background: #241130;
        border-left: 1px solid rgba(245, 217, 140, 0.55);
        border-top: 1px solid rgba(245, 217, 140, 0.55);
        transform: translateX(-50%) rotate(45deg);
      }
    `;
    document.head.appendChild(style);
  }

  function getTooltipEl() {
    let el = document.getElementById(TOOLTIP_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = TOOLTIP_ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function positionTooltip(el, target) {
    const rect = target.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();
    let left = rect.left + rect.width / 2;
    const top = rect.bottom + 9;
    // Empêche de sortir de l'écran sur les côtés (la flèche reste centrée sur le bouton via clip du left)
    const halfWidth = tipRect.width / 2;
    const minLeft = halfWidth + 8;
    const maxLeft = window.innerWidth - halfWidth - 8;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function initTooltips() {
    ensureTooltipStyles();
    const tip = getTooltipEl();

    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target || !target.dataset.tooltip) return;
      tip.textContent = target.dataset.tooltip;
      tip.classList.remove('visible');
      positionTooltip(tip, target); // pré-position avant affichage pour éviter le "saut"
      // force reflow puis affichage instantané (pas de délai navigateur)
      void tip.offsetWidth;
      positionTooltip(tip, target);
      tip.classList.add('visible');
    });

    document.addEventListener('mouseout', (e) => {
      const target = e.target.closest('[data-tooltip]');
      if (!target) return;
      if (e.relatedTarget && target.contains(e.relatedTarget)) return;
      tip.classList.remove('visible');
    });

    document.addEventListener('mousemove', (e) => {
      if (!tip.classList.contains('visible')) return;
      const target = e.target.closest('[data-tooltip]');
      if (target) positionTooltip(tip, target);
    });

    // Si le bouton disparaît/redevient disabled pendant le survol
    document.addEventListener('scroll', () => tip.classList.remove('visible'), true);
  }

  function notify() {
    listeners.forEach((fn) => fn(balance));
    document.querySelectorAll('[data-wallet-balance]').forEach((el) => {
      el.textContent = balance.toLocaleString('fr-FR');
    });
    document.querySelectorAll('.topbar-balance').forEach((el) => {
      el.classList.remove('flash');
      // force reflow to restart animation
      void el.offsetWidth;
      el.classList.add('flash');
    });
    updateRechargeButtons();
  }

  document.addEventListener('DOMContentLoaded', initTooltips);

  // Quand la page revient du bfcache (bouton retour arrière du navigateur),
  // le script n'est PAS rejoué : `balance` reste figé sur la valeur qu'il
  // avait au moment où on a quitté la page, même si localStorage a été mis
  // à jour entre-temps par une autre page (ex. le bar). On resynchronise
  // donc explicitement depuis localStorage et on rafraîchit l'affichage.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= 0) {
      balance = stored;
    }
    notify();
  });

  return {
    get() {
      return balance;
    },
    canAfford(amount) {
      return balance >= amount;
    },
    add(amount) {
      balance += Math.max(0, Math.round(amount));
      persist();
      notify();
      return balance;
    },
    subtract(amount) {
      amount = Math.max(0, Math.round(amount));
      if (amount > balance) return false;
      balance -= amount;
      persist();
      notify();
      return true;
    },
    recharge() {
      if (balance >= RECHARGE_THRESHOLD) return false;
      balance = RECHARGE_TARGET;
      persist();
      notify();
      return true;
    },
    reset() {
      balance = STARTING_BALANCE;
      persist();
      notify();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    refreshUI() {
      notify();
    },
  };
})();

document.addEventListener('DOMContentLoaded', () => Wallet.refreshUI());