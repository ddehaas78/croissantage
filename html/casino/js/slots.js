/* slots.js
   A small reusable slot-machine engine. Two games are instantiated from
   it below with entirely original names / symbols / art (emoji glyphs,
   no copyrighted assets) but with mechanics modelled on classic 5-reel
   adventurer-themed slots: paylines, wild substitution, scatter-triggered
   free spins, and a red/black gamble feature.
*/

const STANDARD_LINES = [
  [1, 1, 1, 1, 1], // mid straight
  [0, 0, 0, 0, 0], // top straight
  [2, 2, 2, 2, 2], // bottom straight
  [0, 1, 2, 1, 0], // V
  [2, 1, 0, 1, 2], // ^
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
];

function buildStrip(symbols) {
  const strip = [];
  symbols.forEach((s) => {
    for (let i = 0; i < s.weight; i++) strip.push(s.id);
  });
  return strip;
}

function shuffleCopy(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class SlotMachine {
  constructor(config) {
    this.cfg = config; // {id, name, tagline, rtp, reels, rows, linesUsed, symbols, freeSpins:{trigger,awarded,expandingWild}, mount}
    this.symbolsById = Object.fromEntries(config.symbols.map((s) => [s.id, s]));
    this.strip = buildStrip(config.symbols);
    this.lines = STANDARD_LINES.slice(0, config.linesUsed);
    this.betPerLine = config.minBet || 1;
    this.linesEnabled = config.linesUsed;
    this.autoplay = false;
    this.freeSpinsLeft = 0;
    this.gambleAmount = 0;
    this.spinning = false;
    this.mount = document.getElementById(config.mount);
    this._render();
    this._bind();
  }

  totalBet() {
    return this.betPerLine * this.linesEnabled;
  }

  _render() {
    const c = this.cfg;
    this.mount.innerHTML = `
      <div class="slot-wrap">
        <div class="slot-marquee gold-text">${c.name}</div>
        <div class="free-spins-banner hidden" data-el="fsBanner"></div>
        <div class="slot-frame">
          <span class="slot-rtp">RTP ${c.rtp}%</span>
          <div class="reels" data-el="reels" style="grid-template-columns: repeat(${c.reels}, 1fr);"></div>
        </div>
        <div class="slot-msg-line" data-el="msg">Bonne chance !</div>
        <div class="slot-controls">
          <div class="control-group">
            <span class="control-label">Mise/ligne</span>
            <button class="stepper-btn" data-el="betMinus">−</button>
            <span class="stepper-val" data-el="betVal">${this.betPerLine}</span>
            <button class="stepper-btn" data-el="betPlus">+</button>
          </div>
          <div class="control-group">
            <span class="control-label">Lignes</span>
            <span class="stepper-val" data-el="linesVal">${this.linesEnabled}</span>
          </div>
          <button class="spin-btn" data-el="spinBtn">SPIN</button>
          <div class="slot-side-buttons">
            <button class="icon-btn" data-el="autoBtn">Auto</button>
            <button class="icon-btn" data-el="payBtn">Gains</button>
            <button class="icon-btn gamble-btn hidden" data-el="gambleBtn">Doubler</button>
          </div>
        </div>
      </div>
    `;
    this.el = {
      reels: this.mount.querySelector('[data-el="reels"]'),
      msg: this.mount.querySelector('[data-el="msg"]'),
      fsBanner: this.mount.querySelector('[data-el="fsBanner"]'),
      betMinus: this.mount.querySelector('[data-el="betMinus"]'),
      betPlus: this.mount.querySelector('[data-el="betPlus"]'),
      betVal: this.mount.querySelector('[data-el="betVal"]'),
      linesVal: this.mount.querySelector('[data-el="linesVal"]'),
      spinBtn: this.mount.querySelector('[data-el="spinBtn"]'),
      autoBtn: this.mount.querySelector('[data-el="autoBtn"]'),
      payBtn: this.mount.querySelector('[data-el="payBtn"]'),
      gambleBtn: this.mount.querySelector('[data-el="gambleBtn"]'),
    };
    this._buildReelsDom();
  }

  _buildReelsDom() {
    const c = this.cfg;
    this.el.reels.innerHTML = '';
    this.reelEls = [];
    for (let r = 0; r < c.reels; r++) {
      const reelDiv = document.createElement('div');
      reelDiv.className = 'reel';
      for (let row = 0; row < c.rows; row++) {
        const sym = document.createElement('div');
        sym.className = 'symbol';
        reelDiv.appendChild(sym);
      }
      this.el.reels.appendChild(reelDiv);
      this.reelEls.push(reelDiv);
    }
    // paint an initial idle grid
    const grid = this._randomGrid();
    this._paintGrid(grid);
  }

  _randomGrid() {
    const c = this.cfg;
    const grid = [];
    for (let r = 0; r < c.reels; r++) {
      const col = [];
      const start = Math.floor(Math.random() * this.strip.length);
      for (let row = 0; row < c.rows; row++) {
        col.push(this.strip[(start + row) % this.strip.length]);
      }
      grid.push(col);
    }
    return grid;
  }

  _paintGrid(grid, winMask) {
    const c = this.cfg;
    for (let r = 0; r < c.reels; r++) {
      const reelChildren = this.reelEls[r].children;
      for (let row = 0; row < c.rows; row++) {
        const symId = grid[r][row];
        const sdef = this.symbolsById[symId];
        const cell = reelChildren[row];
        cell.textContent = sdef.glyph;
        cell.className = 'symbol' + (sdef.isCard ? ' card-symbol' : '') + (sdef.isWild ? ' wild-symbol' : '') + (sdef.isScatter ? ' scatter-symbol' : '');
        if (winMask && winMask[r] && winMask[r][row]) {
          cell.classList.add('win-glow');
        }
      }
    }
  }

  _bind() {
    this.el.betMinus.addEventListener('click', () => this._changeBet(-1));
    this.el.betPlus.addEventListener('click', () => this._changeBet(1));
    this.el.spinBtn.addEventListener('click', () => this.spin());
    this.el.autoBtn.addEventListener('click', () => this._toggleAutoplay());
    this.el.payBtn.addEventListener('click', () => this._showPaytable());
    this.el.gambleBtn.addEventListener('click', () => this._openGamble());
  }

  _changeBet(dir) {
    if (this.spinning) return;
    const step = this.cfg.betStep || 1;
    const min = this.cfg.minBet || 1;
    const max = this.cfg.maxBet || 50;
    this.betPerLine = Math.min(max, Math.max(min, this.betPerLine + dir * step));
    this.el.betVal.textContent = this.betPerLine;
  }

  _setMsg(text) {
    this.el.msg.textContent = text;
  }

  _toggleAutoplay() {
    this.autoplay = !this.autoplay;
    this.el.autoBtn.classList.toggle('active-toggle', this.autoplay);
    this.el.autoBtn.textContent = this.autoplay ? 'Stop' : 'Auto';
    if (this.autoplay && !this.spinning) this.spin();
  }

  _showPaytable() {
    const rows = this.cfg.symbols
      .filter((s) => !s.hideFromPaytable)
      .map((s) => {
        const p = s.payouts;
        const label = s.isScatter
          ? `Scatter — déclenche les tours gratuits`
          : `x3: ${p[3]} · x4: ${p[4]} · x5: ${p[5]} (× mise/ligne)`;
        return `<div class="paytable-row"><span><span class="sym">${s.glyph}</span>${s.label}</span><span>${label}</span></div>`;
      })
      .join('');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <div class="section-heading">Tableau des gains — ${this.cfg.name}</div>
        <div class="paytable-grid">${rows}</div>
        <button class="btn btn-ghost" style="margin-top:16px;width:100%;">Fermer</button>
      </div>`;
    backdrop.querySelector('button').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
    document.body.appendChild(backdrop);
  }

  spin() {
    if (this.spinning) return;
    const isFree = this.freeSpinsLeft > 0;
    const cost = isFree ? 0 : this.totalBet();

    if (!isFree) {
      if (!Wallet.canAfford(cost)) {
        this._setMsg('Solde insuffisant — rechargez vos jetons.');
        this.autoplay = false;
        this.el.autoBtn.classList.remove('active-toggle');
        this.el.autoBtn.textContent = 'Auto';
        return;
      }
      Wallet.subtract(cost);
    }

    this.spinning = true;
    this.el.spinBtn.disabled = true;
    this.el.spinBtn.classList.add('spinning');
    this.el.gambleBtn.classList.add('hidden');
    this.el.betMinus.disabled = true;
    this.el.betPlus.disabled = true;
    this.reelEls.forEach((r) => r.classList.add('spinning'));
    this._setMsg(isFree ? `Tour gratuit — il en reste ${this.freeSpinsLeft}` : 'Les rouleaux tournent...');

    setTimeout(() => this._resolveSpin(isFree), 700 + Math.random() * 300);
  }

  _resolveSpin(wasFree) {
    let grid = this._randomGrid();

    // Expanding wild during free spins (Tomb of Gold style)
    if (wasFree && this.cfg.freeSpins.expandingWild) {
      for (let r = 0; r < this.cfg.reels; r++) {
        if (grid[r].includes('wild')) {
          grid[r] = grid[r].map(() => 'wild');
        }
      }
    }

    this.reelEls.forEach((r) => r.classList.remove('spinning'));

    const { totalWin, winMask, scatterCount } = this._evaluate(grid);

    this._paintGrid(grid, winMask);

    if (wasFree) this.freeSpinsLeft -= 1;

    let msg = '';
    if (totalWin > 0) {
      Wallet.add(totalWin);
      this.lastWin = totalWin;
      msg = `Gain : ${totalWin.toLocaleString('fr-FR')} jetons !`;
      this.el.gambleBtn.classList.remove('hidden');
      this.gambleAmount = totalWin;
    } else {
      msg = wasFree ? 'Aucun gain sur ce tour gratuit.' : 'Pas de gain, retentez votre chance.';
    }

    if (scatterCount >= this.cfg.freeSpins.trigger) {
      const awarded = this.cfg.freeSpins.awarded;
      this.freeSpinsLeft += awarded;
      msg += ` ${scatterCount} scatters — ${awarded} tours gratuits gagnés !`;
    }

    this._setMsg(msg);

    if (this.freeSpinsLeft > 0) {
      this.el.fsBanner.classList.remove('hidden');
      this.el.fsBanner.textContent = `TOURS GRATUITS — il en reste ${this.freeSpinsLeft}`;
    } else {
      this.el.fsBanner.classList.add('hidden');
    }

    this.spinning = false;
    this.el.spinBtn.classList.remove('spinning');
    this.el.betMinus.disabled = false;
    this.el.betPlus.disabled = false;
    this.el.spinBtn.disabled = false;

    if (this.freeSpinsLeft > 0) {
      setTimeout(() => this.spin(), 900);
    } else if (this.autoplay) {
      if (Wallet.canAfford(this.totalBet())) {
        setTimeout(() => this.spin(), 900);
      } else {
        this.autoplay = false;
        this.el.autoBtn.classList.remove('active-toggle');
        this.el.autoBtn.textContent = 'Auto';
      }
    }
  }

  _evaluate(grid) {
    const c = this.cfg;
    let totalWin = 0;
    const winMask = Array.from({ length: c.reels }, () => Array(c.rows).fill(false));

    this.lines.forEach((line) => {
      const seq = line.map((row, reelIdx) => grid[reelIdx][row]);
      let target = null;
      let count = 0;
      const matchedPositions = [];

      for (let i = 0; i < seq.length; i++) {
        const symId = seq[i];
        const sdef = this.symbolsById[symId];
        if (sdef.isScatter) break; // scatters don't pay on lines
        if (target === null) {
          target = symId === 'wild' ? 'wild' : symId;
          count = 1;
          matchedPositions.push(i);
          continue;
        }
        const isMatch = symId === target || symId === 'wild' || (target === 'wild' && !sdef.isScatter);
        if (target === 'wild' && symId !== 'wild') {
          // upgrade target to the first real symbol once found
          target = symId;
        }
        if (symId === target || symId === 'wild') {
          count++;
          matchedPositions.push(i);
        } else {
          break;
        }
      }

      if (count >= 3 && target && target !== 'wild') {
        const payoutTable = this.symbolsById[target].payouts;
        const mult = payoutTable[count] || 0;
        if (mult > 0) {
          const win = mult * this.betPerLine;
          totalWin += win;
          matchedPositions.forEach((i) => {
            winMask[i][line[i]] = true;
          });
        }
      } else if (count >= 3 && target === 'wild') {
        const payoutTable = this.symbolsById.wild.payouts;
        const mult = payoutTable[count] || 0;
        const win = mult * this.betPerLine;
        totalWin += win;
        matchedPositions.forEach((i) => {
          winMask[i][line[i]] = true;
        });
      }
    });

    // Scatter pays on the whole grid, independent of lines
    let scatterCount = 0;
    for (let r = 0; r < c.reels; r++) {
      for (let row = 0; row < c.rows; row++) {
        if (this.symbolsById[grid[r][row]].isScatter) {
          scatterCount++;
          winMask[r][row] = true;
        }
      }
    }
    if (scatterCount >= 3) {
      const scatterDef = c.symbols.find((s) => s.isScatter);
      const mult = scatterDef.payouts[Math.min(scatterCount, 5)] || 0;
      totalWin += mult * this.totalBet();
    }

    return { totalWin, winMask, scatterCount };
  }

  _openGamble() {
    if (this.gambleAmount <= 0) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="text-align:center;">
        <div class="section-heading" style="justify-content:center;">Doubler ou rien</div>
        <div class="gamble-pot">Mise en jeu : <span data-el="pot">${this.gambleAmount}</span> jetons</div>
        <div class="gamble-choice-row">
          <div class="gamble-card red" data-choice="red">♦</div>
          <div class="gamble-card black" data-choice="black">♠</div>
        </div>
        <button class="btn btn-ghost" data-el="collect" style="margin-top:22px;width:100%;">Encaisser</button>
      </div>`;
    document.body.appendChild(backdrop);

    const potEl = backdrop.querySelector('[data-el="pot"]');
    const collectBtn = backdrop.querySelector('[data-el="collect"]');

    backdrop.querySelectorAll('.gamble-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const choice = cardEl.dataset.choice;
        const result = Math.random() < 0.5 ? 'red' : 'black';
        if (choice === result) {
          this.gambleAmount *= 2;
          Wallet.add(this.gambleAmount / 2); // add the amount just won (doubling)
          potEl.textContent = this.gambleAmount;
          this._setMsg(`Bien joué ! Cagnotte : ${this.gambleAmount.toLocaleString('fr-FR')} jetons.`);
        } else {
          Wallet.subtract(Math.min(this.gambleAmount, Wallet.get()));
          this.gambleAmount = 0;
          this._setMsg('Perdu... la cagnotte est repartie à zéro.');
          this.el.gambleBtn.classList.add('hidden');
          backdrop.remove();
        }
      });
    });

    collectBtn.addEventListener('click', () => {
      this._setMsg(`Cagnotte encaissée : ${this.gambleAmount.toLocaleString('fr-FR')} jetons.`);
      this.gambleAmount = 0;
      this.el.gambleBtn.classList.add('hidden');
      backdrop.remove();
    });
  }
}

