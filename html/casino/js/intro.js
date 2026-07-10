/* intro.js — splash screen -> lobby fade transition */
document.addEventListener('DOMContentLoaded', () => {
  const enterBtn = document.getElementById('enter-casino-btn');
  const splash = document.getElementById('splash');
  const lobby = document.getElementById('lobby');

  if (!enterBtn) return;

  enterBtn.addEventListener('click', () => {
    const reveal = () => {
      splash.classList.add('hidden');
      lobby.classList.remove('hidden');
    };

    if (document.startViewTransition) {
      document.startViewTransition(reveal);
    } else {
      splash.style.transition = 'opacity .35s ease';
      splash.style.opacity = '0';
      setTimeout(() => {
        reveal();
        splash.style.opacity = '';
        splash.style.transition = '';
      }, 350);
    }
  });
});