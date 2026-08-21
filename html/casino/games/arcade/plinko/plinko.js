/* plinko.js — Plinko pour Croissantage (v3)

   Moteur physique porté depuis stake-originals-clone
   (github.com/tanh1c/stake-originals-clone), fichiers
   src/components/PlinkoGame/Ball.js et PlinkoEngine.js :
   - placement des chevilles en pyramide (3 chevilles à la rangée du
     haut, +1 par rangée), rayon de cheville qui diminue avec le
     nombre de lignes
   - collision cheville/balle : la vitesse est totalement reprojetée
     sur l'angle de collision puis amortie par un frottement
     horizontal/vertical différent (pas une simple réflexion +
     restitution comme avant) — c'est ce qui donne au rebond son
     allure caractéristique
   - gravité/frottements réglés par palier de nombre de lignes
   - détection d'atterrissage par "bac" (sink) basée sur la position X
     et le bas de la balle qui franchit la ligne du bas du plateau
   On ne reprend pas leur système de résultats pré-calculés (fichier
   plinko-outcomes.json + génération offline) : ici la balle part
   d'un X aléatoire proche du centre, comme leur dropBallRandom().

   Les bacs/multiplicateurs sont affichés en HTML sous le canvas
   (comme leur composant BinsRow), pas dessinés dans le canvas — plus
   simple à animer et à thémer.

   Mise : 5 boutons de montant fixe (10/20/50/100/200). Un clic mise
   et lance une balle instantanément (spam-clickable).

   Historique des gains : liste à hauteur FIXE, sans retour à la
   ligne ; dès qu'elle dépasse un nombre maximum d'entrées, les plus
   anciennes sont retirées. Ça ne fait jamais bouger la mise en page.
*/
const Plinko = (() => {
  /* ---------------- Tables de multiplicateurs ---------------- */
  const MULTIPLIERS = {
    8: {
      low:    [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
      medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      high:   [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    },
    12: {
      low:    [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
      medium: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
      high:   [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    },
    16: {
      low:    [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
      medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
      high:   [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
    },
  };
  const ROWS_OPTIONS = [8, 12, 16];
  const RISK_LEVELS = ['low', 'medium', 'high'];
  const RISK_LABELS = { low: 'Bas', medium: 'Moyen', high: 'Élevé' };

  const BET_AMOUNTS = [10, 20, 50, 100, 200];

  // Nombre maximum de pastilles affichées dans l'historique des gains,
  // réparties sur 2 lignes de 6. Au-delà, la plus ancienne est retirée
  // avant d'ajouter la nouvelle : la grille garde toujours la même
  // taille (2×6), la page ne bouge jamais.
  const LOG_COLUMNS = 6;
  const LOG_ROWS = 2;
  const MAX_LOG_ITEMS = LOG_COLUMNS * LOG_ROWS;

  // Sécurité anti-spam : au-delà, un clic supplémentaire est ignoré
  // (comme MAX_ACTIVE_BALLS dans le repo de référence).
  const MAX_ACTIVE_BALLS = 25;

  /* ---------------- Géométrie du plateau (portée du repo) ---------------- */
  const WIDTH = 620;
  const HEIGHT = 466;
  const PADDING_X = 42;
  // Marge au-dessus de la première rangée de chevilles. Avec 30px la
  // première rangée touchait quasiment le bord du canvas : aucun
  // espace visible pour voir la balle tomber avant le premier contact,
  // surtout en 8 lignes où chevilles/balles sont plus grosses.
  const PADDING_TOP = 60;
  const PADDING_BOTTOM = 22;
  const SINK_HEIGHT = 16;

  // Réglages physiques par nombre de lignes (gravité, frottement
  // horizontal, frottement vertical) — valeurs du repo de référence.
  const PHYSICS_BY_ROWS = {
    8:  { gravity: 0.5,  hFriction: 0.4, vFriction: 0.8 },
    12: { gravity: 0.55, hFriction: 0.4, vFriction: 0.8 },
    16: { gravity: 0.6,  hFriction: 0.4, vFriction: 0.8 },
  };

  let rows = 16;
  let risk = 'medium';
  let built = false;
  let canvas, ctx, dpr = 1;
  let pins = [];    // { id, x, y, radius }
  let sinks = [];   // { x, y, width, height, index }
  let pinsLastRowXCoords = [];
  let binsWidthPercentage = 0.85;
  let balls = [];
  let ballId = 0;
  let rafId = null;
  let pinFlashes = new Map(); // pinId -> frames restantes

  function fmt(n) {
    return Math.round(n).toLocaleString('fr-FR');
  }

  /* ---------------- Réglages lignes / risque ---------------- */
  function currentTable() {
    return MULTIPLIERS[rows][risk];
  }

  function setRows(n) {
    if (balls.length > 0) return;
    rows = n;
    rebuildBoard();
    renderBins();
    renderSettings();
  }

  function setRisk(r) {
    if (balls.length > 0) return;
    risk = r;
    renderBins();
    renderSettings();
  }

  function renderSettings() {
    document.querySelectorAll('.pk-toggle[data-rows]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.rows) === rows);
      btn.disabled = balls.length > 0;
    });
    document.querySelectorAll('.pk-toggle[data-risk]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.risk === risk);
      btn.disabled = balls.length > 0;
    });
    const rowsEl = document.getElementById('pk-rows-value');
    const riskEl = document.getElementById('pk-risk-value');
    if (rowsEl) rowsEl.textContent = rows;
    if (riskEl) riskEl.textContent = RISK_LABELS[risk];
  }

  /* ---------------- Construction du plateau (port PlinkoEngine.placePinsAndWalls) ---------------- */
  // On repart du placement du repo de référence : 3 chevilles dès la
  // première rangée (donc 2 colonnes en plus de chaque côté par
  // rapport à une pointe classique). C'est ce qui donne assez de place
  // pour dévier la balle dès le premier rebond — avec une pointe à 1
  // seule cheville, une balle qui tombe presque pile dessus n'a
  // personne pour la faire dévier et reste "coincée" à rebondir
  // verticalement en boucle tout en haut du plateau.
  function pinRadius() {
    return Math.max((24 - rows) / 2, 3);
  }

  function pinDistanceX() {
    const lastRowPinCount = 3 + rows - 1;
    return (WIDTH - PADDING_X * 2) / (lastRowPinCount - 1);
  }

  // Rayon de la balle : en 16 lignes (le réglage qui "tombe" bien), la
  // balle fait pinRadius()*2 = 8px pour un écart entre chevilles
  // (pinDistanceX()) d'environ 31.5px, soit ~25% de cet écart. En 12 et
  // 8 lignes, l'écart entre chevilles grandit lui aussi, mais la
  // formule pinRadius()*2 faisait grossir la balle un peu plus vite que
  // cet écart (~29% et ~27% de l'écart) : proportionnellement plus
  // grosse, donc plus encline à se coincer entre les chevilles. On fixe
  // ici le MÊME pourcentage qu'en 16 lignes pour les 3 réglages, pour
  // que la balle ait toujours la même taille relative par rapport à
  // l'espace disponible.
  const REFERENCE_ROWS_FOR_BALL_RATIO = 16;
  function ballToGapRatio() {
    const refPinRadius = Math.max((24 - REFERENCE_ROWS_FOR_BALL_RATIO) / 2, 3);
    const refLastRowPinCount = 3 + REFERENCE_ROWS_FOR_BALL_RATIO - 1;
    const refDX = (WIDTH - PADDING_X * 2) / (refLastRowPinCount - 1);
    return (refPinRadius * 1.8) / refDX;
  }

  function ballRadiusForCurrentRows() {
    return ballToGapRatio() * pinDistanceX();
  }

  function rebuildBoard() {
    pins = [];
    pinsLastRowXCoords = [];
    sinks = [];

    const dX = pinDistanceX();
    const radius = pinRadius();

    for (let row = 0; row < rows; row++) {
      const rowY = PADDING_TOP + ((HEIGHT - PADDING_TOP - PADDING_BOTTOM) / (rows - 1)) * row;
      const rowPaddingX = PADDING_X + ((rows - 1 - row) * dX) / 2;

      for (let col = 0; col < 3 + row; col++) {
        const colX = rowPaddingX + ((WIDTH - rowPaddingX * 2) / (3 + row - 1)) * col;
        pins.push({ id: `p_${row}_${col}`, x: colX, y: rowY, radius });
        if (row === rows - 1) pinsLastRowXCoords.push(colX);
      }
    }

    // Bacs : la ligne de dernières chevilles est divisée en (rows + 1)
    // segments égaux — indépendant du nombre de chevilles sur la
    // dernière rangée, comme dans le moteur d'origine.
    const sinkWidth = dX;
    const sinkCount = rows + 1;
    const sinksStartX = pinsLastRowXCoords[0] + sinkWidth / 2;
    for (let i = 0; i < sinkCount; i++) {
      sinks.push({
        x: sinksStartX + i * sinkWidth,
        y: HEIGHT,
        width: sinkWidth,
        height: SINK_HEIGHT,
        index: i,
      });
    }

    binsWidthPercentage = (sinkCount * sinkWidth) / WIDTH;
  }

  /* ---------------- Bacs (rendu HTML sous le canvas, comme BinsRow) ---------------- */
  function binColor(mult) {
    const table = currentTable();
    const max = Math.max(...table);
    const t = Math.min(1, Math.log(mult + 1) / Math.log(max + 1));
    if (t < 0.5) {
      const k = t / 0.5;
      return `rgb(${Math.round(46 + k * (212 - 46))}, ${Math.round(204 - k * (204 - 175))}, ${Math.round(154 - k * (154 - 55))})`;
    }
    const k = (t - 0.5) / 0.5;
    return `rgb(${Math.round(212 + k * (179 - 212))}, ${Math.round(175 - k * (175 - 33))}, ${Math.round(55 - k * (55 - 47))})`;
  }

  function renderBins() {
    const row = document.getElementById('pk-bins-row');
    if (!row) return;
    const table = currentTable();
    row.style.width = `${binsWidthPercentage * 100}%`;
    row.innerHTML = table.map((mult, i) => {
      const label = mult >= 10 ? `${Math.round(mult)}×` : `${mult.toFixed(1)}×`;
      return `<div class="pk-bin" id="pk-bin-${i}" style="background:${binColor(mult)}">${label}</div>`;
    }).join('');
  }

  function flashBin(index) {
    const el = document.getElementById(`pk-bin-${index}`);
    if (!el) return;
    el.classList.remove('pk-bin-hit');
    void el.offsetWidth;
    el.classList.add('pk-bin-hit');
  }

  /* ---------------- Rendu canvas : chevilles + balles seulement ---------------- */
  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    for (const p of pins) {
      const flashFrames = pinFlashes.get(p.id);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      if (flashFrames > 0) {
        ctx.fillStyle = '#6fe3bd';
        ctx.shadowColor = 'rgba(111, 227, 189, 0.9)';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = '#f4d976';
        ctx.shadowColor = 'rgba(212,175,55,0.55)';
        ctx.shadowBlur = 4;
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    for (const ball of balls) {
      const grad = ctx.createRadialGradient(ball.x - 2, ball.y - 3, 1, ball.x, ball.y, ball.radius);
      grad.addColorStop(0, '#fff6d8');
      grad.addColorStop(1, '#e0684a');
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(224,104,74,0.6)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    pinFlashes.forEach((frames, id) => {
      if (frames <= 1) pinFlashes.delete(id);
      else pinFlashes.set(id, frames - 1);
    });
  }

  /* ---------------- Physique (port de Ball.js — mise à jour par tick, sans dt) ---------------- */
  function updateBall(ball, physics) {
    if (ball.finished) return;

    ball.vy += physics.gravity;
    ball.x += ball.vx;
    ball.y += ball.vy;

    for (const p of pins) {
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.hypot(dx, dy);
      const minDist = ball.radius + p.radius;

      if (dist > 0 && dist < minDist) {
        const angle = Math.atan2(dy, dx);
        const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

        // Comme dans le repo de référence : la vitesse est entièrement
        // reprojetée sur l'angle de collision puis amortie par un
        // frottement horizontal/vertical distinct — plutôt qu'une
        // simple réflexion + restitution.
        ball.vx = Math.cos(angle) * speed * physics.hFriction;
        ball.vy = Math.sin(angle) * speed * physics.vFriction;

        const overlap = ball.radius + p.radius - dist;
        ball.x += Math.cos(angle) * overlap;
        ball.y += Math.sin(angle) * overlap;

        pinFlashes.set(p.id, 12);
      }
    }

    // Murs latéraux du plateau (le moteur d'origine s'appuie sur les
    // marges du canvas ; on ajoute un léger amortissement au contact).
    const left = ball.radius + 4;
    const right = WIDTH - ball.radius - 4;
    if (ball.x < left) { ball.x = left; ball.vx = Math.abs(ball.vx) * physics.hFriction; }
    if (ball.x > right) { ball.x = right; ball.vx = -Math.abs(ball.vx) * physics.hFriction; }

    for (const sink of sinks) {
      if (
        ball.x > sink.x - sink.width / 2 &&
        ball.x < sink.x + sink.width / 2 &&
        (ball.y + ball.radius) > (sink.y - sink.height / 2)
      ) {
        ball.finished = true;
        ball.binIndex = sink.index;
        break;
      }
    }
  }

  function settleBall(ball) {
    const table = currentTable();
    let index = ball.binIndex;
    if (index == null || index < 0 || index >= table.length) {
      index = ball.x < sinks[0].x ? 0 : table.length - 1;
    }
    const mult = table[index];
    const payout = Math.round(ball.bet * mult);
    Wallet.add(payout);
    flashBin(index);
    pushLog(mult, payout, ball.bet);
    renderSettings();
    updateBetButtonsState();
  }

  function pushLog(mult, payout, bet) {
    const logEl = document.getElementById('pk-log');
    if (!logEl) return;
    const good = payout >= bet;
    const el = document.createElement('span');
    el.className = 'pk-log-item ' + (good ? 'pk-log-good' : 'pk-log-bad');
    el.textContent = `${mult}× (${good ? '+' : ''}${fmt(payout - bet)})`;
    logEl.appendChild(el);
    // On garde toujours au maximum MAX_LOG_ITEMS pastilles : la plus
    // ancienne saute pour laisser la place, la barre ne s'agrandit
    // jamais et la page ne bouge pas.
    while (logEl.children.length > MAX_LOG_ITEMS) {
      logEl.removeChild(logEl.firstChild);
    }
  }

  function loop() {
    const physics = PHYSICS_BY_ROWS[rows] || PHYSICS_BY_ROWS[16];
    const finished = [];
    for (const ball of balls) {
      updateBall(ball, physics);
      if (ball.finished) finished.push(ball);
    }
    if (finished.length) {
      balls = balls.filter((b) => !b.finished);
      finished.forEach(settleBall);
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function ensureLoop() {
    if (rafId == null) rafId = requestAnimationFrame(loop);
  }

  /* ---------------- Boutons de mise ---------------- */
  function buildBetButtonsHTML() {
    return BET_AMOUNTS.map((amount) => (
      `<button type="button" class="pk-bet-btn" data-amount="${amount}">
         <span class="pk-bet-btn-amount">${amount}</span>
         <span class="pk-bet-btn-coin">🪙</span>
       </button>`
    )).join('');
  }

  function updateBetButtonsState() {
    document.querySelectorAll('.pk-bet-btn[data-amount]').forEach((btn) => {
      const amount = Number(btn.dataset.amount);
      btn.disabled = !Wallet.canAfford(amount);
    });
  }

  function setMessage(msg, cls) {
    const el = document.getElementById('pk-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg pk-message' + (cls ? ' ' + cls : '');
  }

  /* ---------------- Lancer une balle ---------------- */
  function dropBall(amount, btn) {
    if (!amount || amount <= 0) return;
    if (balls.length >= MAX_ACTIVE_BALLS) {
      setMessage('Trop de balles en jeu, attendez un peu.', 'msg-warn');
      return;
    }
    if (!Wallet.canAfford(amount)) {
      setMessage('Solde insuffisant pour cette mise.', 'msg-warn');
      return;
    }
    Wallet.subtract(amount);

    // Spawn aléatoire proche du centre, comme dropBallRandom() du repo
    // de référence : ça évite qu'une balle tombe pile sur l'axe de
    // symétrie et reste bloquée à rebondir tout droit.
    const spawnRange = pinDistanceX() * 0.8;
    const startX = WIDTH / 2 + (Math.random() - 0.5) * spawnRange;

    // Le rayon des chevilles/balles dépend du nombre de lignes (plus
    // gros avec peu de lignes). Un point de départ fixe (comme avant)
    // laissait à peine la place de tomber avant de toucher la première
    // rangée en mode 8 lignes : la balle apparaissait quasi collée aux
    // chevilles, sans vitesse, et s'agglutinait au lieu de tomber
    // franchement. On calcule donc la marge de chute libre en fonction
    // de la taille réelle de la balle, pour garder le même espace de
    // battement au-dessus du plateau quel que soit le nombre de lignes.
    const ballRadius = ballRadiusForCurrentRows();
    const freeFallClearance = ballRadius + pinRadius() + 24;
    const startY = PADDING_TOP - freeFallClearance;

    balls.push({
      id: ballId++,
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      radius: ballRadius,
      bet: amount,
      finished: false,
      binIndex: null,


    });

    if (btn) {
      btn.classList.remove('pk-bet-btn-pulse');
      void btn.offsetWidth;
      btn.classList.add('pk-bet-btn-pulse');
    }

    renderSettings();
    updateBetButtonsState();
    setMessage('La balle tombe...');
    ensureLoop();
  }

  /* ---------------- Init / DOM binding ---------------- */
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function init() {
    const container = document.querySelector('#plinko .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="pk-wrap">
        <div class="pk-bet-panel">
          <p id="pk-message" class="game-msg pk-message">Cliquez sur une mise pour lancer une balle.</p>

          <div class="pk-bet-buttons" id="pk-bet-buttons">${buildBetButtonsHTML()}</div>

          <div class="pk-settings-stack">
            <div class="pk-settings-group">
              <span class="pk-settings-label">Lignes</span>
              <div class="pk-toggle-row" id="pk-rows-row">
                ${ROWS_OPTIONS.map((n) => `<button type="button" class="pk-toggle" data-rows="${n}">${n}</button>`).join('')}
              </div>
            </div>

            <div class="pk-settings-group">
              <span class="pk-settings-label">Risque</span>
              <div class="pk-toggle-row" id="pk-risk-row">
                ${RISK_LEVELS.map((r) => `<button type="button" class="pk-toggle" data-risk="${r}">${RISK_LABELS[r]}</button>`).join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="pk-board-panel">
          <div class="pk-top-bar">
            <div class="pk-stat">
              <span class="pk-stat-label">Lignes</span>
              <span class="pk-stat-value" id="pk-rows-value">${rows}</span>
            </div>
            <div class="pk-stat">
              <span class="pk-stat-label">Risque</span>
              <span class="pk-stat-value" id="pk-risk-value">${RISK_LABELS[risk]}</span>
            </div>
          </div>
          <div class="pk-canvas-wrap">
            <canvas class="pk-canvas" id="pk-canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
            <div class="pk-bins-row" id="pk-bins-row"></div>
          </div>
          <div class="pk-log" id="pk-log"></div>
        </div>
      </div>
    `;

    canvas = document.getElementById('pk-canvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    rebuildBoard();
    renderBins();
    renderSettings();
    bindEvents(container);
    updateBetButtonsState();
    Wallet.refreshUI();
    ensureLoop();
  }

  function bindEvents(container) {
    container.querySelectorAll('.pk-bet-btn[data-amount]').forEach((btn) => {
      btn.addEventListener('click', () => dropBall(Number(btn.dataset.amount), btn));
    });
    container.querySelectorAll('.pk-toggle[data-rows]').forEach((btn) => {
      btn.addEventListener('click', () => setRows(Number(btn.dataset.rows)));
    });
    container.querySelectorAll('.pk-toggle[data-risk]').forEach((btn) => {
      btn.addEventListener('click', () => setRisk(btn.dataset.risk));
    });

    Wallet.onChange(() => updateBetButtonsState());
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Plinko.init());