/* ---------------- Game configs ---------------- */

const VOYAGER_SYMBOLS = [
  { id: 'wild', glyph: '🦜', label: 'Perroquet (Wild)', isWild: true, weight: 2, payouts: { 3: 8, 4: 40, 5: 200 } },
  { id: 'scatter', glyph: '🚢', label: 'Navire (Scatter)', isScatter: true, weight: 2, payouts: { 3: 2, 4: 10, 5: 50 } },
  { id: 'queen', glyph: '👑', label: 'Couronne', weight: 4, payouts: { 3: 5, 4: 20, 5: 100 } },
  { id: 'necklace', glyph: '📿', label: 'Collier d’or', weight: 5, payouts: { 3: 4, 4: 15, 5: 75 } },
  { id: 'compass', glyph: '🧭', label: 'Boussole', weight: 6, payouts: { 3: 3, 4: 10, 5: 50 } },
  { id: 'A', glyph: 'A', label: 'As', isCard: true, weight: 9, payouts: { 3: 1, 4: 4, 5: 15 } },
  { id: 'K', glyph: 'K', label: 'Roi', isCard: true, weight: 9, payouts: { 3: 1, 4: 3, 5: 12 } },
  { id: 'Q', glyph: 'Q', label: 'Dame', isCard: true, weight: 10, payouts: { 3: 0.8, 4: 2.5, 5: 10 } },
  { id: 'J', glyph: 'J', label: 'Valet', isCard: true, weight: 10, payouts: { 3: 0.6, 4: 2, 5: 8 } },
  { id: 'ten', glyph: '10', label: 'Dix', isCard: true, weight: 11, payouts: { 3: 0.5, 4: 1.5, 5: 6 } },
];

