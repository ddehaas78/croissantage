/* blackjack.js — Blackjack pour Croissantage
   Sabot de 2 jeux mélangés, distribution animée carte par carte
   (entrée + retournement façon vraie table), mises via jetons reliées
   au Wallet, le croupier tire jusqu'à 17 avec un léger suspense entre
   chaque carte, paiements 3:2 sur blackjack naturel.
*/
const BlackJack = (() => {
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = ['♠', '♥', '♦', '♣'];
  // Jetons : valeurs fixes + jetons "fraction du solde restant" (1/4, 1/2, ALL),
  // recalculés en live à chaque clic puisque la mise s'accumule localement
  // avant d'être débitée du Wallet (contrairement à la roulette).
  const CHIP_DEFS = [
    { type: 'fixed', value: 25, label: '25' },
    { type: 'fixed', value: 50, label: '50' },
    { type: 'fixed', value: 100, label: '100' },
    { type: 'fraction', fraction: 0.25, label: '1/4' },
    { type: 'fraction', fraction: 0.5, label: '1/2' },
    { type: 'fraction', fraction: 1, label: 'ALL' },
  ];

  let shoe = [];
  let dealerHand = [];
  let playerHand = [];
  let bet = 0;
  let lastBet = 0;
  let inRound = false;
  let playerDone = false;
  let history = []; // 'W' | 'L' | 'P' | 'BJ'
  let built = false;
  let cardSeq = 0;

  function fmt(n) {
    return n.toLocaleString('fr-FR');
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ---------------- Sabot ---------------- */
  function freshShoe() {
    const single = [];
    SUITS.forEach((suit) => {
      RANKS.forEach((rank) => {
        single.push({ rank, suit, color: suit === '♥' || suit === '♦' ? 'red' : 'black' });
      });
    });
    // 2 jeux mélangés ensemble pour limiter les re-mélanges en cours de partie
    const deck = single.concat(single.map((c) => ({ ...c })));
    shuffle(deck);
    return deck;
  }

  function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  function draw() {
    if (shoe.length < 8) shoe = freshShoe();
    const card = shoe.pop();
    card.id = 'c' + ++cardSeq;
    return card;
  }

  function rankValue(rank) {
    if (rank === 'A') return 11;
    if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
    return Number(rank);
  }

  function handValue(hand) {
    let total = 0;
    let aces = 0;
    hand.forEach((c) => {
      total += rankValue(c.rank);
      if (c.rank === 'A') aces++;
    });
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand) === 21;
  }

  /* ---------------- Rendu des cartes ---------------- */
  function cardHTML(card) {
    return `<div class="bj-card" data-card-id="${card.id}">
      <div class="bj-card-inner">
        <div class="bj-card-back"><span class="bj-card-back-emblem">🥐</span></div>
        <div class="bj-card-front bj-${card.color}">
          <div class="bj-card-corner bj-corner-top">${card.rank}<span class="bj-corner-suit">${card.suit}</span></div>
          <div class="bj-card-suit-big">${card.suit}</div>
          <div class="bj-card-corner bj-corner-bottom">${card.rank}<span class="bj-corner-suit">${card.suit}</span></div>
        </div>
      </div>
    </div>`;
  }

  async function dealCardTo(target, card, faceUp) {
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHTML(card);
    const el = wrap.firstElementChild;
    el.classList.add('bj-entering');
    target.appendChild(el);
    // force le reflow puis relâche la classe d'entrée pour jouer la transition
    void el.offsetWidth;
    el.classList.remove('bj-entering');
    await sleep(240);
    if (faceUp) {
      el.classList.add('bj-flipped');
      await sleep(340);
    }
  }

  function dealerHoleHidden() {
    const holeEl = document.querySelector('#bj-dealer-hand .bj-card:nth-child(2)');
    return !!holeEl && !holeEl.classList.contains('bj-flipped');
  }

  function renderScores() {
    const pScore = document.getElementById('bj-player-score');
    const dScore = document.getElementById('bj-dealer-score');
    if (!pScore || !dScore) return;

    pScore.textContent = playerHand.length ? handValue(playerHand) : '–';

    if (!dealerHand.length) {
      dScore.textContent = '–';
    } else if (inRound && dealerHoleHidden()) {
      dScore.textContent = rankValue(dealerHand[0].rank) + ' + ?';
    } else {
      dScore.textContent = handValue(dealerHand);
    }
  }

  function setMessage(msg, cls) {
    const el = document.getElementById('bj-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg' + (cls ? ' ' + cls : '');
  }

  function updateBetDisplay() {
    const el = document.getElementById('bj-bet-amount');
    if (el) el.textContent = fmt(bet);
    refreshFractionChipTooltips();
  }

  function renderHistory() {
    const el = document.getElementById('bj-history');
    if (!el) return;
    el.innerHTML = history
      .slice(0, 14)
      .map((r) => {
        const cls = r === 'W' ? 'bj-hist-win' : r === 'BJ' ? 'bj-hist-bj' : r === 'P' ? 'bj-hist-push' : 'bj-hist-loss';
        const label = r === 'W' ? 'G' : r === 'BJ' ? 'BJ' : r === 'P' ? 'N' : 'P';
        return `<span class="bj-hist-chip ${cls}">${label}</span>`;
      })
      .join('');
  }

  /* ---------------- Mise ---------------- */
  // Montant restant réellement disponible pour miser (solde Wallet moins ce
  // qui est déjà accumulé dans `bet`, puisque le Wallet n'est débité qu'au
  // moment de DISTRIBUER).
  function availableBalance() {
    return Math.max(0, Wallet.get() - bet);
  }

  function chipAmount(def) {
    if (def.type === 'fixed') return def.value;
    return Math.floor(availableBalance() * def.fraction);
  }

  function buildChipsHTML() {
    return CHIP_DEFS.map((def, i) => {
      const tooltip = def.type === 'fraction' ? ` data-tooltip="Mise : ${fmt(chipAmount(def))} 🪙"` : '';
      return `<button type="button" class="bj-chip" data-chip-index="${i}"${tooltip}>${def.label}</button>`;
    }).join('');
  }

  // Les jetons "fraction" affichent leur montant réel en tooltip ; on la
  // rafraîchit à chaque changement de mise ou de solde.
  function refreshFractionChipTooltips() {
    document.querySelectorAll('.bj-chip[data-chip-index]').forEach((btn) => {
      const def = CHIP_DEFS[Number(btn.dataset.chipIndex)];
      if (def && def.type === 'fraction') {
        btn.dataset.tooltip = `Mise : ${fmt(chipAmount(def))} 🪙`;
      }
    });
  }

  function addChip(index) {
    if (inRound) return;
    const def = CHIP_DEFS[index];
    const amount = chipAmount(def);
    if (amount <= 0 || !Wallet.canAfford(bet + amount)) {
      setMessage('Solde insuffisant pour ce jeton.', 'bj-msg-warn');
      return;
    }
    bet += amount;
    updateBetDisplay();
    setMessage(`Mise : ${fmt(bet)} 🪙. Cliquez sur DISTRIBUER quand vous êtes prêt.`);
  }

  function clearBet() {
    if (inRound) return;
    bet = 0;
    updateBetDisplay();
    setMessage('Mise effacée. Choisissez vos jetons.');
  }

  function repeatBet() {
    if (inRound || lastBet <= 0) return;
    if (!Wallet.canAfford(lastBet)) {
      setMessage('Solde insuffisant pour rejouer la même mise.', 'bj-msg-warn');
      return;
    }
    bet = lastBet;
    updateBetDisplay();
    setMessage(`Mise : ${fmt(bet)} 🪙. Cliquez sur DISTRIBUER.`);
  }

  function toggleBetControls(showBetting) {
    const betActions = document.getElementById('bj-bet-actions');
    const playActions = document.getElementById('bj-play-actions');
    if (betActions) betActions.style.display = showBetting ? 'flex' : 'none';
    if (playActions) playActions.style.display = showBetting ? 'none' : 'flex';
    document.querySelectorAll('.bj-chip').forEach((c) => (c.disabled = !showBetting));
  }

  /* ---------------- Déroulement d'une manche ---------------- */
  async function deal() {
    if (inRound) return;
    if (bet <= 0) {
      setMessage('Placez une mise avant de distribuer.', 'bj-msg-warn');
      return;
    }
    if (!Wallet.canAfford(bet)) {
      setMessage('Solde insuffisant.', 'bj-msg-warn');
      return;
    }
    Wallet.subtract(bet);
    lastBet = bet;
    inRound = true;
    playerDone = false;
    toggleBetControls(false);
    document.getElementById('bj-hit-btn').disabled = true;
    document.getElementById('bj-stand-btn').disabled = true;
    document.getElementById('bj-double-btn').disabled = true;
    setMessage('Distribution...');

    const dealerHandEl = document.getElementById('bj-dealer-hand');
    const playerHandEl = document.getElementById('bj-player-hand');
    dealerHandEl.innerHTML = '';
    playerHandEl.innerHTML = '';
    dealerHandEl.classList.remove('bj-hand-win', 'bj-hand-loss', 'bj-hand-push');
    playerHandEl.classList.remove('bj-hand-win', 'bj-hand-loss', 'bj-hand-push');
    dealerHand = [];
    playerHand = [];
    renderScores();

    const p1 = draw();
    playerHand.push(p1);
    await dealCardTo(playerHandEl, p1, true);
    renderScores();

    const d1 = draw();
    dealerHand.push(d1);
    await dealCardTo(dealerHandEl, d1, true);
    renderScores();

    const p2 = draw();
    playerHand.push(p2);
    await dealCardTo(playerHandEl, p2, true);
    renderScores();

    const d2 = draw();
    dealerHand.push(d2);
    await dealCardTo(dealerHandEl, d2, false); // carte cachée du croupier
    renderScores();

    if (isBlackjack(playerHand)) {
      await revealDealerHole();
      finishRound();
      return;
    }

    setMessage('À vous de jouer : Tirer, Rester ou Doubler.');
    document.getElementById('bj-hit-btn').disabled = false;
    document.getElementById('bj-stand-btn').disabled = false;
    document.getElementById('bj-double-btn').disabled = !Wallet.canAfford(bet);
  }

  async function hit() {
    if (!inRound || playerDone) return;
    document.getElementById('bj-double-btn').disabled = true;
    const card = draw();
    playerHand.push(card);
    await dealCardTo(document.getElementById('bj-player-hand'), card, true);
    renderScores();
    const total = handValue(playerHand);
    if (total > 21) {
      playerDone = true;
      document.getElementById('bj-hit-btn').disabled = true;
      document.getElementById('bj-stand-btn').disabled = true;
      setMessage('Vous avez dépassé 21. Buste !', 'bj-msg-bad');
      await revealDealerHole();
      finishRound();
    } else if (total === 21) {
      stand();
    }
  }

  async function doubleDown() {
    if (!inRound || playerDone || playerHand.length !== 2) return;
    if (!Wallet.canAfford(bet)) {
      setMessage('Solde insuffisant pour doubler.', 'bj-msg-warn');
      return;
    }
    Wallet.subtract(bet);
    bet *= 2;
    updateBetDisplay();
    document.getElementById('bj-hit-btn').disabled = true;
    document.getElementById('bj-double-btn').disabled = true;
    document.getElementById('bj-stand-btn').disabled = true;

    const card = draw();
    playerHand.push(card);
    await dealCardTo(document.getElementById('bj-player-hand'), card, true);
    renderScores();

    if (handValue(playerHand) > 21) {
      playerDone = true;
      setMessage('Vous avez dépassé 21 après avoir doublé. Buste !', 'bj-msg-bad');
      await revealDealerHole();
      finishRound();
    } else {
      await stand();
    }
  }

  async function revealDealerHole() {
    const holeEl = document.querySelector('#bj-dealer-hand .bj-card:nth-child(2)');
    if (holeEl && !holeEl.classList.contains('bj-flipped')) {
      holeEl.classList.add('bj-flipped');
      await sleep(340);
    }
    renderScores();
  }

  async function stand() {
    if (!inRound || playerDone) return;
    playerDone = true;
    document.getElementById('bj-hit-btn').disabled = true;
    document.getElementById('bj-stand-btn').disabled = true;
    document.getElementById('bj-double-btn').disabled = true;

    await revealDealerHole();
    setMessage('Le croupier joue...');

    while (handValue(dealerHand) < 17) {
      await sleep(750);
      const card = draw();
      dealerHand.push(card);
      await dealCardTo(document.getElementById('bj-dealer-hand'), card, true);
      renderScores();
    }
    await sleep(400);
    finishRound();
  }

  function finishRound() {
    const playerTotal = handValue(playerHand);
    const dealerTotal = handValue(dealerHand);
    const playerBJ = isBlackjack(playerHand);
    const dealerBJ = isBlackjack(dealerHand);

    let outcome;
    let payout = 0;

    if (playerTotal > 21) {
      outcome = 'L';
    } else if (playerBJ && dealerBJ) {
      outcome = 'P';
      payout = bet;
    } else if (playerBJ) {
      outcome = 'BJ';
      payout = Math.round(bet * 2.5);
    } else if (dealerBJ) {
      outcome = 'L';
    } else if (dealerTotal > 21) {
      outcome = 'W';
      payout = bet * 2;
    } else if (playerTotal > dealerTotal) {
      outcome = 'W';
      payout = bet * 2;
    } else if (playerTotal < dealerTotal) {
      outcome = 'L';
    } else {
      outcome = 'P';
      payout = bet;
    }

    if (payout > 0) Wallet.add(payout);

    const playerCardsEl = document.getElementById('bj-player-hand');
    const dealerCardsEl = document.getElementById('bj-dealer-hand');

    if (outcome === 'W' || outcome === 'BJ') {
      playerCardsEl.classList.add('bj-hand-win');
      const profit = payout - bet;
      setMessage(
        outcome === 'BJ'
          ? `Blackjack ! Vous gagnez ${fmt(payout)} 🪙 (profit ${fmt(profit)} 🪙)`
          : `Vous gagnez ${fmt(payout)} 🪙 (profit ${fmt(profit)} 🪙)`,
        'bj-msg-good'
      );
    } else if (outcome === 'P') {
      playerCardsEl.classList.add('bj-hand-push');
      dealerCardsEl.classList.add('bj-hand-push');
      setMessage(`Égalité — mise remboursée (${fmt(payout)} 🪙).`);
    } else {
      dealerCardsEl.classList.add('bj-hand-win');
      setMessage(playerTotal > 21 ? 'Vous avez busté. Le croupier gagne.' : 'Le croupier gagne cette manche.', 'bj-msg-bad');
    }

    history.unshift(outcome);
    history = history.slice(0, 14);
    renderHistory();

    inRound = false;
    bet = 0;
    updateBetDisplay();
    toggleBetControls(true);
    document.getElementById('bj-hit-btn').disabled = true;
    document.getElementById('bj-stand-btn').disabled = true;
    document.getElementById('bj-double-btn').disabled = true;
  }

  /* ---------------- Init / DOM binding ---------------- */
  function init() {
    const container = document.querySelector('#blackjack .game-body');
    if (!container || built) return;
    built = true;
    shoe = freshShoe();

    container.innerHTML = `
      <div class="bj-wrap">
        <div class="bj-table">
          <div class="bj-dealer-area">
            <div class="bj-role-label">Croupier <span class="bj-score" id="bj-dealer-score">–</span></div>
            <div class="bj-hand" id="bj-dealer-hand"></div>
          </div>
          <div class="bj-center">
            <p id="bj-message" class="game-msg">Placez votre mise pour commencer.</p>
            <div class="bj-history" id="bj-history"></div>
          </div>
          <div class="bj-player-area">
            <div class="bj-role-label">Vous <span class="bj-score" id="bj-player-score">–</span></div>
            <div class="bj-hand" id="bj-player-hand"></div>
          </div>
        </div>

        <div class="bj-side-panel">
          <div class="bj-total-bet">Mise : <span id="bj-bet-amount">0</span> 🪙</div>
          <div class="bj-chip-row" id="bj-chip-row">${buildChipsHTML()}</div>

          <div class="bj-actions" id="bj-bet-actions">
            <button type="button" class="btn-action bj-clear" id="bj-clear-bet">Effacer</button>
            <button type="button" class="btn-action bj-repeat" id="bj-repeat-bet">Même mise</button>
            <button type="button" class="btn-action bj-deal" id="bj-deal-btn">DISTRIBUER</button>
          </div>

          <div class="bj-actions" id="bj-play-actions" style="display:none;">
            <button type="button" class="btn-action bj-hit" id="bj-hit-btn" disabled>Tirer</button>
            <button type="button" class="btn-action bj-stand" id="bj-stand-btn" disabled>Rester</button>
            <button type="button" class="btn-action bj-double" id="bj-double-btn" disabled>Doubler</button>
          </div>
        </div>
      </div>
    `;

    bindEvents(container);
    Wallet.refreshUI();
  }

  function bindEvents(container) {
    container.querySelectorAll('.bj-chip').forEach((btn) => {
      btn.addEventListener('click', () => addChip(Number(btn.dataset.chipIndex)));
    });
    Wallet.onChange(() => refreshFractionChipTooltips());
    container.querySelector('#bj-clear-bet').addEventListener('click', clearBet);
    container.querySelector('#bj-repeat-bet').addEventListener('click', repeatBet);
    container.querySelector('#bj-deal-btn').addEventListener('click', deal);
    container.querySelector('#bj-hit-btn').addEventListener('click', hit);
    container.querySelector('#bj-stand-btn').addEventListener('click', stand);
    container.querySelector('#bj-double-btn').addEventListener('click', doubleDown);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => BlackJack.init());