/* wallet.js
   Single source of truth for the fictional chip balance shared by every
   room (slots, bar, blackjack, roulette). No real money is involved:
   this is a play-chip counter persisted in localStorage so it survives
   reloads on GitHub Pages.
*/
const Wallet = (() => {
  const STORAGE_KEY = 'casino_wallet_balance_v1';
  const STARTING_BALANCE = 1000;

  let balance = Number(localStorage.getItem(STORAGE_KEY));
  if (!Number.isFinite(balance) || balance < 0) {
    balance = STARTING_BALANCE;
    localStorage.setItem(STORAGE_KEY, String(balance));
  }

  const listeners = new Set();

  function persist() {
    localStorage.setItem(STORAGE_KEY, String(balance));
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
  }

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