const TOMB_SYMBOLS = [
  { id: 'wild', glyph: '🗿', label: 'Statue (Wild)', isWild: true, weight: 2, payouts: { 3: 10, 4: 50, 5: 250 } },
  { id: 'scatter', glyph: '📖', label: 'Grimoire (Scatter)', isScatter: true, weight: 2, payouts: { 3: 2, 4: 10, 5: 50 } },
  { id: 'snake', glyph: '🐍', label: 'Dieu Serpent', weight: 4, payouts: { 3: 6, 4: 25, 5: 120 } },
  { id: 'falcon', glyph: '🦅', label: 'Dieu Faucon', weight: 5, payouts: { 3: 5, 4: 20, 5: 100 } },
  { id: 'eye', glyph: '👁️', label: 'Œil sacré', weight: 6, payouts: { 3: 4, 4: 15, 5: 80 } },
  { id: 'A', glyph: 'A', label: 'As', isCard: true, weight: 9, payouts: { 3: 1, 4: 4, 5: 16 } },
  { id: 'K', glyph: 'K', label: 'Roi', isCard: true, weight: 9, payouts: { 3: 1, 4: 3, 5: 13 } },
  { id: 'Q', glyph: 'Q', label: 'Dame', isCard: true, weight: 10, payouts: { 3: 0.8, 4: 2.5, 5: 10 } },
  { id: 'J', glyph: 'J', label: 'Valet', isCard: true, weight: 10, payouts: { 3: 0.6, 4: 2, 5: 8 } },
  { id: 'ten', glyph: '10', label: 'Dix', isCard: true, weight: 11, payouts: { 3: 0.5, 4: 1.5, 5: 6 } },
];

