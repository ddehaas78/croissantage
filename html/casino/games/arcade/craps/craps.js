/* craps.js — Craps pour Croissantage
   Le classique jeu de dés des casinos américains, en version simplifiée
   mais fidèle aux vraies règles :

   - PASS LINE / DON'T PASS (mises "de contrat") : ne se posent qu'au
     "come-out" (premier lancer, quand aucun point n'est établi).
       Come-out : 7 ou 11 -> Pass gagne ; 2, 3 ou 12 ("craps") -> Pass perd.
                  Don't Pass : l'inverse, sauf le 12 qui est nul (la mise reste).
       Sinon le total (4, 5, 6, 8, 9, 10) devient le POINT (palet "ON").
       Ensuite on relance : le point ressort avant un 7 -> Pass gagne ;
       un 7 sort d'abord ("seven out") -> Don't Pass gagne.
   - Mises "un seul lancer" (réglées à chaque lancer puis retirées) :
       FIELD     : 3, 4, 9, 10, 11 paient 1:1 ; 2 et 12 paient 2:1 ; sinon perdu.
       ANY 7     : un 7 paie 4:1.
       ANY CRAPS : 2, 3 ou 12 paie 7:1.

   Les dés sont deux cubes 3D en CSS ; leur trajectoire (rebonds) et leur
   rotation finale sont animées avec l'API Web Animations, et les sons
   (core/sfx.js) sont calés sur chaque rebond.
*/
const Craps = (() => {
  const CHIP_DEFS = [
    { type: 'fixed', value: 25, label: '25' },
    { type: 'fixed', value: 50, label: '50' },
    { type: 'fixed', value: 100, label: '100' },
    { type: 'fraction', fraction: 0.25, label: '1/4' },
    { type: 'fraction', fraction: 0.5, label: '1/2' },
    { type: 'fraction', fraction: 1, label: 'ALL' },
  ];

  // Description des zones de mise. edge = avantage de la maison (pédagogique)
  const ZONES = {
    pass:      { label: 'Pass Line',  contract: true,  edge: '1,41 %', pays: '1:1' },
    dontPass:  { label: "Don't Pass", contract: true,  edge: '1,36 %', pays: '1:1' },
    field:     { label: 'Field',      contract: false, edge: '5,56 %', pays: '1:1 (2:1 sur 2 et 12)' },
    any7:      { label: 'Any 7',      contract: false, edge: '16,67 %', pays: '4:1' },
    anyCraps:  { label: 'Any Craps',  contract: false, edge: '11,11 %', pays: '7:1' },
  };

  const POINT_NUMBERS = [4, 5, 6, 8, 9, 10];

  // Chronologie du lancer (ms). Les rebonds sont aux % de ROLL_MS indiqués
  // dans les keyframes de trajectoire (voir throwDie).
  const ROLL_MS = 1400;
  const BOUNCES = [0.32, 0.58, 0.78, 0.9];

  // Rotation qui amène chaque face devant (repère du cube CSS) :
  // avant = 1, arrière = 6, droite = 2, gauche = 5, haut = 3, bas = 4
  const FACE_ROT = {
    1: { x: 0, y: 0 },
    6: { x: 0, y: 180 },
    2: { x: 0, y: -90 },
    5: { x: 0, y: 90 },
    3: { x: -90, y: 0 },
    4: { x: 90, y: 0 },
  };

  // Position des points sur une face (grille 3x3, index 0..8)
  const PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  let selectedChipIndex = 1; // '50' par défaut
  let bets = { pass: 0, dontPass: 0, field: 0, any7: 0, anyCraps: 0 };
  let point = null; // null = come-out, sinon 4/5/6/8/9/10
  let rolling = false;
  let history = [];
  let built = false;

  function fmt(n) {
    return Math.round(n).toLocaleString('fr-FR');
  }

  function coinHTML() {
    return '<span class="coin-icon" aria-hidden="true"></span>';
  }

  /* ---------------- Jetons ---------------- */
  function chipAmount(def) {
    if (def.type === 'fixed') return def.value;
    return Math.floor(Wallet.get() * def.fraction);
  }

  function selectedAmount() {
    return chipAmount(CHIP_DEFS[selectedChipIndex]);
  }

  function buildChipsHTML() {
    return CHIP_DEFS.map((def, i) => {
      const active = i === selectedChipIndex ? ' active' : '';
      const tooltip = def.type === 'fraction' ? ` data-tooltip="Mise : ${fmt(chipAmount(def))} jetons"` : '';
      return `<button type="button" class="cr-chip${active}" data-chip-index="${i}"${tooltip}>${def.label}</button>`;
    }).join('');
  }

  function refreshFractionChipTooltips() {
    document.querySelectorAll('.cr-chip[data-chip-index]').forEach((btn) => {
      const def = CHIP_DEFS[Number(btn.dataset.chipIndex)];
      if (def && def.type === 'fraction') btn.dataset.tooltip = `Mise : ${fmt(chipAmount(def))} jetons`;
    });
  }

  function selectChip(index) {
    selectedChipIndex = index;
    Sfx.click();
    document.querySelectorAll('.cr-chip').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.chipIndex) === index);
    });
  }

  /* ---------------- Dés (cubes 3D) ---------------- */
  function faceHTML(value, side) {
    const cells = Array.from({ length: 9 }, (_, i) => `<span class="cr-pip${PIPS[value].includes(i) ? ' on' : ''}"></span>`).join('');
    return `<div class="cr-face cr-face-${side}">${cells}</div>`;
  }

  function dieHTML(id) {
    return `
      <div class="cr-die-wrap" id="${id}-wrap">
        <div class="cr-die-shadow"></div>
        <div class="cr-die" id="${id}">
          ${faceHTML(1, 'front')}${faceHTML(6, 'back')}${faceHTML(2, 'right')}
          ${faceHTML(5, 'left')}${faceHTML(3, 'top')}${faceHTML(4, 'bottom')}
        </div>
      </div>`;
  }

  // Lance un dé : trajectoire avec rebonds (wrapper) + rotation qui
  // termine pile sur la face tirée (cube).
  function throwDie(id, value, delay, lane) {
    const wrap = document.getElementById(`${id}-wrap`);
    const die = document.getElementById(id);
    if (!wrap || !die) return;
    // on repart de zéro (annule les animations du lancer précédent)
    die.getAnimations().forEach((a) => a.cancel());
    wrap.getAnimations().forEach((a) => a.cancel());
    const spinsX = 3 + Math.floor(Math.random() * 3);
    const spinsY = 2 + Math.floor(Math.random() * 3);
    const end = FACE_ROT[value];
    const tilt = Math.round((Math.random() - 0.5) * 24); // léger angle final, comme un vrai dé posé
    const finalT = `rotateX(${end.x + 360 * spinsX}deg) rotateY(${end.y + 360 * spinsY}deg) rotateZ(${tilt}deg)`;

    die.animate(
      [
        { transform: `rotateX(${Math.random() * 360}deg) rotateY(${Math.random() * 360}deg) rotateZ(0deg)` },
        { transform: finalT },
      ],
      { duration: ROLL_MS, delay, easing: 'cubic-bezier(0.15, 0.6, 0.25, 1)', fill: 'forwards' }
    );

    const y = lane * 6;
    wrap.animate(
      [
        { transform: `translate(-320px, ${-60 + y}px) scale(1.15)`, offset: 0 },
        { transform: `translate(-170px, ${y}px) scale(1)`, offset: BOUNCES[0] },
        { transform: `translate(-95px, ${-34 + y}px) scale(1.06)`, offset: 0.45 },
        { transform: `translate(-40px, ${y}px) scale(1)`, offset: BOUNCES[1] },
        { transform: `translate(-16px, ${-14 + y}px) scale(1.02)`, offset: 0.68 },
        { transform: `translate(-4px, ${y}px) scale(1)`, offset: BOUNCES[2] },
        { transform: `translate(0px, ${-4 + y}px)`, offset: 0.84 },
        { transform: `translate(0px, ${y}px)`, offset: BOUNCES[3] },
        { transform: `translate(0px, ${y}px)`, offset: 1 },
      ],
      { duration: ROLL_MS, delay, easing: 'linear', fill: 'forwards' }
    );
  }

  /* ---------------- Affichages ---------------- */
  function setMessage(msg, cls) {
    const el = document.getElementById('cr-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg cr-message' + (cls ? ' ' + cls : '');
  }

  function totalOnTable() {
    return Object.values(bets).reduce((s, v) => s + v, 0);
  }

  function renderBets() {
    Object.keys(bets).forEach((zone) => {
      const badge = document.querySelector(`[data-badge-for="${zone}"]`);
      if (!badge) return;
      badge.innerHTML = bets[zone] > 0 ? `${fmt(bets[zone])}` : '';
      badge.classList.toggle('show', bets[zone] > 0);
    });
    const total = document.getElementById('cr-total');
    if (total) total.textContent = fmt(totalOnTable());
    // les mises de contrat sont verrouillées une fois le point établi
    document.querySelectorAll('.cr-zone[data-contract="1"]').forEach((el) => {
      el.classList.toggle('cr-zone-locked', point !== null);
    });
  }

  function renderPuck() {
    const puck = document.getElementById('cr-puck');
    if (!puck) return;
    document.querySelectorAll('.cr-point-box').forEach((box) => box.classList.toggle('cr-point-active', Number(box.dataset.point) === point));
    if (point === null) {
      puck.textContent = 'OFF';
      puck.className = 'cr-puck cr-puck-off';
      document.getElementById('cr-puck-slot').appendChild(puck);
    } else {
      puck.textContent = 'ON';
      puck.className = 'cr-puck cr-puck-on';
      const box = document.querySelector(`.cr-point-box[data-point="${point}"]`);
      if (box) box.appendChild(puck);
    }
    const phase = document.getElementById('cr-phase');
    if (phase) phase.textContent = point === null ? 'Come-out' : `Point : ${point}`;
  }

  function renderHistory() {
    const el = document.getElementById('cr-history');
    if (!el) return;
    el.innerHTML = history
      .slice(0, 14)
      .map((h) => `<span class="cr-hist cr-hist-${h.tag}" title="${h.d1} + ${h.d2}">${h.sum}</span>`)
      .join('');
  }

  function flashZone(zone, won) {
    const el = document.querySelector(`.cr-zone[data-zone="${zone}"]`);
    if (!el) return;
    el.classList.remove('cr-zone-win', 'cr-zone-lose');
    void el.offsetWidth;
    el.classList.add(won ? 'cr-zone-win' : 'cr-zone-lose');
  }

  function toggleControls(enabled) {
    ['cr-roll-btn', 'cr-clear-btn'].forEach((id) => {
      const b = document.getElementById(id);
      if (b) b.disabled = !enabled;
    });
    document.querySelectorAll('.cr-zone, .cr-chip').forEach((b) => (b.disabled = !enabled));
  }

  /* ---------------- Mises ---------------- */
  function placeBet(zone) {
    if (rolling) return;
    if (ZONES[zone].contract && point !== null) {
      setMessage(`${ZONES[zone].label} se joue seulement au come-out (avant qu'un point soit établi).`, 'msg-warn');
      Sfx.denied();
      return;
    }
    const amount = selectedAmount();
    if (amount <= 0 || !Wallet.canAfford(amount)) {
      setMessage('Solde insuffisant pour ce jeton.', 'msg-warn');
      Sfx.denied();
      return;
    }
    Wallet.subtract(amount);
    bets[zone] += amount;
    Sfx.chip();
    renderBets();
    setMessage(`Mise placée : ${ZONES[zone].label} (${fmt(amount)} jetons). Paiement ${ZONES[zone].pays}.`);
  }

  // clic droit : retire un jeton (impossible sur une mise de contrat en cours)
  function removeBet(zone) {
    if (rolling || bets[zone] <= 0) return;
    if (ZONES[zone].contract && point !== null) {
      setMessage('Une mise Pass / Don\'t Pass ne peut pas être retirée tant que le point est en jeu.', 'msg-warn');
      Sfx.denied();
      return;
    }
    const refund = Math.min(selectedAmount() || bets[zone], bets[zone]);
    bets[zone] -= refund;
    Wallet.add(refund);
    Sfx.chip();
    renderBets();
  }

  function clearBets() {
    if (rolling) return;
    let refund = 0;
    Object.keys(bets).forEach((zone) => {
      if (ZONES[zone].contract && point !== null) return; // verrouillées
      refund += bets[zone];
      bets[zone] = 0;
    });
    if (refund > 0) {
      Wallet.add(refund);
      Sfx.chipsSweep();
      setMessage('Mises retirées.');
    }
    renderBets();
  }

  /* ---------------- Lancer ---------------- */
  function roll() {
    if (rolling) return;
    if (totalOnTable() <= 0) {
      setMessage('Placez au moins une mise avant de lancer les dés.', 'msg-warn');
      Sfx.denied();
      return;
    }
    rolling = true;
    toggleControls(false);
    setMessage('Les dés roulent…');
    const sumEl = document.getElementById('cr-sum');
    if (sumEl) sumEl.className = 'cr-sum';

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);

    Sfx.diceThrow(ROLL_MS / 1000, BOUNCES);
    if (window.Stats) Stats.round();
    throwDie('cr-die-1', d1, 0, -1);
    throwDie('cr-die-2', d2, 60, 1);

    setTimeout(() => resolve(d1, d2), ROLL_MS + 120);
  }

  function resolve(d1, d2) {
    const sum = d1 + d2;
    const sumEl = document.getElementById('cr-sum');
    if (sumEl) {
      sumEl.textContent = sum;
      sumEl.className = 'cr-sum cr-sum-show';
    }

    let returned = 0; // total rendu au joueur (mise + gain)
    let stakeResolved = 0; // mises réglées sur ce lancer
    let anyWin = false;
    let anyLoss = false;
    const notes = [];

    const settle = (zone, multiplier) => {
      // multiplier = 0 perdu, 1 remboursé, 2 = 1:1, etc.
      const stake = bets[zone];
      if (stake <= 0) return;
      stakeResolved += stake;
      returned += stake * multiplier;
      if (multiplier > 1) anyWin = true;
      if (multiplier === 0) anyLoss = true;
      if (multiplier !== 1) flashZone(zone, multiplier > 1);
      bets[zone] = 0;
    };

    // --- mises "un seul lancer"
    if ([3, 4, 9, 10, 11].includes(sum)) settle('field', 2);
    else if (sum === 2 || sum === 12) settle('field', 3);
    else settle('field', 0);
    settle('any7', sum === 7 ? 5 : 0);
    settle('anyCraps', [2, 3, 12].includes(sum) ? 8 : 0);

    // --- mises de contrat
    let tag = 'neutral';
    if (point === null) {
      if (sum === 7 || sum === 11) {
        settle('pass', 2);
        settle('dontPass', 0);
        notes.push(`${sum} au come-out : « natural », Pass gagne.`);
        tag = 'win';
      } else if (sum === 2 || sum === 3) {
        settle('pass', 0);
        settle('dontPass', 2);
        notes.push(`${sum} : craps ! Pass perd, Don't Pass gagne.`);
        tag = 'craps';
      } else if (sum === 12) {
        settle('pass', 0);
        if (bets.dontPass > 0) notes.push('12 : craps ! Pass perd, Don\'t Pass est nul (la mise reste).');
        else notes.push('12 : craps ! Pass perd.');
        tag = 'craps';
      } else {
        point = sum;
        notes.push(`Point établi sur ${sum}. Il faut le refaire avant un 7.`);
        Sfx.pointOn();
        tag = 'point';
      }
    } else if (sum === point) {
      settle('pass', 2);
      settle('dontPass', 0);
      notes.push(`${sum} : le point est refait ! Pass gagne.`);
      point = null;
      tag = 'win';
    } else if (sum === 7) {
      settle('pass', 0);
      settle('dontPass', 2);
      notes.push('7 : « seven out » ! Pass perd, Don\'t Pass gagne.');
      point = null;
      tag = 'seven';
    } else {
      notes.push(`${sum} : rien pour la ligne, on relance (point ${point}).`);
    }

    if (returned > 0) Wallet.add(returned);

    const net = returned - stakeResolved;
    if (anyWin) {
      Sfx.winFor(returned, stakeResolved);
      if (net > 0) notes.push(`Gain : +${fmt(net)} jetons.`);
      else if (net === 0) notes.push('Bilan du lancer : 0 (le gain compense la perte).');
      else notes.push(`Bilan du lancer : ${fmt(net)} jetons.`);
    } else if (anyLoss) {
      Sfx.lose();
      notes.push(`Perdu : ${fmt(stakeResolved - returned)} jetons.`);
    }

    history.unshift({ sum, d1, d2, tag: sum === 7 ? 'seven' : tag });
    history = history.slice(0, 14);
    renderHistory();
    renderBets();
    renderPuck();
    setMessage(notes.join(' '), anyWin ? 'msg-good' : anyLoss ? 'msg-bad' : '');

    rolling = false;
    toggleControls(true);
  }

  /* ---------------- Construction ---------------- */
  function zoneHTML(zone, inner, extraClass) {
    const z = ZONES[zone];
    return `<button type="button" class="cr-zone ${extraClass}" data-zone="${zone}" data-contract="${z.contract ? 1 : 0}"
        data-tooltip="Paie ${z.pays} · avantage maison ${z.edge}">
        ${inner}
        <span class="cr-zone-badge" data-badge-for="${zone}"></span>
      </button>`;
  }

  function init() {
    const container = document.querySelector('#craps .game-body');
    if (!container || built) return;
    built = true;

    const pointBoxes = POINT_NUMBERS.map((n) => {
      const label = n === 6 ? 'SIX' : n === 9 ? 'NINE' : n;
      return `<div class="cr-point-box" data-point="${n}"><span class="cr-point-num">${label}</span></div>`;
    }).join('');

    container.innerHTML = `
      <div class="cr-wrap">
        <div class="cr-board-panel">
          <div class="cr-top-bar">
            <div class="cr-stat">
              <span class="cr-stat-label">Phase</span>
              <span class="cr-stat-value" id="cr-phase">Come-out</span>
            </div>
            <div class="cr-history" id="cr-history"></div>
            <div class="cr-stat">
              <span class="cr-stat-label">Sur la table</span>
              <span class="cr-stat-value"><span id="cr-total">0</span> ${coinHTML()}</span>
            </div>
          </div>

          <div class="cr-table">
            <div class="cr-points" id="cr-points">
              <div class="cr-puck-slot" id="cr-puck-slot"><div class="cr-puck cr-puck-off" id="cr-puck">OFF</div></div>
              ${pointBoxes}
            </div>

            <div class="cr-tray">
              <div class="cr-dice">
                ${dieHTML('cr-die-1')}
                ${dieHTML('cr-die-2')}
              </div>
              <div class="cr-sum" id="cr-sum"></div>
            </div>

            <div class="cr-zones">
              ${zoneHTML('field', `
                <span class="cr-zone-title">FIELD</span>
                <span class="cr-field-nums"><b class="cr-dbl">2</b> · 3 · 4 · 9 · 10 · 11 · <b class="cr-dbl">12</b></span>
                <span class="cr-zone-sub">2 et 12 paient double</span>`, 'cr-zone-field')}
              <div class="cr-zone-row">
                ${zoneHTML('any7', `<span class="cr-zone-title">ANY 7</span><span class="cr-zone-sub">paie 4 pour 1</span>`, 'cr-zone-any7')}
                ${zoneHTML('anyCraps', `<span class="cr-zone-title">ANY CRAPS</span><span class="cr-zone-sub">2 · 3 · 12 — paie 7 pour 1</span>`, 'cr-zone-craps')}
              </div>
              ${zoneHTML('dontPass', `<span class="cr-zone-title">DON'T PASS BAR</span><span class="cr-zone-sub">contre le lanceur · 12 nul</span>`, 'cr-zone-dont')}
              ${zoneHTML('pass', `<span class="cr-zone-title">PASS LINE</span><span class="cr-zone-sub">avec le lanceur</span>`, 'cr-zone-pass')}
            </div>
          </div>
        </div>

        <div class="cr-side-panel">
          <p id="cr-message" class="game-msg cr-message">Posez vos jetons sur la table, puis lancez les dés.</p>
          <div class="cr-chip-row" id="cr-chip-row">${buildChipsHTML()}</div>
          <p class="cr-hint">Clic : poser un jeton · Clic droit : en retirer un</p>
          <div class="cr-actions">
            <button type="button" class="btn-action cr-clear" id="cr-clear-btn">Retirer les mises</button>
            <button type="button" class="btn-action cr-roll" id="cr-roll-btn">LANCER LES DÉS</button>
          </div>

          <details class="cr-rules">
            <summary>Règles et chances</summary>
            <ul>
              <li><b>Come-out</b> (premier lancer) : 7 ou 11 = Pass gagne. 2, 3, 12 = Pass perd. Sinon le total devient le <b>point</b>.</li>
              <li><b>Point en jeu</b> : refaire le point avant un 7 = Pass gagne. Un 7 d'abord = Don't Pass gagne.</li>
              <li>Le 7 est le total le plus fréquent : 6 combinaisons sur 36 (16,7 %).</li>
            </ul>
            <table class="cr-edge-table">
              <tr><th>Mise</th><th>Paie</th><th>Avantage maison</th></tr>
              ${Object.values(ZONES).map((z) => `<tr><td>${z.label}</td><td>${z.pays}</td><td>${z.edge}</td></tr>`).join('')}
            </table>
            <p class="cr-rules-note">Plus l'avantage maison est petit, moins vous perdez en moyenne. Les mises « Any » paient gros mais coûtent cher sur la durée.</p>
          </details>
        </div>
      </div>
    `;

    bindEvents(container);
    // dés posés au repos (faces 6 et 5)
    ['cr-die-1', 'cr-die-2'].forEach((id, i) => {
      const r = FACE_ROT[i === 0 ? 6 : 5];
      document.getElementById(id).style.transform = `rotateX(${r.x}deg) rotateY(${r.y}deg)`;
    });
    renderBets();
    renderPuck();
    Wallet.refreshUI();
  }

  function bindEvents(container) {
    container.querySelectorAll('.cr-chip').forEach((btn) => {
      btn.addEventListener('click', () => selectChip(Number(btn.dataset.chipIndex)));
    });
    container.querySelectorAll('.cr-zone').forEach((btn) => {
      btn.addEventListener('click', () => placeBet(btn.dataset.zone));
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        removeBet(btn.dataset.zone);
      });
    });
    container.querySelector('#cr-roll-btn').addEventListener('click', roll);
    container.querySelector('#cr-clear-btn').addEventListener('click', clearBets);
    Wallet.onChange(() => refreshFractionChipTooltips());
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Craps.init());
