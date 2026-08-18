/* baccara.js — Baccara (Punto Banco) de Croissantage
   Deux mains (Joueur / Banquier), tirage de la 3e carte selon les vraies
   règles du Punto Banco, mise sur Joueur / Banquier / Égalité.
   Paiements : Joueur 1:1, Banquier 0.95:1 (commission 5%), Égalité 8:1.
   Sur une Égalité, les mises Joueur/Banquier sont remboursées (push),
   pas perdues — comme dans un vrai casino.
*/
const Baccara = (() => {
  const SUITS = [
    { id: 'spades',   symbol: '♠', color: 'black' },
    { id: 'hearts',   symbol: '♥', color: 'red' },
    { id: 'diamonds', symbol: '♦', color: 'red' },
    { id: 'clubs',    symbol: '♣', color: 'black' },
  ];
  const RANK_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

  // Jetons : valeurs fixes + jetons "fraction du solde" (1/4, 1/2, ALL),
  // recalculés en live sur le solde réel (le Wallet n'est débité qu'au
  // moment de DISTRIBUER, donc pas d'accumulation à gérer ici).
  const CHIP_DEFS = [
    { type: 'fixed', value: 25, label: '25' },
    { type: 'fixed', value: 50, label: '50' },
    { type: 'fixed', value: 100, label: '100' },
    { type: 'fraction', fraction: 0.25, label: '1/4' },
    { type: 'fraction', fraction: 0.5, label: '1/2' },
    { type: 'fraction', fraction: 1, label: 'ALL' },
  ];

  let betType = null;
  let selectedChipIndex = 1; // '50' par défaut
  let dealing = false;
  let built = false;

  function fmt(n) {
    return Math.round(n).toLocaleString('fr-FR');
  }

  function rankLabel(rank) {
    return RANK_LABELS[rank] || String(rank);
  }

  function cardValue(rank) {
    return rank <= 9 ? rank : 0; // 10/J/Q/K = 0, As = 1
  }

  function drawCard() {
    const rank = 1 + Math.floor(Math.random() * 13);
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    return { rank, suit };
  }

  function handTotal(hand) {
    return hand.reduce((sum, c) => sum + cardValue(c.rank), 0) % 10;
  }

  /* ---------------- Règles de tirage du Punto Banco ---------------- */
  function playRound() {
    const player = [drawCard(), drawCard()];
    const banker = [drawCard(), drawCard()];

    const playerNatural = handTotal(player);
    const bankerNatural = handTotal(banker);
    const isNatural = playerNatural >= 8 || bankerNatural >= 8;

    let playerThird = null;
    if (!isNatural) {
      if (playerNatural <= 5) {
        playerThird = drawCard();
        player.push(playerThird);
      }
    }

    if (!isNatural) {
      const bankerTotal = handTotal(banker);
      if (playerThird === null) {
        // Le joueur reste (6 ou 7) : le banquier tire sur 0-5, reste sur 6-7
        if (bankerTotal <= 5) banker.push(drawCard());
      } else {
        const pt = cardValue(playerThird.rank);
        let draws;
        switch (bankerTotal) {
          case 0: case 1: case 2: draws = true; break;
          case 3: draws = pt !== 8; break;
          case 4: draws = pt >= 2 && pt <= 7; break;
          case 5: draws = pt >= 4 && pt <= 7; break;
          case 6: draws = pt === 6 || pt === 7; break;
          default: draws = false; // 7 : le banquier reste toujours
        }
        if (draws) banker.push(drawCard());
      }
    }

    return {
      player,
      banker,
      playerTotal: handTotal(player),
      bankerTotal: handTotal(banker),
      // Une "paire" ne compte que sur les 2 premières cartes distribuées,
      // même si une 3e carte est tirée ensuite.
      playerPair: player[0].rank === player[1].rank,
      bankerPair: banker[0].rank === banker[1].rank,
    };
  }

  function resolveWinner(round) {
    if (round.playerTotal > round.bankerTotal) return 'player';
    if (round.bankerTotal > round.playerTotal) return 'banker';
    return 'tie';
  }

  /* ---------------- Rendu des cartes ---------------- */
  function cardHTML(card, delayIndex) {
    return `<div class="bc-card ${card.suit.color}" style="animation-delay:${delayIndex * 0.35}s">
      <span class="bc-rank">${rankLabel(card.rank)}</span>
      <span class="bc-suit">${card.suit.symbol}</span>
    </div>`;
  }

  function renderHand(containerId, cards) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = cards.map((c, i) => cardHTML(c, i)).join('');
  }

  function setMessage(msg, cls) {
    const el = document.getElementById('bc-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg' + (cls ? ' ' + cls : '');
  }

  function updateTotals(playerTotal, bankerTotal) {
    const p = document.getElementById('bc-player-total');
    const b = document.getElementById('bc-banker-total');
    if (p) p.textContent = playerTotal === null ? '' : playerTotal;
    if (b) b.textContent = bankerTotal === null ? '' : bankerTotal;
  }

  /* ---------------- Contrôles de mise ---------------- */
  function chipAmount(def) {
    if (def.type === 'fixed') return def.value;
    return Math.floor(Wallet.get() * def.fraction);
  }

  function betAmount() {
    return chipAmount(CHIP_DEFS[selectedChipIndex]);
  }

  function canBet() {
    return !dealing;
  }

  function selectBetType(type) {
    if (!canBet()) return;
    betType = type;
    document.querySelectorAll('.bc-zone').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    updateChipDisplay();
    updateDealButton();
  }

  function selectChip(index) {
    if (!canBet()) return;
    selectedChipIndex = index;
    document.querySelectorAll('.bc-mult-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.chipIndex) === index);
    });
    updateAmountDisplay();
    updateChipDisplay();
    updateDealButton();
  }

  function updateAmountDisplay() {
    const el = document.getElementById('bc-amount');
    if (el) el.textContent = fmt(betAmount());
    refreshFractionChipTooltips();
  }

  // Les jetons "fraction" (1/4, 1/2, ALL) affichent leur montant réel en
  // tooltip ; on la rafraîchit à chaque changement de solde.
  function refreshFractionChipTooltips() {
    document.querySelectorAll('.bc-mult-btn[data-chip-index]').forEach((btn) => {
      const def = CHIP_DEFS[Number(btn.dataset.chipIndex)];
      if (def && def.type === 'fraction') {
        btn.dataset.tooltip = `Mise : ${fmt(chipAmount(def))} 🪙`;
      }
    });
  }

  // Petit jeton dessiné directement sur la zone de mise choisie, avec le
  // montant misé — comme un vrai jeton posé sur le tapis.
  function updateChipDisplay() {
    document.querySelectorAll('.bc-zone-chip').forEach((chip) => {
      chip.textContent = '';
      chip.classList.remove('show');
    });
    if (betType) {
      const chip = document.getElementById(`bc-chip-${betType}`);
      if (chip) {
        chip.textContent = fmt(betAmount());
        chip.classList.add('show');
      }
    }
  }

  function updateDealButton() {
    const btn = document.getElementById('bc-deal-btn');
    if (!btn) return;
    const canAfford = Wallet.canAfford(betAmount());
    btn.disabled = dealing || !betType || !canAfford;
  }

  function toggleBetControls(enabled) {
    document.querySelectorAll('.bc-zone, .bc-mult-btn').forEach((btn) => {
      btn.disabled = !enabled;
    });
  }

  /* ---------------- Manche ---------------- */
  function deal() {
    if (dealing || !betType) return;
    const amount = betAmount();
    if (!Wallet.canAfford(amount)) {
      setMessage('Solde insuffisant pour cette mise.', 'msg-warn');
      return;
    }

    dealing = true;
    toggleBetControls(false);
    document.getElementById('bc-deal-btn').disabled = true;
    document.getElementById('bc-new-round-btn').hidden = true;
    Wallet.subtract(amount);
    updateTotals(null, null);
    renderHand('bc-player-cards', []);
    renderHand('bc-banker-cards', []);
    setMessage('Distribution des cartes...');

    const round = playRound();

    // Léger délai pour laisser l'animation de distribution se jouer
    setTimeout(() => {
      renderHand('bc-player-cards', round.player);
      renderHand('bc-banker-cards', round.banker);

      // Chaque carte apparaît avec un délai en cascade (voir bcCardIn dans le
      // CSS : index * 0.35s + 0.4s d'animation) : on attend que la dernière
      // carte de la main la plus longue ait fini de se poser avant de
      // révéler le score et le résultat, sinon tout tombe avant même que le
      // joueur ait vu les cartes.
      const maxCards = Math.max(round.player.length, round.banker.length);
      const revealDelay = maxCards * 350 + 550;

      setMessage('Distribution des cartes...');

      setTimeout(() => {
        updateTotals(round.playerTotal, round.bankerTotal);
        const winner = resolveWinner(round);
        settleBet(winner, round, amount);
      }, revealDelay);
    }, 120);
  }

  function settleBet(winner, round, amount) {
    const winnerLabel = { player: 'Joueur', banker: 'Banquier', tie: 'Égalité' }[winner];

    if (betType === 'playerPair' || betType === 'bankerPair') {
      const isPlayerPairBet = betType === 'playerPair';
      const won = isPlayerPairBet ? round.playerPair : round.bankerPair;
      const label = isPlayerPairBet ? 'Paire Joueur' : 'Paire Banquier';
      if (won) {
        const payout = amount * 12; // 11:1 + mise remboursée
        Wallet.add(payout);
        setMessage(`🎴 ${label} ! Vous remportez ${fmt(payout - amount)} 🪙.`, 'msg-good');
      } else {
        setMessage(`🎴 Pas de ${label.toLowerCase()}. Vous perdez ${fmt(amount)} 🪙.`, 'msg-bad');
      }
    } else if (betType === winner) {
      let payout;
      if (winner === 'player') payout = amount * 2;
      else if (winner === 'banker') payout = amount * 1.95;
      else payout = amount * 9; // tie 8:1 + mise remboursée
      Wallet.add(payout);
      setMessage(`🎴 ${winnerLabel} gagne ! Vous remportez ${fmt(payout - amount)} 🪙.`, 'msg-good');
    } else if (winner === 'tie') {
      // Une Égalité rembourse les mises Joueur/Banquier (push), elles ne sont pas perdues
      Wallet.add(amount);
      setMessage(`🎴 Égalité ! Votre mise de ${fmt(amount)} 🪙 est remboursée.`, 'msg-warn');
    } else {
      setMessage(`🎴 ${winnerLabel} gagne. Vous perdez ${fmt(amount)} 🪙.`, 'msg-bad');
    }

    dealing = false;
    document.getElementById('bc-new-round-btn').hidden = false;
    updateDealButton();
  }

  function newRound() {
    betType = null;
    document.querySelectorAll('.bc-zone').forEach((btn) => btn.classList.remove('active'));
    updateChipDisplay();
    toggleBetControls(true);
    document.getElementById('bc-new-round-btn').hidden = true;
    updateTotals(null, null);
    renderHand('bc-player-cards', []);
    renderHand('bc-banker-cards', []);
    setMessage('Choisissez votre mise et distribuez les cartes.');
    updateDealButton();
  }

  /* ---------------- Construction de la scène ---------------- */
  function buildBetZonesHTML() {
    return `
      <div class="bc-zones">
        <button type="button" class="bc-zone bc-zone-player" data-type="player">
          <span class="bc-zone-label">Joueur</span>
          <span class="bc-zone-odds">Paye 1:1</span>
          <span class="bc-zone-chip" id="bc-chip-player"></span>
        </button>
        <button type="button" class="bc-zone bc-zone-tie" data-type="tie">
          <span class="bc-zone-label">Égalité</span>
          <span class="bc-zone-odds">Paye 8:1</span>
          <span class="bc-zone-chip" id="bc-chip-tie"></span>
        </button>
        <button type="button" class="bc-zone bc-zone-banker" data-type="banker">
          <span class="bc-zone-label">Banquier</span>
          <span class="bc-zone-odds">Paye 0.95:1</span>
          <span class="bc-zone-chip" id="bc-chip-banker"></span>
        </button>
      </div>
      <div class="bc-zones bc-zones-pairs">
        <button type="button" class="bc-zone bc-zone-player-pair" data-type="playerPair">
          <span class="bc-zone-label">Paire Joueur</span>
          <span class="bc-zone-odds">Paye 11:1</span>
          <span class="bc-zone-chip" id="bc-chip-playerPair"></span>
        </button>
        <button type="button" class="bc-zone bc-zone-banker-pair" data-type="bankerPair">
          <span class="bc-zone-label">Paire Banquier</span>
          <span class="bc-zone-odds">Paye 11:1</span>
          <span class="bc-zone-chip" id="bc-chip-bankerPair"></span>
        </button>
      </div>
    `;
  }

  function buildMultipliersHTML() {
    return CHIP_DEFS.map((def, i) => {
      const active = i === selectedChipIndex ? ' active' : '';
      const tooltip = def.type === 'fraction' ? ` data-tooltip="Mise : ${fmt(chipAmount(def))} 🪙"` : '';
      return `<button type="button" class="bc-mult-btn${active}" data-chip-index="${i}"${tooltip}>${def.label}</button>`;
    }).join('');
  }

  function init() {
    const container = document.querySelector('#baccara .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="bc-wrap">
        <div class="bc-table">
          <div class="bc-hand-row">
            <div class="bc-hand">
                <div class="bc-hand-label">Joueur <span class="bc-hand-total" id="bc-player-total"></span></div>
                <div class="bc-hand-cards" id="bc-player-cards"></div>
            </div>
            <div class="bc-hand">
                <div class="bc-hand-label">Banquier <span class="bc-hand-total" id="bc-banker-total"></span></div>
                <div class="bc-hand-cards" id="bc-banker-cards"></div>
            </div>
          </div>
          <p id="bc-message" class="game-msg">Choisissez votre mise et distribuez les cartes.</p>
          ${buildBetZonesHTML()}
        </div>

        <div class="bc-side-panel">
          <div class="bc-panel-title">Montant de la mise</div>
          <div class="bc-mult-row">${buildMultipliersHTML()}</div>
          <div class="bc-amount-display">Mise : <span id="bc-amount">${fmt(betAmount())}</span> 🪙</div>

          <button type="button" class="btn btn-primary bc-deal-btn" id="bc-deal-btn" disabled>Distribuer</button>
          <button type="button" class="btn btn-ghost bc-new-round-btn" id="bc-new-round-btn" hidden>Nouvelle main</button>
        </div>
      </div>
    `;

    container.querySelectorAll('.bc-zone').forEach((btn) => {
      btn.addEventListener('click', () => selectBetType(btn.dataset.type));
    });
    container.querySelectorAll('.bc-mult-btn').forEach((btn) => {
      btn.addEventListener('click', () => selectChip(Number(btn.dataset.chipIndex)));
    });
    document.getElementById('bc-deal-btn').addEventListener('click', deal);
    document.getElementById('bc-new-round-btn').addEventListener('click', newRound);

    Wallet.onChange(() => {
      updateAmountDisplay();
      updateDealButton();
    });

    Wallet.refreshUI();
    updateDealButton();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Baccara.init());