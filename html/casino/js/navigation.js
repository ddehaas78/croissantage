/* navigation.js
   Handles switching between the lobby and the individual game screens,
   and keeps the sidebar's active state in sync.
*/
const Navigation = (() => {
  function showLobby() {
    document.querySelectorAll('.game-screen').forEach((el) => el.classList.remove('active'));
    document.getElementById('lobby').classList.remove('hidden');
    setActiveNav('lobby');
  }

  function openGame(screenId, navId) {
    document.getElementById('lobby').classList.add('hidden');
    document.querySelectorAll('.game-screen').forEach((el) => el.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');
    setActiveNav(navId || screenId);
    if (typeof window.onGameOpened === 'function') window.onGameOpened(screenId);
  }

  function setActiveNav(id) {
    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === id);
    });
  }

  function bindLobbyClicks() {
    document.querySelectorAll('[data-open-game]').forEach((el) => {
      el.addEventListener('click', () => openGame(el.dataset.openGame, el.dataset.nav));
    });
    document.querySelectorAll('[data-nav-target]').forEach((el) => {
      el.addEventListener('click', () => {
        if (el.dataset.navTarget === 'lobby') {
          showLobby();
        } else {
          openGame(el.dataset.navTarget, el.dataset.navTarget);
        }
      });
    });
    document.querySelectorAll('.game-back').forEach((el) => {
      el.addEventListener('click', showLobby);
    });
    const logo = document.querySelector('.topbar-logo');
    if (logo) logo.addEventListener('click', showLobby);
  }

  document.addEventListener('DOMContentLoaded', bindLobbyClicks);

  return { showLobby, openGame };
})();