let voyagerSlot, tombSlot;

function initSlots() {
  if (!voyagerSlot && document.getElementById('voyager-mount')) {
    voyagerSlot = new SlotMachine({
      id: 'voyager',
      name: "Voyager's Fortune",
      mount: 'voyager-mount',
      reels: 5,
      rows: 3,
      linesUsed: 9,
      rtp: 97,
      minBet: 1,
      maxBet: 50,
      betStep: 1,
      symbols: VOYAGER_SYMBOLS,
      freeSpins: { trigger: 3, awarded: 10, expandingWild: false },
    });
  }
  if (!tombSlot && document.getElementById('tomb-mount')) {
    tombSlot = new SlotMachine({
      id: 'tomb',
      name: 'Tomb of Gold',
      mount: 'tomb-mount',
      reels: 5,
      rows: 3,
      linesUsed: 10,
      rtp: 96.2,
      minBet: 1,
      maxBet: 50,
      betStep: 1,
      symbols: TOMB_SYMBOLS,
      freeSpins: { trigger: 3, awarded: 10, expandingWild: true },
    });
  }
}

window.onGameOpened = function onGameOpened(screenId) {
  if (screenId === 'screen-voyager' || screenId === 'screen-tomb') initSlots();
};

document.addEventListener('DOMContentLoaded', () => {
  // Pre-init if either screen is already the active one on load (not typical, but safe).
  if (document.getElementById('screen-voyager')?.classList.contains('active') ||
      document.getElementById('screen-tomb')?.classList.contains('active')) {
    initSlots();
  }
});