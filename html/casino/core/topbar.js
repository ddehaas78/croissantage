/* topbar.js
   Génère le bandeau du haut (retour au lobby, titre, bouton recharge,
   solde) sur toutes les pages de jeu. Une seule source de vérité :
   pour changer le style/texte du bandeau, il suffit de modifier ce
   fichier au lieu de retoucher chaque page HTML.

   Utilisation dans une page :
   <div class="game-topbar" data-topbar
        data-title="🎴 Baccara"
        data-back="../lobby.html"                (optionnel, défaut : ../lobby.html)
        data-recharge-label="+ Recharger"         (optionnel)
        data-recharge-class="btn btn-ghost recharge-btn"  (optionnel)
   ></div>
   <script src="../js/topbar.js"></script>
*/
(function () {
  function renderTopbars() {
    document.querySelectorAll('[data-topbar]').forEach((el) => {
      const title = el.dataset.title || '';
      const back = el.dataset.back || '/html/casino/lobby.html';
      const rechargeLabel = el.dataset.rechargeLabel || '+ Recharger';
      const rechargeClass = el.dataset.rechargeClass || 'btn btn-ghost recharge-btn';

      el.innerHTML = `
        <a class="game-back" href="${back}"><span aria-hidden="true">&larr;</span> Retour au lobby</a>
        <div class="game-title">${title}</div>
        <div class="game-topbar-right">
          <button type="button" class="${rechargeClass}" data-recharge-btn onclick="Wallet.recharge()">${rechargeLabel}</button>
          <div class="topbar-balance">
            <span class="coin" aria-hidden="true"></span>
            <span data-wallet-balance>0</span>
          </div>
        </div>
      `;
    });

    // Filet de sécurité : si Wallet est déjà chargé, on rafraîchit tout de
    // suite l'affichage du solde et l'état du bouton recharge fraîchement injecté.
    if (window.Wallet && typeof Wallet.refreshUI === 'function') {
      Wallet.refreshUI();
    }
  }

  renderTopbars();
})();