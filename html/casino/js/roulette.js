/* roulette.js — Roulette Française pour Croissantage
   Inspiré du plateau complet (mises intérieures/extérieures, jetons, roue animée)
   d'un pen CodePen, redessiné dans le thème or/bordeaux/émeraude du site.
   Génère la roue (SVG) et la table de mises en JS, gère les mises,
   l'animation de la roue/bille et le paiement via Wallet.
*/
const Roulette = (() => {
  // Ordre réel des numéros sur une roue européenne (0 à 36, un seul zéro)
  const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const CHIP_VALUES = [5, 10, 25, 50, 100];
  const SLICE_ANGLE = 360 / 37;

  let selectedChip = 10;
  let bets = []; // { key, numbers:[...], label, payout, amount }
  let spinning = false;
  let history = []; // derniers numéros sortis
  let built = false;

  function colorOf(n) {
    if (n === 0) return 'green';
    return RED_NUMBERS.has(n) ? 'red' : 'black';
  }

  function fmt(n) {
    return n.toLocaleString('fr-FR');
  }

  /* ---------------- Construction de la roue (SVG) ---------------- */
  function polar(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  }

  function buildWheelSVG() {
    const cx = 160, cy = 160, R = 150, r0 = 92, rNum = (R + r0) / 2;
    let slices = '';
    let numbers = '';

    WHEEL_ORDER.forEach((num, i) => {
      const mid = i * SLICE_ANGLE;
      const a0 = mid - SLICE_ANGLE / 2;
      const a1 = mid + SLICE_ANGLE / 2;
      const oStart = polar(cx, cy, R, a0);
      const oEnd = polar(cx, cy, R, a1);
      const iEnd = polar(cx, cy, r0, a1);
      const iStart = polar(cx, cy, r0, a0);
      const col = colorOf(num);
      const fill = col === 'green' ? 'var(--emerald-bright)' : col === 'red' ? '#b3212f' : '#171310';
      const d = `M ${oStart.x.toFixed(2)} ${oStart.y.toFixed(2)} A ${R} ${R} 0 0 1 ${oEnd.x.toFixed(2)} ${oEnd.y.toFixed(2)} L ${iEnd.x.toFixed(2)} ${iEnd.y.toFixed(2)} A ${r0} ${r0} 0 0 0 ${iStart.x.toFixed(2)} ${iStart.y.toFixed(2)} Z`;
      slices += `<path d="${d}" fill="${fill}" stroke="#0b0906" stroke-width="1"></path>`;

      const tp = polar(cx, cy, rNum, mid);
      numbers += `<text x="${tp.x.toFixed(2)}" y="${tp.y.toFixed(2)}" transform="rotate(${mid}, ${tp.x.toFixed(2)}, ${tp.y.toFixed(2)})" text-anchor="middle" dominant-baseline="middle" class="rl-wheel-num">${num}</text>`;
    });

    return `
      <svg id="rl-wheel-rotor" class="rl-wheel-rotor" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg">
        <circle cx="160" cy="160" r="152" fill="none" stroke="var(--gold)" stroke-width="3"></circle>
        ${slices}
        ${numbers}
        <circle cx="160" cy="160" r="90" fill="var(--panel)" stroke="var(--gold-dim)" stroke-width="2"></circle>
        <circle cx="160" cy="160" r="18" fill="url(#rl-hub-grad)" stroke="var(--gold-bright)" stroke-width="1.5"></circle>
        <defs>
          <radialGradient id="rl-hub-grad" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stop-color="var(--gold-bright)"></stop>
            <stop offset="60%" stop-color="var(--gold)"></stop>
            <stop offset="100%" stop-color="var(--gold-dim)"></stop>
          </radialGradient>
        </defs>
      </svg>`;
  }

  /* ---------------- Construction de la table de mises ---------------- */
  function cellBtn(key, numbers, label, payout, extraClass, content) {
    return `<button type="button" class="rl-cell ${extraClass || ''}" data-key="${key}" data-numbers="${numbers.join(',')}" data-label="${label}" data-payout="${payout}">
      <span class="rl-cell-content">${content}</span>
      <span class="rl-chip-badge" data-chip-for="${key}"></span>
    </button>`;
  }

  function range(a, b) {
    const arr = [];
    for (let i = a; i <= b; i++) arr.push(i);
    return arr;
  }

  function buildTableHTML() {
    let html = '<div class="rl-table-grid">';

    // Zéro
    html += cellBtn('n0', [0], 'Zéro', 35, 'rl-zero', '0');

    // Grille 12 lignes x 3 colonnes (1..36)
    html += '<div class="rl-numbers-grid">';
    for (let row = 0; row < 12; row++) {
      for (let col = 0; col < 3; col++) {
        const n = row * 3 + col + 1;
        const cls = colorOf(n) === 'red' ? 'rl-red' : 'rl-black';
        html += cellBtn('n' + n, [n], 'Numéro ' + n, 35, cls, n);
      }
    }
    html += '</div>';
    html += '</div>'; // .rl-table-grid

    // Colonnes 2:1
    const col1 = [], col2 = [], col3 = [];
    for (let n = 1; n <= 36; n++) {
      if (n % 3 === 1) col1.push(n);
      else if (n % 3 === 2) col2.push(n);
      else col3.push(n);
    }
    html += '<div class="rl-row rl-columns-row">';
    html += cellBtn('col1', col1, 'Colonne 1', 2, 'rl-outside', 'Colonne 1 <small>2:1</small>');
    html += cellBtn('col2', col2, 'Colonne 2', 2, 'rl-outside', 'Colonne 2 <small>2:1</small>');
    html += cellBtn('col3', col3, 'Colonne 3', 2, 'rl-outside', 'Colonne 3 <small>2:1</small>');
    html += '</div>';

    // Douzaines
    const doz1 = range(1, 12), doz2 = range(13, 24), doz3 = range(25, 36);
    html += '<div class="rl-row rl-dozens-row">';
    html += cellBtn('doz1', doz1, '1ère douzaine', 2, 'rl-outside', '1 – 12');
    html += cellBtn('doz2', doz2, '2ème douzaine', 2, 'rl-outside', '13 – 24');
    html += cellBtn('doz3', doz3, '3ème douzaine', 2, 'rl-outside', '25 – 36');
    html += '</div>';

    // Mises extérieures
    const low = range(1, 18), high = range(19, 36);
    const reds = [...RED_NUMBERS];
    const blacks = range(1, 36).filter((n) => !RED_NUMBERS.has(n));
    const odds = range(1, 36).filter((n) => n % 2 === 1);
    const evens = range(1, 36).filter((n) => n % 2 === 0);

    html += '<div class="rl-row rl-outside-row">';
    html += cellBtn('low', low, '1 à 18', 1, 'rl-outside', 'MANQUE<br><small>1–18</small>');
    html += cellBtn('even', evens, 'Pair', 1, 'rl-outside', 'PAIR');
    html += cellBtn('red', reds, 'Rouge', 1, 'rl-outside rl-outside-red', 'ROUGE');
    html += cellBtn('black', blacks, 'Noir', 1, 'rl-outside rl-outside-black', 'NOIR');
    html += cellBtn('odd', odds, 'Impair', 1, 'rl-outside', 'IMPAIR');
    html += cellBtn('high', high, '19 à 36', 1, 'rl-outside', 'PASSE<br><small>19–36</small>');
    html += '</div>';

    return html;
  }

  function buildChipsHTML() {
    return CHIP_VALUES.map((v) => `<button type="button" class="rl-chip ${v === selectedChip ? 'active' : ''}" data-chip="${v}">${v}</button>`).join('');
  }

  /* ---------------- Init / DOM binding ---------------- */
  function init() {
    const container = document.querySelector('#roulette .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="rl-wrap">
        <div class="rl-top">
          <div class="rl-wheel-panel">
            <div class="rl-wheel-stage">
              <div class="rl-pointer"></div>
              <div id="rl-wheel-holder">${buildWheelSVG()}</div>
              <div id="rl-ball-track" class="rl-ball-track"><div class="rl-ball"></div></div>
            </div>
            <div id="rl-result-badge" class="rl-result-badge rl-result-idle">—</div>
            <div id="rl-history" class="rl-history"></div>
          </div>

          <div class="rl-table-wrap" id="rl-table">${buildTableHTML()}</div>
        </div>

        <div class="rl-side-panel">
          <p id="roulette-message" class="game-msg">Placez vos jetons sur la table.</p>
          <div class="rl-total-bet">Mise totale : <span id="rl-total">0</span> 🪙</div>
          <div class="rl-bets-list" id="rl-bets-list"></div>
          <div class="rl-chip-row" id="rl-chip-row">${buildChipsHTML()}</div>
          <div class="rl-actions">
            <button type="button" class="btn-action rl-clear" id="rl-clear-btn">Effacer les mises</button>
            <button type="button" class="btn-action rl-spin" id="rl-spin-btn">LANCER</button>
          </div>
        </div>
      </div>
    `;

    bindEvents(container);
    Wallet.refreshUI();
  }

  function bindEvents(container) {
    container.querySelectorAll('.rl-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedChip = Number(btn.dataset.chip);
        container.querySelectorAll('.rl-chip').forEach((c) => c.classList.toggle('active', c === btn));
      });
    });

    container.querySelectorAll('.rl-cell').forEach((btn) => {
      btn.addEventListener('click', () => placeBet(btn));
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        removeOneBet(btn);
      });
    });

    container.querySelector('#rl-clear-btn').addEventListener('click', clearBets);
    container.querySelector('#rl-spin-btn').addEventListener('click', spin);
  }

  function setMessage(msg) {
    const el = document.getElementById('roulette-message');
    if (el) el.textContent = msg;
  }

  function placeBet(btn) {
    if (spinning) return;
    const amount = selectedChip;
    if (!Wallet.canAfford(amount)) {
      setMessage('Solde insuffisant pour ce jeton.');
      return;
    }
    Wallet.subtract(amount);

    const key = btn.dataset.key;
    const numbers = btn.dataset.numbers.split(',').map(Number);
    const label = btn.dataset.label;
    const payout = Number(btn.dataset.payout);

    let entry = bets.find((b) => b.key === key);
    if (entry) {
      entry.amount += amount;
    } else {
      entry = { key, numbers, label, payout, amount };
      bets.push(entry);
    }
    updateBetBadge(key, entry.amount);
    updateTotal();
    renderBetsList();
    setMessage(`Mise placée : ${label} (${amount} 🪙)`);
  }

  function removeOneBet(btn) {
    if (spinning) return;
    const key = btn.dataset.key;
    const entry = bets.find((b) => b.key === key);
    if (!entry) return;
    const refund = Math.min(selectedChip, entry.amount);
    entry.amount -= refund;
    Wallet.add(refund);
    if (entry.amount <= 0) {
      bets = bets.filter((b) => b.key !== key);
      updateBetBadge(key, 0);
    } else {
      updateBetBadge(key, entry.amount);
    }
    updateTotal();
    renderBetsList();
  }

  function updateBetBadge(key, amount) {
    const badge = document.querySelector(`[data-chip-for="${key}"]`);
    if (!badge) return;
    if (amount > 0) {
      badge.textContent = amount;
      badge.classList.add('show');
    } else {
      badge.textContent = '';
      badge.classList.remove('show');
    }
  }

  function renderBetsList() {
    const el = document.getElementById('rl-bets-list');
    if (!el) return;
    if (bets.length === 0) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = bets
      .map(
        (b) => `<span class="rl-bet-chip" data-remove-key="${b.key}" title="Clic pour retirer un jeton">
          <span class="rl-bet-chip-label">${b.label}</span>
          <span class="rl-bet-chip-amount">${fmt(b.amount)} 🪙</span>
        </span>`
      )
      .join('');
    el.querySelectorAll('.rl-bet-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (spinning) return;
        const key = chip.dataset.removeKey;
        const btn = document.querySelector(`.rl-cell[data-key="${key}"]`);
        if (btn) removeOneBet(btn);
      });
    });
  }

  function updateTotal() {
    const total = bets.reduce((sum, b) => sum + b.amount, 0);
    const el = document.getElementById('rl-total');
    if (el) el.textContent = fmt(total);
  }

  function clearBets() {
    if (spinning) return;
    const total = bets.reduce((sum, b) => sum + b.amount, 0);
    if (total > 0) Wallet.add(total);
    bets.forEach((b) => updateBetBadge(b.key, 0));
    bets = [];
    updateTotal();
    renderBetsList();
    setMessage('Mises effacées.');
  }

  /* ---------------- Spin & résolution ---------------- */
  function spin() {
    if (spinning) return;
    if (bets.length === 0) {
      setMessage('Placez au moins une mise avant de lancer.');
      return;
    }
    spinning = true;
    toggleControls(false);
    setMessage('La bille tourne...');

    const winningNumber = Math.floor(Math.random() * 37); // 0..36 équiprobable

    animateWheel(winningNumber).then(() => resolveSpin(winningNumber));
  }

  function animateWheel(winningNumber) {
    return new Promise((resolve) => {
      const idx = WHEEL_ORDER.indexOf(winningNumber);
      const targetCenter = idx * SLICE_ANGLE;
      const wheelEl = document.getElementById('rl-wheel-rotor');
      const ballEl = document.getElementById('rl-ball-track');

      // reset sans transition
      wheelEl.style.transition = 'none';
      ballEl.style.transition = 'none';
      wheelEl.style.transform = 'rotate(0deg)';
      ballEl.style.transform = 'rotate(0deg)';
      void wheelEl.getBoundingClientRect();

      const wheelSpins = 6;
      const ballSpins = 9;
      const wheelFinal = wheelSpins * 360 + (360 - targetCenter);
      const ballFinal = -(ballSpins * 360);

      const duration = 4200;
      wheelEl.style.transition = `transform ${duration}ms cubic-bezier(0.14, 0.7, 0.15, 1)`;
      ballEl.style.transition = `transform ${duration}ms cubic-bezier(0.1, 0.65, 0.2, 1)`;

      requestAnimationFrame(() => {
        wheelEl.style.transform = `rotate(${wheelFinal}deg)`;
        ballEl.style.transform = `rotate(${ballFinal}deg)`;
      });

      setTimeout(resolve, duration + 150);
    });
  }

  function resolveSpin(winningNumber) {
    const col = colorOf(winningNumber);
    const badge = document.getElementById('rl-result-badge');
    badge.textContent = winningNumber;
    badge.className = 'rl-result-badge rl-result-' + col;

    let totalWin = 0;
    let totalStaked = 0;
    bets.forEach((b) => {
      totalStaked += b.amount;
      if (b.numbers.includes(winningNumber)) {
        totalWin += b.amount * (b.payout + 1);
      }
    });

    const colLabel = col === 'green' ? '(vert)' : col === 'red' ? '(rouge)' : '(noir)';

    if (totalWin > 0) {
      Wallet.add(totalWin);
      const profit = totalWin - totalStaked;
      setMessage(`${winningNumber} ${colLabel} — Gagné ${fmt(totalWin)} 🪙 (profit ${fmt(profit)} 🪙)`);
    } else {
      setMessage(`${winningNumber} ${colLabel} — Perdu, tentez à nouveau.`);
    }

    // historique
    history.unshift({ num: winningNumber, col });
    history = history.slice(0, 12);
    renderHistory();

    // reset des mises visuelles
    bets.forEach((b) => updateBetBadge(b.key, 0));
    bets = [];
    updateTotal();
    renderBetsList();

    spinning = false;
    toggleControls(true);
  }

  function renderHistory() {
    const el = document.getElementById('rl-history');
    if (!el) return;
    el.innerHTML = history
      .map((h) => `<span class="rl-history-chip rl-history-${h.col}">${h.num}</span>`)
      .join('');
  }

  function toggleControls(enabled) {
    const spinBtn = document.getElementById('rl-spin-btn');
    const clearBtn = document.getElementById('rl-clear-btn');
    if (spinBtn) spinBtn.disabled = !enabled;
    if (clearBtn) clearBtn.disabled = !enabled;
    document.querySelectorAll('.rl-cell').forEach((c) => (c.disabled = !enabled));
  }

  // Construit la roulette dès que le DOM est prêt, et aussi si l'écran
  // est ouvert avant ce DOMContentLoaded (sécurité).
  return { init, spin };
})();

document.addEventListener('DOMContentLoaded', () => Roulette.init());