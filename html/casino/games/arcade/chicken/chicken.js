/* chicken.js — Chicken Grill pour Croissantage
   Une rangée de fours de cuisine : le poulet saute de four en four, chaque
   four franchi fait grimper le multiplicateur (affiché sur l'écran du four).
   Si le four "s'allume" sous ses pattes, le poulet brûle et finit rôti :
   la mise est perdue. Encaissement possible à tout moment après le premier
   four franchi.

   Toutes les images sont des SVG dans assets/misc/arcade/chicken/ :
   poulet.svg, poulet-cuit.svg, four.svg, flammes.svg, fumee.svg,
   plan-de-travail.svg (case de départ).
*/
const Chicken = (() => {
  const HOUSE_EDGE = 0.97; // léger avantage maison, appliqué à chaque four
  const COL_STEP = 120; // largeur d'une colonne "four", doit matcher .ch-tile-col en CSS
  const CHICKEN_W = 84; // doit matcher .ch-chicken-sprite en CSS
  const ASSET_PATH = '../../../assets/misc/arcade/chicken/';

  // Chronologie de la mort du poulet (ms après le clic sur AVANCER)
  const HOP_MS = 450;        // durée du saut (= animation CSS ch-hop)
  const BURN_AT = 420;       // le four s'embrase à l'atterrissage
  const COOKED_AT = 1150;    // le poulet est rôti
  const END_AT = 1600;       // fin de manche

  // Niveaux de difficulté : plus il y a de fours et plus la probabilité de
  // survie par four est basse, plus le multiplicateur grimpe vite mais plus
  // le risque de finir rôti est élevé.
  const DIFFICULTIES = [
    { id: 'moyen', label: 'Moyen', steps: 12, survival: 0.86 },
    { id: 'difficile', label: 'Difficile', steps: 10, survival: 0.76 },
    { id: 'extreme', label: 'Extrême', steps: 8, survival: 0.62 },
  ];

  const CHIP_DEFS = [
    { type: 'fixed', value: 25, label: '25' },
    { type: 'fixed', value: 50, label: '50' },
    { type: 'fixed', value: 100, label: '100' },
    { type: 'fraction', fraction: 0.25, label: '1/4' },
    { type: 'fraction', fraction: 0.5, label: '1/2' },
    { type: 'fraction', fraction: 1, label: 'ALL' },
  ];

  const IMG = {
    chicken: ASSET_PATH + 'poulet.svg',
    roasted: ASSET_PATH + 'poulet-cuit.svg',
    oven: ASSET_PATH + 'four.svg',
    flames: ASSET_PATH + 'flammes.svg',
    smoke: ASSET_PATH + 'fumee.svg',
    counter: ASSET_PATH + 'plan-de-travail.svg',
  };

  let selectedChipIndex = 1; // '50' par défaut
  let stake = 0; // mise composée en cliquant sur les jetons (100 ×3 = 300)
  let lastStake = 0;
  let lastChipIndex = null;
  let lastDifficultyIndex = null;
  let selectedDifficultyIndex = 0;
  let bet = 0;
  let playing = false;
  let busy = false; // vrai pendant un saut / une cuisson : bloque les clics
  let position = 0; // nombre de fours franchis avec succès dans la manche en cours
  let crashedAt = null; // index (1-based) du four fatal, sinon null
  let built = false;

  function fmt(n) {
    return Math.round(n).toLocaleString('fr-FR');
  }

  function coinHTML() {
    return '<span class="ch-coin" aria-hidden="true"></span>';
  }

  function currentDifficulty() {
    return DIFFICULTIES[selectedDifficultyIndex];
  }

  /* ---------------- Jetons ---------------- */
  // Montant d'un jeton. Les jetons "fraction" (1/4, 1/2, ALL) se calculent
  // sur ce qui reste disponible (solde - mise déjà composée).
  function chipAmount(def) {
    if (def.type === 'fixed') return def.value;
    return Math.floor(Math.max(0, Wallet.get() - stake) * def.fraction);
  }

  function betAmount() {
    return stake;
  }

  function buildChipsHTML() {
    return CHIP_DEFS.map((def, i) => {
      const active = ''; // plus de jeton "sélectionné" : chaque clic ajoute
      const tooltip = def.type === 'fraction' ? ` data-tooltip="Mise : ${fmt(chipAmount(def))} jetons"` : '';
      return `<button type="button" class="ch-chip${active}" data-chip-index="${i}"${tooltip}>${def.label}</button>`;
    }).join('');
  }

  function refreshFractionChipTooltips() {
    document.querySelectorAll('.ch-chip[data-chip-index]').forEach((btn) => {
      const def = CHIP_DEFS[Number(btn.dataset.chipIndex)];
      if (def && def.type === 'fraction') {
        btn.dataset.tooltip = `Mise : ${fmt(chipAmount(def))} jetons`;
      }
    });
  }

  // Chaque clic sur un jeton AJOUTE sa valeur à la mise (100 ×3 = 300)
  function selectChip(index) {
    if (playing) return;
    const amount = chipAmount(CHIP_DEFS[index]);
    if (amount <= 0 || !Wallet.canAfford(stake + amount)) {
      setMessage('Solde insuffisant pour ajouter ce jeton.', 'msg-warn');
      Sfx.denied();
      return;
    }
    stake += amount;
    Sfx.chip();
    const btn = document.querySelector(`.ch-chip[data-chip-index="${index}"]`);
    if (btn) {
      btn.classList.remove('chip-bump');
      void btn.offsetWidth;
      btn.classList.add('chip-bump');
    }
    updateBetPreview();
    updateStartButton();
    updateMultiplierDisplay();
    setMessage(`Mise : ${fmt(stake)} jetons. Cliquez encore pour ajouter.`);
  }

  function clearStake() {
    if (playing || stake === 0) return;
    stake = 0;
    Sfx.chipsSweep();
    updateBetPreview();
    updateStartButton();
    updateMultiplierDisplay();
    setMessage('Mise effacée. Cliquez sur les jetons pour composer votre mise.');
  }

  /* ---------------- Difficulté ---------------- */
  function buildDifficultyHTML() {
    return DIFFICULTIES.map((d, i) => {
      const active = i === selectedDifficultyIndex ? ' active' : '';
      return `<button type="button" class="ch-diff-btn${active}" data-diff-index="${i}" data-tooltip="${d.steps} fours · ${Math.round(d.survival * 100)}% de survie par four">${d.label}</button>`;
    }).join('');
  }

  function selectDifficulty(index) {
    if (playing) return;
    selectedDifficultyIndex = index;
    Sfx.click();
    document.querySelectorAll('.ch-diff-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.diffIndex) === index);
    });
    renderRoad();
    resetChickenSprite();
    updateMultiplierDisplay();
  }

  /* ---------------- Multiplicateur ---------------- */
  function stepFactor(diff) {
    return HOUSE_EDGE / diff.survival;
  }

  function multiplierAt(diff, n) {
    if (n <= 0) return 1;
    return Math.pow(stepFactor(diff), n);
  }

  function currentMultiplier() {
    return multiplierAt(currentDifficulty(), position);
  }

  function potentialWin() {
    return bet * currentMultiplier();
  }

  /* ---------------- Affichages ---------------- */
  function setMessage(msg, cls) {
    const el = document.getElementById('ch-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg ch-message' + (cls ? ' ' + cls : '');
  }

  function updateBetPreview() {
    const el = document.getElementById('ch-bet-amount');
    if (el) el.textContent = fmt(playing ? bet : betAmount());
    refreshFractionChipTooltips();
  }

  function updateMultiplierDisplay() {
    const multEl = document.getElementById('ch-mult');
    const potEl = document.getElementById('ch-potential');
    if (multEl) multEl.textContent = currentMultiplier().toFixed(2) + '×';
    if (potEl) potEl.innerHTML = fmt(playing ? potentialWin() : betAmount()) + ' ' + coinHTML();
  }

  function updateStartButton() {
    const btn = document.getElementById('ch-start-btn');
    if (!btn) return;
    btn.disabled = playing || betAmount() <= 0 || !Wallet.canAfford(betAmount());
    updateRepeatButton();
  }

  function updateRepeatButton() {
    const btn = document.getElementById('ch-repeat-btn');
    if (!btn) return;
    btn.disabled = playing || lastStake <= 0 || !Wallet.canAfford(lastStake);
  }

  function updateActionButtons() {
    const advanceBtn = document.getElementById('ch-advance-btn');
    const cashoutBtn = document.getElementById('ch-cashout-btn');
    if (advanceBtn) advanceBtn.disabled = !playing || busy;
    if (cashoutBtn) cashoutBtn.disabled = !playing || busy || position === 0;
  }

  function toggleBetControls(showBetting) {
    const betActions = document.getElementById('ch-bet-actions');
    const playActions = document.getElementById('ch-play-actions');
    const newGameBtn = document.getElementById('ch-newgame-btn');
    if (betActions) betActions.style.display = showBetting ? 'flex' : 'none';
    if (playActions) playActions.style.display = showBetting ? 'none' : 'flex';
    if (newGameBtn) newGameBtn.hidden = true;
    document.querySelectorAll('.ch-chip, #ch-stake-clear').forEach((c) => (c.disabled = !showBetting));
    document.querySelectorAll('.ch-diff-btn').forEach((c) => (c.disabled = !showBetting));
  }

  /* ---------------- Rangée de fours ---------------- */
  function ovenState(index) {
    if (crashedAt !== null) {
      if (index < crashedAt) return 'ch-oven-safe';
      if (index === crashedAt) return 'ch-oven-crash';
      return 'ch-oven-future ch-oven-dim';
    }
    if (index <= position && (playing || position > 0)) return 'ch-oven-safe';
    if (index === position + 1 && playing) return 'ch-oven-next';
    return 'ch-oven-future';
  }

  function buildRoadHTML() {
    const diff = currentDifficulty();
    let html = `
      <div class="ch-tile-col">
        <div class="ch-oven ch-oven-start">
          <img class="ch-oven-img" src="${IMG.counter}" alt="" draggable="false">
          <span class="ch-start-label">DÉPART</span>
        </div>
      </div>`;
    for (let i = 1; i <= diff.steps; i++) {
      html += `
        <div class="ch-tile-col">
          <div class="ch-oven ${ovenState(i)}" data-step="${i}">
            <img class="ch-oven-img" src="${IMG.oven}" alt="Four ${i}" draggable="false">
            <span class="ch-oven-display">${multiplierAt(diff, i).toFixed(2)}×</span>
            <span class="ch-oven-led"></span>
            <span class="ch-oven-glow"></span>
          </div>
        </div>`;
    }
    return html;
  }

  function renderRoad() {
    const el = document.getElementById('ch-tiles-row');
    if (el) el.innerHTML = buildRoadHTML();
  }

  // Met à jour les classes des fours sans reconstruire le DOM (préserve les
  // animations en cours, comme les flammes).
  function refreshOvens() {
    document.querySelectorAll('.ch-oven[data-step]').forEach((el) => {
      const i = Number(el.dataset.step);
      el.className = `ch-oven ${ovenState(i)}`;
    });
  }

  /* ---------------- Sprites ---------------- */
  function chickenLeft(index) {
    return index * COL_STEP + (COL_STEP - CHICKEN_W) / 2;
  }

  function positionChickenSprite(index, hop) {
    const sprite = document.getElementById('ch-chicken-sprite');
    if (!sprite) return;
    sprite.style.left = `${chickenLeft(index)}px`;
    if (hop) {
      sprite.classList.remove('ch-hop');
      void sprite.offsetWidth; // force reflow pour rejouer l'animation
      sprite.classList.add('ch-hop');
    }
    scrollToColumn(index);
  }

  function resetChickenSprite() {
    const sprite = document.getElementById('ch-chicken-sprite');
    if (!sprite) return;
    sprite.className = 'ch-chicken-sprite';
    const img = sprite.querySelector('img');
    if (img) img.src = IMG.chicken;
    clearEffects();
    positionChickenSprite(0, false);
  }

  // Garde le poulet visible quand la rangée de fours dépasse la largeur
  function scrollToColumn(index) {
    const scroller = document.getElementById('ch-road-scroll');
    if (!scroller) return;
    const target = index * COL_STEP + COL_STEP / 2 - scroller.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }

  function clearEffects() {
    document.querySelectorAll('.ch-fx').forEach((el) => el.remove());
  }

  function spawnFlames(index) {
    const road = document.getElementById('ch-road');
    if (!road) return null;
    const fire = document.createElement('div');
    fire.className = 'ch-fx ch-flames';
    fire.style.left = `${index * COL_STEP}px`;
    fire.innerHTML = `
      <img class="ch-flame ch-flame-back" src="${IMG.flames}" alt="" draggable="false">
      <img class="ch-flame ch-flame-left" src="${IMG.flames}" alt="" draggable="false">
      <img class="ch-flame ch-flame-right" src="${IMG.flames}" alt="" draggable="false">`;
    road.appendChild(fire);
    return fire;
  }

  function spawnSmoke(index) {
    const road = document.getElementById('ch-road');
    if (!road) return;
    const smoke = document.createElement('div');
    smoke.className = 'ch-fx ch-smoke';
    smoke.style.left = `${index * COL_STEP}px`;
    smoke.innerHTML = [0, 1, 2]
      .map((i) => `<img class="ch-smoke-puff ch-smoke-${i}" src="${IMG.smoke}" alt="" draggable="false">`)
      .join('');
    road.appendChild(smoke);
  }

  /* ---------------- Déroulement d'une manche ---------------- */
  function startGame() {
    if (playing) return;
    const amount = betAmount();
    if (amount <= 0) {
      setMessage('Choisissez un jeton pour votre mise.', 'msg-warn');
      return;
    }
    if (!Wallet.canAfford(amount)) {
      setMessage('Solde insuffisant pour cette mise.', 'msg-warn');
      Sfx.denied();
      return;
    }
    Wallet.subtract(amount);
    Sfx.cluck();
    if (window.Stats) Stats.round();

    lastStake = stake;
    lastDifficultyIndex = selectedDifficultyIndex;
    bet = amount;
    position = 0;
    crashedAt = null;
    playing = true;
    busy = false;

    toggleBetControls(false);
    renderRoad();
    resetChickenSprite();
    updateBetPreview();
    updateMultiplierDisplay();
    updateActionButtons();
    setMessage(`Mise en jeu : ${fmt(bet)} jetons. Faites sauter le poulet sur le premier four !`);
  }

  function repeatBet() {
    if (playing || lastStake <= 0) return;
    stake = lastStake;
    if (lastDifficultyIndex !== null) selectDifficulty(lastDifficultyIndex);
    startGame();
  }

  function advance() {
    if (!playing || busy) return;
    const diff = currentDifficulty();
    const survived = Math.random() < diff.survival;
    const target = position + 1;

    busy = true;
    updateActionButtons();

    // Dans tous les cas le poulet saute sur le four suivant…
    positionChickenSprite(target, true);
    Sfx.hop();

    if (!survived) {
      cookChicken(target);
      return;
    }

    // …et atterrit sain et sauf
    setTimeout(() => {
      position = target;
      busy = false;
      Sfx.land(position);
      refreshOvens();
      updateMultiplierDisplay();
      updateActionButtons();

      if (position >= diff.steps) {
        setMessage('Tous les fours franchis ! Grand prix décroché !', 'msg-good');
        endGame('win');
        return;
      }
      setMessage(`Four franchi ! Multiplicateur : ${currentMultiplier().toFixed(2)}×.`);
    }, HOP_MS - 30);
  }

  // Le four s'embrase sous le poulet : il brûle, puis finit rôti.
  function cookChicken(index) {
    const sprite = document.getElementById('ch-chicken-sprite');
    crashedAt = index;

    setTimeout(() => {
      refreshOvens(); // le four passe en "ch-oven-crash" (vitre en feu, tremblement)
      spawnFlames(index);
      if (sprite) sprite.classList.add('ch-chicken-burning');
      Sfx.burn();
      setMessage('Le four s\'allume…', 'msg-bad');
    }, BURN_AT);

    setTimeout(() => {
      const img = sprite ? sprite.querySelector('img') : null;
      if (img) img.src = IMG.roasted;
      if (sprite) {
        sprite.classList.remove('ch-chicken-burning');
        sprite.classList.add('ch-chicken-roasted');
      }
      const flames = document.querySelector('.ch-flames');
      if (flames) flames.classList.add('ch-flames-out');
      spawnSmoke(index);
      Sfx.ovenDing();
    }, COOKED_AT);

    setTimeout(() => {
      busy = false;
      endGame('loss');
    }, END_AT);
  }

  function cashout() {
    if (!playing || busy || position === 0) return;
    endGame('win');
  }

  function endGame(reason) {
    playing = false;

    if (reason === 'win') {
      const payout = Math.round(potentialWin());
      const profit = payout - bet;
      Wallet.add(payout);
      Sfx.cashRegister();
      Sfx.winFor(payout, bet);
      if (window.Stats) Stats.best(currentMultiplier());
      const sprite = document.getElementById('ch-chicken-sprite');
      if (sprite) sprite.classList.add('ch-chicken-win');
      setMessage(`Encaissé ${fmt(payout)} jetons à ${currentMultiplier().toFixed(2)}× (profit ${fmt(profit)} jetons).`, 'msg-good');
    } else {
      setMessage(`Poulet rôti ! Vous perdez ${fmt(bet)} jetons.`, 'msg-bad');
    }

    refreshOvens();
    updateMultiplierDisplay();
    updateBetPreview();
    updateActionButtons();

    const betActions = document.getElementById('ch-bet-actions');
    const playActions = document.getElementById('ch-play-actions');
    const newGameBtn = document.getElementById('ch-newgame-btn');
    if (betActions) betActions.style.display = 'none';
    if (playActions) playActions.style.display = 'none';
    if (newGameBtn) newGameBtn.hidden = false;
  }

  function newGame() {
    position = 0;
    crashedAt = null;
    bet = 0;
    busy = false;
    toggleBetControls(true);
    renderRoad();
    resetChickenSprite();
    updateBetPreview();
    updateMultiplierDisplay();
    updateStartButton();
    updateActionButtons();
    setMessage('Choisissez votre mise et la difficulté.');
  }

  /* ---------------- Init / DOM binding ---------------- */
  function init() {
    const container = document.querySelector('#chicken .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="ch-wrap">
        <div class="ch-board-panel">
          <div class="ch-top-bar">
            <div class="ch-stat">
              <span class="ch-stat-label">Multiplicateur</span>
              <span class="ch-stat-value" id="ch-mult">1.00×</span>
            </div>
            <div class="ch-brand">
              <img src="${IMG.chicken}" alt="" class="ch-brand-icon" draggable="false">
              <span>Chicken Grill</span>
            </div>
            <div class="ch-stat">
              <span class="ch-stat-label">Gain potentiel</span>
              <span class="ch-stat-value" id="ch-potential">0</span>
            </div>
          </div>
          <div class="ch-road-scroll" id="ch-road-scroll">
            <div class="ch-road" id="ch-road">
              <div class="ch-tiles-row" id="ch-tiles-row">${buildRoadHTML()}</div>
              <div class="ch-chicken-sprite" id="ch-chicken-sprite">
                <img class="ch-chicken-img" src="${IMG.chicken}" alt="Le poulet" draggable="false">
              </div>
            </div>
          </div>
        </div>

        <div class="ch-side-panel">
          <p id="ch-message" class="game-msg ch-message">Choisissez votre mise et la difficulté.</p>
          <div class="ch-total-bet">Mise : <span id="ch-bet-amount">0</span> ${coinHTML()}<button type="button" class="stake-clear" id="ch-stake-clear">Effacer</button></div>
          <div class="ch-chip-row" id="ch-chip-row">${buildChipsHTML()}</div>

          <div class="ch-diff-group" id="ch-diff-group">${buildDifficultyHTML()}</div>

          <div class="ch-actions" id="ch-bet-actions">
            <button type="button" class="btn-action ch-repeat" id="ch-repeat-btn" disabled>Même mise</button>
            <button type="button" class="btn-action ch-start" id="ch-start-btn">DÉMARRER</button>
          </div>

          <div class="ch-actions" id="ch-play-actions" style="display:none;">
            <button type="button" class="btn-action ch-advance" id="ch-advance-btn">SAUTER</button>
            <button type="button" class="btn-action ch-cashout" id="ch-cashout-btn" disabled>ENCAISSER</button>
          </div>

          <button type="button" class="btn-action ch-newgame" id="ch-newgame-btn" hidden>Nouvelle partie</button>
        </div>
      </div>
    `;

    bindEvents(container);
    resetChickenSprite();
    updateBetPreview();
    updateMultiplierDisplay();
    Wallet.refreshUI();
    updateStartButton();
    updateActionButtons();
  }

  function bindEvents(container) {
    container.querySelectorAll('.ch-chip').forEach((btn) => {
      btn.addEventListener('click', () => selectChip(Number(btn.dataset.chipIndex)));
    });
    container.querySelector('#ch-stake-clear').addEventListener('click', clearStake);

    container.querySelectorAll('.ch-diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => selectDifficulty(Number(btn.dataset.diffIndex)));
    });

    container.querySelector('#ch-start-btn').addEventListener('click', startGame);
    container.querySelector('#ch-repeat-btn').addEventListener('click', repeatBet);
    container.querySelector('#ch-advance-btn').addEventListener('click', advance);
    container.querySelector('#ch-cashout-btn').addEventListener('click', cashout);
    container.querySelector('#ch-newgame-btn').addEventListener('click', newGame);

    Wallet.onChange(() => {
      updateBetPreview();
      updateStartButton();
      if (!playing) updateMultiplierDisplay();
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Chicken.init());
