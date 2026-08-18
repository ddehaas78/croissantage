/* fusee.js — Fusée (crash game) pour Croissantage
   Mise par jetons reliée au Wallet, pas de compte à rebours : le joueur
   mise puis clique sur LANCER pour faire décoller la fusée. Il peut
   encaisser à tout moment avant le crash, ou fixer une cible
   d'encaissement automatique. Courbe dessinée sur canvas.
*/
const Fusee = (() => {
  // Jetons : valeurs fixes + jetons "fraction du solde restant" (1/4, 1/2, ALL),
  // recalculés en live à chaque clic puisque la mise s'accumule localement
  // avant d'être débitée du Wallet.
  const CHIP_DEFS = [
    { type: 'fixed', value: 25, label: '25' },
    { type: 'fixed', value: 50, label: '50' },
    { type: 'fixed', value: 100, label: '100' },
    { type: 'fraction', fraction: 0.25, label: '1/4' },
    { type: 'fraction', fraction: 0.5, label: '1/2' },
    { type: 'fraction', fraction: 1, label: 'ALL' },
  ];

  let bet = 0;
  let lastBet = 0;
  let cashoutTarget = 2.00;
  let inRound = false;
  let cashedOut = false;
  let multiplier = 1.00;
  let crashPoint = 0;
  let startTime = null;
  let elapsedTime = 0;
  let animationFrame = null;
  let phase = 'idle'; // 'idle' | 'running' | 'crashed'
  let history = []; // { mult, win }
  let built = false;

  // Marque le point où le joueur a encaissé, pour continuer à dessiner la
  // courbe au-delà (en pointillés) et révéler jusqu'où la fusée serait
  // allée avant le vrai crash.
  let cashoutMultiplier = null;
  let cashoutElapsedTime = null;

  let canvas, ctx;

  // ---------------- Échelle dynamique (auto-zoom) ----------------
  // Le graphique "se rétrécit" progressivement (les axes s'étendent) pour que
  // la fusée reste toujours visible avec une marge confortable, au lieu de
  // foncer droit vers le coin et d'être coupée. FILL = fraction de l'espace
  // que la pointe de la courbe doit idéalement occuper ; EASE = vitesse de
  // lissage du zoom (plus petit = plus doux).
  const MIN_WINDOW = 6;
  const WINDOW_FILL = 0.95;
  const MULT_FILL = 0.9;
  const ZOOM_EASE = 0.07;
  let smoothedWindow = MIN_WINDOW;
  let smoothedMaxMult = 2;

  function resetScale() {
    smoothedWindow = MIN_WINDOW;
    smoothedMaxMult = 2;
  }

  // Calcule puis lisse les bornes des axes pour la frame courante. Une borne
  // plancher (proche de 100% de remplissage) garantit qu'on ne clippe jamais
  // la courbe même si le lissage n'a pas eu le temps de rattraper une montée
  // rapide, tout en laissant la fusée utiliser presque tout l'espace.
  function updateScale() {
    const desiredWindow = Math.max(elapsedTime / WINDOW_FILL, MIN_WINDOW);
    smoothedWindow += (desiredWindow - smoothedWindow) * ZOOM_EASE;
    const minRequiredWindow = Math.max(elapsedTime / 0.97, MIN_WINDOW);
    if (smoothedWindow < minRequiredWindow) smoothedWindow = minRequiredWindow;

    const desiredMax = Math.max(1 + (multiplier - 1) / MULT_FILL, 2);
    smoothedMaxMult += (desiredMax - smoothedMaxMult) * ZOOM_EASE;
    const minRequiredMax = Math.max(1 + (multiplier - 1) / 0.95, 2);
    if (smoothedMaxMult < minRequiredMax) smoothedMaxMult = minRequiredMax;

    return { displayWindow: smoothedWindow, maxMultiplier: smoothedMaxMult };
  }

  // Sprite de la fusée : fourni en PNG, chargé depuis assets/misc/arcade/fusee/fusee.png
  // (repère 3 niveaux sous la racine, comme core/, puisque fusee est un sous-jeu d'Arcade).
  // Si le fichier n'est pas encore là, on retombe sur un simple point doré.
  const rocketImg = new Image();
  rocketImg.src = '../../../assets/misc/arcade/fusee/fusee.png';

  function fmt(n) {
    return n.toLocaleString('fr-FR');
  }

  function themeColor(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ---------------- Génération du crash ---------------- */
  function generateCrashPoint() {
    const houseEdge = 0.04;
    const random = Math.random();
    if (random < houseEdge) return 1.00;
    const point = 0.99 / (1 - random);
    return Math.max(1.00, Math.min(point, 1000));
  }

  /* ---------------- Rendu ---------------- */
  function setMessage(msg, cls) {
    const el = document.getElementById('fs-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg' + (cls ? ' ' + cls : '');
  }

  function updateBetDisplay() {
    const el = document.getElementById('fs-bet-amount');
    if (el) el.textContent = fmt(bet);
    refreshFractionChipTooltips();
  }

  function renderHistory() {
    const el = document.getElementById('fs-history');
    if (!el) return;
    el.innerHTML = history
      .slice(0, 12)
      .map((h) => `<span class="fs-hist-pill ${h.win ? 'fs-hist-win' : 'fs-hist-loss'}">${h.mult.toFixed(2)}×</span>`)
      .join('');
  }

  function setupCanvas() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  function updateYAxis(maxMultiplier) {
    const yAxis = document.getElementById('fs-y-axis');
    if (!yAxis) return;
    yAxis.innerHTML = '';
    const steps = 5;
    for (let i = steps; i >= 1; i--) {
      const value = 1 + ((maxMultiplier - 1) * i) / steps;
      const span = document.createElement('span');
      span.textContent = value.toFixed(1) + '×';
      yAxis.appendChild(span);
    }
  }

  function updateXAxis(displayWindow) {
    const xAxis = document.getElementById('fs-x-axis');
    if (!xAxis) return;
    xAxis.innerHTML = '';
    // Graduations réparties uniformément sur la fenêtre affichée (comme
    // l'axe Y), pour rester cohérentes quel que soit le niveau de zoom.
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      const t = (displayWindow * i) / steps;
      const span = document.createElement('span');
      span.textContent = t.toFixed(t < 10 ? 1 : 0) + 's';
      xAxis.appendChild(span);
    }
  }

  function drawCurve() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    if (phase !== 'running' && phase !== 'crashed') return;

    // Échelle lissée : les axes s'étendent progressivement à mesure que la
    // fusée monte, donnant l'impression que le graphique "se rétrécit" pour
    // toujours garder la courbe (et la fusée) bien visible avec de la marge.
    const { displayWindow, maxMultiplier } = updateScale();
    updateYAxis(maxMultiplier);
    updateXAxis(displayWindow);

    const goldBright = themeColor('--gold-bright', '#f4d976');
    const cream = themeColor('--cream', '#f3ead8');
    const crashColor = '#e0685f';

    const fillGradient = ctx.createLinearGradient(0, height, 0, 0);
    fillGradient.addColorStop(0, 'rgba(212, 175, 55, 0.10)');
    fillGradient.addColorStop(0.4, 'rgba(212, 175, 55, 0.30)');
    fillGradient.addColorStop(0.7, 'rgba(212, 175, 55, 0.50)');
    fillGradient.addColorStop(1, 'rgba(244, 217, 118, 0.65)');

    const numPoints = 80;
    // Accentue la courbure exponentielle à l'écran : plus VISUAL_CURVE_POWER
    // est grand, plus la courbe reste "plate" au début et se creuse
    // fortement vers le haut/la droite (effet "hockey stick"). Ça n'affecte
    // que le tracé — le multiplicateur affiché et les gains restent basés
    // sur la vraie valeur exponentielle (multAtPoint / multiplier).
    // Important : la courbure est appliquée à la progression relative au
    // point ACTUEL (rawFrac, qui vaut toujours 1 pile au dernier point), pas
    // à la fraction absolue de l'axe — sinon la pointe n'atteint jamais le
    // niveau prévu par MULT_FILL et il reste un grand vide en haut.
    const VISUAL_CURVE_POWER = 1.7;
    const currentSpan = Math.max(multiplier - 1, 1e-6);
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const timeAtPoint = elapsedTime * t;
      const multAtPoint = Math.pow(Math.E, 0.1 * timeAtPoint);
      // x suit le temps réel écoulé sur une échelle fixe (displayWindow),
      // donc la fusée démarre à gauche (x≈0) et avance vers la droite.
      const x = width * (timeAtPoint / displayWindow);
      const rawFrac = Math.min(1, Math.max(0, (multAtPoint - 1) / currentSpan));
      const shapedFrac = Math.pow(rawFrac, VISUAL_CURVE_POWER);
      const normalized = shapedFrac * ((multiplier - 1) / (maxMultiplier - 1));
      const y = height - Math.min(1, Math.max(0, normalized)) * height;
      points.push({ x, y, t: timeAtPoint });
    }

    ctx.beginPath();
    ctx.moveTo(0, height);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.closePath();
    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Si le joueur a déjà encaissé, on sépare la courbe en deux : le trajet
    // "réel" (plein) jusqu'au point d'encaissement, puis la suite du vol
    // (pointillé, atténué) qui révèle jusqu'où la fusée serait allée avant
    // le crash véritable.
    let splitIndex = points.length - 1;
    if (cashedOut && cashoutElapsedTime != null) {
      splitIndex = points.findIndex((p) => p.t > cashoutElapsedTime);
      if (splitIndex === -1) splitIndex = points.length - 1;
    }

    const solidPoints = points.slice(0, splitIndex + 1);
    const revealPoints = points.slice(splitIndex);

    ctx.beginPath();
    ctx.moveTo(solidPoints[0].x, solidPoints[0].y);
    solidPoints.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = phase === 'crashed' && revealPoints.length <= 1 ? crashColor : cream;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (revealPoints.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(revealPoints[0].x, revealPoints[0].y);
      revealPoints.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = phase === 'crashed' ? crashColor : 'rgba(243, 234, 216, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();

      // Petit repère doré au point exact où le joueur a encaissé.
      const marker = solidPoints[solidPoints.length - 1];
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = goldBright;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#241a08';
      ctx.stroke();

      ctx.font = '700 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = goldBright;
      ctx.fillText(`Encaissé ${cashoutMultiplier.toFixed(2)}×`, marker.x, marker.y - 12);
    }

    const last = points[points.length - 1];
    const prev = points[points.length - 2] || last;

    if (phase === 'crashed') {
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💥', last.x, last.y);
    } else if (rocketImg.complete && rocketImg.naturalWidth) {
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);

      // ⚠️ Orientation du sprite : dans l'aperçu, fusee.png a le NEZ VERS LE
      // HAUT quand l'image n'est pas tournée (comme une fusée posée sur son
      // pas de tir), et pas vers la droite. On corrige donc l'angle de +90°
      // pour aligner le nez sur la direction réelle de la courbe, et on
      // dimensionne/positionne l'image en "portrait" (nez en haut du PNG).
      // → Si votre fichier fusee.png a en fait le nez tourné vers la DROITE
      //   au repos, passez NOSE_ORIENTATION à 'right' juste en dessous.
      const NOSE_ORIENTATION = 'up'; // 'up' | 'right'

      let drawW, drawH, offsetX, offsetY, extraRotation;
      if (NOSE_ORIENTATION === 'up') {
        drawH = 58;
        drawW = drawH * (rocketImg.naturalWidth / rocketImg.naturalHeight);
        offsetX = -drawW / 2;
        offsetY = -drawH * 0.08; // le nez (haut du PNG) touche la pointe de la courbe
        extraRotation = Math.PI / 2;
      } else {
        drawW = 54;
        drawH = drawW * (rocketImg.naturalHeight / rocketImg.naturalWidth);
        offsetX = -drawW * 0.85;
        offsetY = -drawH / 2;
        extraRotation = 0;
      }

      ctx.save();
      ctx.translate(last.x, last.y);
      ctx.rotate(angle + extraRotation);
      ctx.shadowColor = 'rgba(212, 175, 55, 0.85)';
      ctx.shadowBlur = 14;
      ctx.drawImage(rocketImg, offsetX, offsetY, drawW, drawH);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = goldBright;
      ctx.fill();
    }
  }

  function updateMultiplierDisplay() {
    const valueEl = document.getElementById('fs-multiplier-value');
    const displayEl = document.getElementById('fs-multiplier-display');
    if (!valueEl || !displayEl) return;
    valueEl.textContent = multiplier.toFixed(2);
    displayEl.classList.toggle('fs-crashed', phase === 'crashed');
  }

  function updateStatus() {
    const status = document.getElementById('fs-status');
    const text = document.getElementById('fs-status-text');
    if (!status || !text) return;
    if (phase === 'crashed') {
      status.classList.remove('fs-hidden');
      text.textContent = `Crash @ ${multiplier.toFixed(2)}×`;
    } else {
      status.classList.add('fs-hidden');
    }
  }

  /* ---------------- Mise ---------------- */
  // Montant restant réellement disponible pour miser (solde Wallet moins ce
  // qui est déjà accumulé dans `bet`, puisque le Wallet n'est débité qu'au
  // moment de LANCER).
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
      return `<button type="button" class="fs-chip" data-chip-index="${i}"${tooltip}>${def.label}</button>`;
    }).join('');
  }

  // Les jetons "fraction" affichent leur montant réel en tooltip ; on la
  // rafraîchit à chaque changement de mise ou de solde.
  function refreshFractionChipTooltips() {
    document.querySelectorAll('.fs-chip[data-chip-index]').forEach((btn) => {
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
      setMessage('Solde insuffisant pour ce jeton.', 'fs-msg-warn');
      return;
    }
    bet += amount;
    updateBetDisplay();
    setMessage(`Mise : ${fmt(bet)} 🪙. Cliquez sur LANCER quand vous êtes prêt.`);
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
      setMessage('Solde insuffisant pour rejouer la même mise.', 'fs-msg-warn');
      return;
    }
    bet = lastBet;
    updateBetDisplay();
    setMessage(`Mise : ${fmt(bet)} 🪙. Cliquez sur LANCER.`);
  }

  function toggleBetControls(showBetting) {
    const betActions = document.getElementById('fs-bet-actions');
    const playActions = document.getElementById('fs-play-actions');
    if (betActions) betActions.style.display = showBetting ? 'flex' : 'none';
    if (playActions) playActions.style.display = showBetting ? 'none' : 'flex';
    document.querySelectorAll('.fs-chip').forEach((c) => (c.disabled = !showBetting));
    const targetInput = document.getElementById('fs-target-input');
    if (targetInput) targetInput.disabled = !showBetting;
  }

  /* ---------------- Déroulement d'une manche ---------------- */
  function launch() {
    if (inRound) return;
    if (bet <= 0) {
      setMessage('Placez une mise avant de lancer.', 'fs-msg-warn');
      return;
    }
    if (!Wallet.canAfford(bet)) {
      setMessage('Solde insuffisant.', 'fs-msg-warn');
      return;
    }
    Wallet.subtract(bet);
    lastBet = bet;
    inRound = true;
    cashedOut = false;
    toggleBetControls(false);
    document.getElementById('fs-cashout-btn').disabled = false;

    const targetInput = document.getElementById('fs-target-input');
    cashoutTarget = Math.max(1.01, parseFloat(targetInput.value) || 2);

    multiplier = 1.00;
    elapsedTime = 0;
    crashPoint = generateCrashPoint();
    startTime = Date.now();
    phase = 'running';
    cashoutMultiplier = null;
    cashoutElapsedTime = null;
    resetScale();

    updateStatus();
    setMessage(`Envolée ! Encaissement auto à ${cashoutTarget.toFixed(2)}×, ou cliquez sur ENCAISSER.`);
    gameLoop();
  }

  function gameLoop() {
    const elapsed = (Date.now() - startTime) / 1000;
    elapsedTime = elapsed;
    multiplier = Math.pow(Math.E, 0.1 * elapsed);

    if (!cashedOut && cashoutTarget < crashPoint && multiplier >= cashoutTarget) {
      multiplier = cashoutTarget;
      elapsedTime = Math.log(cashoutTarget) / 0.1; // resynchronise le temps avec le multiplicateur figé
      cashOut(true);
      // Pas de "return" ici : la boucle continue pour révéler la suite du
      // vol jusqu'au crash réel (voir cashOut / crash).
    }

    if (multiplier >= crashPoint) {
      multiplier = crashPoint;
      phase = 'crashed';
      updateMultiplierDisplay();
      drawCurve();
      updateStatus();
      crash();
      return;
    }

    updateMultiplierDisplay();
    drawCurve();
    animationFrame = requestAnimationFrame(gameLoop);
  }

  function cashOut(auto) {
    if (!inRound || cashedOut) return;
    cashedOut = true;
    document.getElementById('fs-cashout-btn').disabled = true;

    cashoutMultiplier = multiplier;
    cashoutElapsedTime = elapsedTime;

    const payout = Math.round(bet * multiplier);
    const profit = payout - bet;
    Wallet.add(payout);

    history.unshift({ mult: multiplier, win: true });
    history = history.slice(0, 12);
    renderHistory();

    setMessage(
      (auto ? `Encaissement automatique à ${multiplier.toFixed(2)}× ! ` : `Encaissé à ${multiplier.toFixed(2)}× ! `) +
        `Vous gagnez ${fmt(payout)} 🪙 (profit ${fmt(profit)} 🪙). La fusée continue son vol pour révéler la suite...`,
      'fs-msg-good'
    );

    // Pas d'endRound() ici : on laisse la boucle (gameLoop) continuer pour
    // dessiner la suite du trajet jusqu'au crash réel. Si l'appel vient du
    // bouton ENCAISSER (manuel) pendant que la boucle tourne déjà, elle
    // continue naturellement. endRound() est appelé plus tard par crash().
    if (!animationFrame && phase === 'running') {
      // Filet de sécurité si la boucle s'était arrêtée entre-temps.
      gameLoop();
    }
  }

  function crash() {
    if (!inRound) return;
    if (animationFrame) cancelAnimationFrame(animationFrame);

    if (!cashedOut) {
      history.unshift({ mult: multiplier, win: false });
      history = history.slice(0, 12);
      renderHistory();
      setMessage(`Crash à ${multiplier.toFixed(2)}×. Vous perdez ${fmt(bet)} 🪙.`, 'fs-msg-bad');
    } else {
      setMessage(
        `La fusée s'est écrasée à ${multiplier.toFixed(2)}× — vous aviez encaissé à ${cashoutMultiplier.toFixed(2)}× !`,
        'fs-msg-good'
      );
    }

    endRound();
  }

  function endRound() {
    inRound = false;
    bet = 0;
    updateBetDisplay();
    toggleBetControls(true);
    document.getElementById('fs-cashout-btn').disabled = true;
  }

  /* ---------------- Init / DOM binding ---------------- */
  function init() {
    const container = document.querySelector('#fusee .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="fs-wrap">
        <div class="fs-display">
          <div class="fs-history" id="fs-history"></div>
          <div class="fs-chart-container">
            <canvas id="fs-crash-chart"></canvas>
            <div class="fs-y-axis" id="fs-y-axis"></div>
            <div class="fs-x-axis" id="fs-x-axis"></div>
          </div>
          <div class="fs-multiplier-display" id="fs-multiplier-display">
            <span class="fs-multiplier-value" id="fs-multiplier-value">1.00</span><span class="fs-multiplier-x">×</span>
          </div>
          <div class="fs-status fs-hidden" id="fs-status"><span class="fs-status-text" id="fs-status-text"></span></div>
        </div>

        <div class="fs-side-panel">
          <p id="fs-message" class="game-msg">Placez votre mise, puis lancez la fusée.</p>
          <div class="fs-total-bet">Mise : <span id="fs-bet-amount">0</span> 🪙</div>
          <div class="fs-chip-row" id="fs-chip-row">${buildChipsHTML()}</div>

          <div class="fs-target-group">
            <span class="fs-target-label">Encaissement auto à</span>
            <div class="fs-target-wrapper">
              <input type="text" class="fs-target-input" id="fs-target-input" value="2.00">
              <div class="fs-target-controls">
                <button type="button" class="fs-target-btn" id="fs-target-up">▲</button>
                <button type="button" class="fs-target-btn" id="fs-target-down">▼</button>
              </div>
            </div>
          </div>

          <div class="fs-actions" id="fs-bet-actions">
            <button type="button" class="btn-action fs-clear" id="fs-clear-bet">Effacer</button>
            <button type="button" class="btn-action fs-repeat" id="fs-repeat-bet">Même mise</button>
            <button type="button" class="btn-action fs-launch" id="fs-launch-btn">LANCER</button>
          </div>

          <div class="fs-actions" id="fs-play-actions" style="display:none;">
            <button type="button" class="btn-action fs-cashout" id="fs-cashout-btn" disabled>ENCAISSER</button>
          </div>
        </div>
      </div>
    `;

    canvas = document.getElementById('fs-crash-chart');
    ctx = canvas.getContext('2d');

    bindEvents(container);
    setupCanvas();
    updateYAxis(2);
    Wallet.refreshUI();
  }

  function bindEvents(container) {
    container.querySelectorAll('.fs-chip').forEach((btn) => {
      btn.addEventListener('click', () => addChip(Number(btn.dataset.chipIndex)));
    });
    Wallet.onChange(() => refreshFractionChipTooltips());
    container.querySelector('#fs-clear-bet').addEventListener('click', clearBet);
    container.querySelector('#fs-repeat-bet').addEventListener('click', repeatBet);
    container.querySelector('#fs-launch-btn').addEventListener('click', launch);
    container.querySelector('#fs-cashout-btn').addEventListener('click', () => cashOut(false));

    container.querySelector('#fs-target-up').addEventListener('click', () => {
      const input = document.getElementById('fs-target-input');
      input.value = ((parseFloat(input.value) || 2) + 0.1).toFixed(2);
    });
    container.querySelector('#fs-target-down').addEventListener('click', () => {
      const input = document.getElementById('fs-target-input');
      input.value = Math.max(1.01, (parseFloat(input.value) || 2) - 0.1).toFixed(2);
    });

    window.addEventListener('resize', () => {
      setupCanvas();
      drawCurve();
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Fusee.init());