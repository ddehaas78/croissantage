/* poker.js — Texas Hold'em (No Limit) contre 4 bots, pour Croissantage

   Déroulement d'une main (règles officielles) :
   - bouton donneur qui tourne, petite et grosse blinde obligatoires ;
   - 2 cartes privées chacun, puis 4 tours d'enchères :
     préflop, flop (3 cartes communes), turn (4e), river (5e) ;
   - à l'abattage, chacun fait la meilleure main de 5 cartes parmi ses
     2 cartes + les 5 communes ; pots annexes (side pots) gérés en cas de tapis.

   Côté casino : au poker, la maison ne joue pas contre vous. Elle gagne
   en prélevant une COMMISSION (le "rake") sur chaque pot : ici 5 %,
   plafonnée à 3 grosses blindes, et seulement si le flop a été servi
   ("no flop, no drop"), comme dans les vraies salles.

   Les bots estiment leurs chances avec une simulation Monte-Carlo (ils
   jouent des centaines de fins de main au hasard) et comparent ça aux
   cotes du pot, avec chacun un style (serré / large, passif / agressif,
   bluffeur). La même simulation alimente le panneau "Aide" du joueur.

   Les jetons à table sont pris dans le Wallet à l'arrivée (la "cave")
   et y retournent quand on quitte la table (ou qu'on quitte la page).
*/
const Poker = (() => {
  /* ---------------- Constantes ---------------- */
  const SKIN_ROOT_PREFIX = '../../';
  const BUY_INS = [500, 1000, 2000, 5000];
  const RAKE_RATE = 0.05;
  const RAKE_CAP_BB = 3;
  const SEAT_COUNT = 5; // le joueur + 4 bots

  const RANK_LABEL = { 11: 'V', 12: 'D', 13: 'R', 14: 'A' };
  const RANK_NAME_PLURAL = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'Valets', 12: 'Dames', 13: 'Rois', 14: 'As' };
  const RANK_NAME = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'Valet', 12: 'Dame', 13: 'Roi', 14: 'As' };
  const SUITS = ['♠', '♥', '♦', '♣'];
  const CATEGORY_NAMES = ['Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];

  // Styles des bots : tight = exigence de main, aggr = envie de relancer, bluff = fréquence de bluff
  const STYLES = [
    { id: 'roc', label: 'Serré', tight: 0.75, aggr: 0.35, bluff: 0.03 },
    { id: 'requin', label: 'Agressif', tight: 0.55, aggr: 0.75, bluff: 0.12 },
    { id: 'touriste', label: 'Large', tight: 0.3, aggr: 0.3, bluff: 0.06 },
    { id: 'maniaque', label: 'Maniaque', tight: 0.25, aggr: 0.85, bluff: 0.22 },
    { id: 'pro', label: 'Équilibré', tight: 0.55, aggr: 0.55, bluff: 0.08 },
  ];

  /* ---------------- État ---------------- */
  let seats = []; // index 0 = joueur humain
  let buyIn = 0;
  let bb = 20;
  let sb = 10;
  let dealerIdx = 0;
  let deck = [];
  let board = [];
  let street = 'idle'; // idle | preflop | flop | turn | river | showdown
  let currentBet = 0;
  let minRaise = 0;
  let handNo = 0;
  let handRunning = false;
  let flopSeen = false;
  let totalRake = 0;
  let humanResolver = null; // résout la promesse d'action du joueur
  let helpOn = true;
  let built = false;
  let botNameCursor = 0;

  /* ---------------- Utilitaires ---------------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
  const rand = (a, b) => a + Math.random() * (b - a);
  const coin = () => '<span class="coin-icon" aria-hidden="true"></span>';

  function human() {
    return seats[0];
  }

  /* ================================================================
     Cartes et évaluation des mains
     ================================================================ */
  function freshDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function straightHigh(uniqueDesc) {
    const set = new Set(uniqueDesc);
    if (set.has(14)) set.add(1); // As bas pour la quinte A-2-3-4-5
    for (let top = 14; top >= 5; top--) {
      let ok = true;
      for (let k = 0; k < 5; k++) if (!set.has(top - k)) { ok = false; break; }
      if (ok) return top;
    }
    return 0;
  }

  // Évalue 5 à 7 cartes. Renvoie { cat, ranks, score } ; plus le score est
  // grand, meilleure est la main.
  function evaluate(cards) {
    const counts = new Array(15).fill(0);
    const bySuit = [[], [], [], []];
    for (const c of cards) {
      counts[c.r]++;
      bySuit[c.s].push(c.r);
    }
    let result = null;
    const flushRanks = bySuit.find((a) => a.length >= 5);
    if (flushRanks) {
      const fr = [...new Set(flushRanks)].sort((a, b) => b - a);
      const sf = straightHigh(fr);
      if (sf) result = { cat: 8, ranks: [sf] };
    }
    if (!result) {
      const quads = [];
      const trips = [];
      const pairs = [];
      const singles = [];
      for (let r = 14; r >= 2; r--) {
        if (counts[r] === 4) quads.push(r);
        else if (counts[r] === 3) trips.push(r);
        else if (counts[r] === 2) pairs.push(r);
        else if (counts[r] === 1) singles.push(r);
      }
      const desc = [];
      for (let r = 14; r >= 2; r--) if (counts[r]) desc.push(r);
      if (quads.length) {
        const kicker = desc.find((r) => r !== quads[0]);
        result = { cat: 7, ranks: [quads[0], kicker] };
      } else if (trips.length && (trips.length > 1 || pairs.length)) {
        const pairPart = trips.length > 1 ? Math.max(trips[1], pairs[0] || 0) : pairs[0];
        result = { cat: 6, ranks: [trips[0], pairPart] };
      } else if (flushRanks) {
        result = { cat: 5, ranks: [...flushRanks].sort((a, b) => b - a).slice(0, 5) };
      } else {
        const st = straightHigh(desc);
        if (st) result = { cat: 4, ranks: [st] };
        else if (trips.length) result = { cat: 3, ranks: [trips[0], ...desc.filter((r) => r !== trips[0]).slice(0, 2)] };
        else if (pairs.length >= 2) {
          const kick = desc.find((r) => r !== pairs[0] && r !== pairs[1]);
          result = { cat: 2, ranks: [pairs[0], pairs[1], kick] };
        } else if (pairs.length === 1) result = { cat: 1, ranks: [pairs[0], ...desc.filter((r) => r !== pairs[0]).slice(0, 3)] };
        else result = { cat: 0, ranks: desc.slice(0, 5) };
      }
    }
    let score = result.cat;
    for (let i = 0; i < 5; i++) score = score * 15 + (result.ranks[i] || 0);
    result.score = score;
    return result;
  }

  function handName(ev) {
    const r = ev.ranks;
    const de = (x) => (x === 14 ? "d'As" : `de ${RANK_NAME_PLURAL[x]}`);
    switch (ev.cat) {
      case 0: return `Carte haute ${RANK_NAME[r[0]]}`;
      case 1: return `Paire ${de(r[0])}`;
      case 2: return `Double paire ${RANK_NAME_PLURAL[r[0]]} et ${RANK_NAME_PLURAL[r[1]]}`;
      case 3: return `Brelan ${de(r[0])}`;
      case 4: return `Quinte au ${RANK_NAME[r[0]]}`;
      case 5: return `Couleur hauteur ${RANK_NAME[r[0]]}`;
      case 6: return `Full aux ${RANK_NAME_PLURAL[r[0]]} par les ${RANK_NAME_PLURAL[r[1]]}`;
      case 7: return `Carré ${de(r[0])}`;
      case 8: return r[0] === 14 ? 'Quinte flush royale' : `Quinte flush au ${RANK_NAME[r[0]]}`;
      default: return CATEGORY_NAMES[ev.cat];
    }
  }

  // Les 5 cartes qui composent la meilleure main (pour les surligner)
  function bestFive(cards) {
    let best = null;
    let bestSet = null;
    const n = cards.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const five = cards.filter((_, i) => i !== a && i !== b);
      if (n === 7) {
        const ev = evaluate(five);
        if (!best || ev.score > best.score) { best = ev; bestSet = five; }
      }
    }
    return bestSet || cards;
  }

  // Probabilité de gagner (Monte-Carlo) : on complète le board et les mains
  // adverses au hasard `iters` fois. Une égalité compte pour une fraction.
  function equity(hole, boardCards, opponents, iters) {
    if (opponents <= 0) return 1;
    const known = new Set([...hole, ...boardCards].map((c) => c.r * 4 + c.s));
    const rest = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) if (!known.has(r * 4 + s)) rest.push({ r, s });
    let wins = 0;
    for (let it = 0; it < iters; it++) {
      // mélange partiel juste ce qu'il faut
      const need = 5 - boardCards.length + opponents * 2;
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(Math.random() * (rest.length - i));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      let k = 0;
      const fullBoard = boardCards.slice();
      while (fullBoard.length < 5) fullBoard.push(rest[k++]);
      const mine = evaluate([...hole, ...fullBoard]).score;
      let best = 0;
      let ties = 0;
      let lost = false;
      for (let o = 0; o < opponents; o++) {
        const sc = evaluate([rest[k++], rest[k++], ...fullBoard]).score;
        if (sc > mine) { lost = true; break; }
        if (sc === mine) ties++;
        best = Math.max(best, sc);
      }
      if (!lost) wins += ties ? 1 / (ties + 1) : 1;
    }
    return wins / iters;
  }

  // Force préflop simplifiée (formule de Chen), ramenée entre 0 et 1
  function preflopStrength(hole) {
    const [a, b] = hole[0].r >= hole[1].r ? hole : [hole[1], hole[0]];
    const base = { 14: 10, 13: 8, 12: 7, 11: 6 };
    let score = base[a.r] || a.r / 2;
    if (a.r === b.r) score = Math.max(5, score * 2);
    if (a.s === b.s) score += 2;
    const gap = a.r - b.r - 1;
    if (a.r !== b.r) {
      if (gap === 1) score -= 1;
      else if (gap === 2) score -= 2;
      else if (gap === 3) score -= 4;
      else if (gap >= 4) score -= 5;
      if (gap <= 1 && a.r < 12) score += 1;
    }
    return Math.max(0, Math.min(1, score / 20));
  }

  /* ================================================================
     Combinaisons (aide-mémoire affiché à côté de la table)
     ================================================================ */
  // key = catégorie de evaluate() (9 = quinte flush royale), prob = chance
  // de la finir avec 7 cartes (2 privées + 5 communes) au Texas Hold'em.
  const c = (r, s) => ({ r, s });
  const COMBOS = [
    { key: 9, name: 'Quinte flush royale', desc: 'A, R, D, V, 10 de la même couleur', prob: '0,003 %', ex: [c(14, 1), c(13, 1), c(12, 1), c(11, 1), c(10, 1)] },
    { key: 8, name: 'Quinte flush', desc: '5 cartes qui se suivent, même couleur', prob: '0,03 %', ex: [c(9, 0), c(8, 0), c(7, 0), c(6, 0), c(5, 0)] },
    { key: 7, name: 'Carré', desc: '4 cartes de même valeur', prob: '0,17 %', ex: [c(12, 0), c(12, 1), c(12, 2), c(12, 3), c(4, 0)] },
    { key: 6, name: 'Full', desc: 'Un brelan + une paire', prob: '2,6 %', ex: [c(10, 0), c(10, 1), c(10, 3), c(7, 2), c(7, 0)] },
    { key: 5, name: 'Couleur', desc: '5 cartes de la même couleur', prob: '3,0 %', ex: [c(14, 2), c(11, 2), c(8, 2), c(6, 2), c(3, 2)] },
    { key: 4, name: 'Quinte (suite)', desc: '5 cartes qui se suivent', prob: '4,6 %', ex: [c(8, 3), c(7, 1), c(6, 0), c(5, 2), c(4, 3)] },
    { key: 3, name: 'Brelan', desc: '3 cartes de même valeur', prob: '4,8 %', ex: [c(7, 0), c(7, 1), c(7, 3), c(13, 2), c(2, 0)] },
    { key: 2, name: 'Double paire', desc: 'Deux paires différentes', prob: '23,5 %', ex: [c(11, 0), c(11, 1), c(4, 3), c(4, 2), c(14, 0)] },
    { key: 1, name: 'Paire', desc: '2 cartes de même valeur', prob: '43,8 %', ex: [c(10, 1), c(10, 3), c(13, 0), c(8, 2), c(3, 0)] },
    { key: 0, name: 'Carte haute', desc: 'Rien : la plus haute carte compte', prob: '17,4 %', ex: [c(14, 0), c(11, 1), c(8, 3), c(5, 2), c(2, 0)] },
  ];

  function miniCardHTML(card) {
    const red = card.s === 1 || card.s === 2 ? ' po-red' : '';
    return `<span class="po-mini${red}">${RANK_LABEL[card.r] || card.r}<i>${SUITS[card.s]}</i></span>`;
  }

  function combosHTML() {
    return `
      <div class="po-combos-title">Combinaisons</div>
      <div class="po-combos-sub">De la plus forte à la plus faible · survolez pour la probabilité</div>
      <ol class="po-combos-list">
        ${COMBOS.map((cb, i) => `
          <li class="po-combo" data-combo="${cb.key}" data-tooltip="${cb.desc} · ${cb.prob} des mains (7 cartes)">
            <span class="po-combo-rank">${i + 1}</span>
            <div class="po-combo-body">
              <span class="po-combo-name">${cb.name}</span>
              <span class="po-combo-desc">${cb.desc}</span>
            </div>
            <div class="po-combo-cards">${cb.ex.map(miniCardHTML).join('')}</div>
          </li>`).join('')}
      </ol>
      <p class="po-combos-note">À égalité de combinaison, la carte la plus haute gagne (l'As est la plus forte, mais compte aussi comme 1 dans la suite A-2-3-4-5).</p>`;
  }

  // Allume la ligne correspondant à la main actuelle du joueur
  function highlightCombo() {
    const p = human();
    let key = null;
    if (p && p.hole.length === 2 && !p.out) {
      if (board.length) {
        const ev = evaluate([...p.hole, ...board]);
        key = ev.cat === 8 && ev.ranks[0] === 14 ? 9 : ev.cat;
      } else {
        key = p.hole[0].r === p.hole[1].r ? 1 : 0;
      }
    }
    document.querySelectorAll('.po-combo').forEach((li) => {
      const mine = key !== null && Number(li.dataset.combo) === key;
      li.classList.toggle('po-combo-mine', mine);
      li.classList.toggle('po-combo-dim', !!(p && p.folded));
    });
  }

  /* ================================================================
     Table / joueurs
     ================================================================ */
  function makeBot(seatIndex) {
    const skins = typeof Skins !== 'undefined' ? Skins.getAll().filter((s) => s.id !== Skins.getCurrentId()) : [];
    const skin = skins.length ? skins[(botNameCursor++) % skins.length] : { id: null, name: `Bot ${seatIndex}` };
    const style = STYLES[Math.floor(Math.random() * STYLES.length)];
    return {
      idx: seatIndex,
      isHuman: false,
      name: skin.name,
      skinId: skin.id,
      style,
      stack: Math.round(buyIn * rand(0.7, 1.4) / bb) * bb,
      hole: [],
      bet: 0,
      total: 0,
      folded: false,
      allIn: false,
      acted: false,
      out: false,
    };
  }

  function seatIn(amount) {
    buyIn = amount;
    bb = Math.max(2, Math.round(amount / 50));
    sb = Math.max(1, Math.floor(bb / 2));
    Wallet.subtract(amount);
    Sfx.chipStack();
    seats = [
      {
        idx: 0,
        isHuman: true,
        name: 'Vous',
        skinId: typeof Skins !== 'undefined' ? Skins.getCurrentId() : null,
        stack: amount,
        hole: [],
        bet: 0,
        total: 0,
        folded: false,
        allIn: false,
        acted: false,
        out: false,
      },
    ];
    for (let i = 1; i < SEAT_COUNT; i++) seats.push(makeBot(i));
    dealerIdx = Math.floor(Math.random() * SEAT_COUNT);
    handNo = 0;
    totalRake = 0;
    document.getElementById('po-buyin').hidden = true;
    renderAll();
    updateInfo();
    startHand();
  }

  function leaveTable() {
    if (!seats.length) return;
    const h = human();
    if (handRunning && !h.folded && street !== 'showdown') {
      // on se couche d'abord : les jetons déjà misés restent dans le pot
      h.folded = true;
      if (humanResolver) humanResolver({ type: 'fold' });
    }
    const back = h.stack;
    if (back > 0) {
      Wallet.add(back);
      Sfx.cashRegister();
    }
    h.stack = 0;
    seats = [];
    handRunning = false;
    street = 'idle';
    board = [];
    document.getElementById('po-buyin').hidden = false;
    renderBuyIn();
    renderAll();
    setMessage(back > 0 ? `Vous quittez la table avec ${fmt(back)} jetons.` : 'Vous quittez la table.');
  }

  /* ================================================================
     Déroulement d'une main
     ================================================================ */
  function activeSeats() {
    return seats.filter((p) => !p.out);
  }

  function nextSeat(from, pred) {
    for (let k = 1; k <= seats.length; k++) {
      const i = (from + k) % seats.length;
      if (pred(seats[i])) return i;
    }
    return -1;
  }

  function put(p, amount) {
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.bet += a;
    p.total += a;
    if (p.stack === 0) p.allIn = true;
    return a;
  }

  function potTotal() {
    return seats.reduce((s, p) => s + p.total, 0);
  }

  async function startHand() {
    if (!seats.length) return;
    // remplace les bots ruinés par de nouveaux venus
    seats.forEach((p, i) => {
      if (!p.isHuman && p.stack <= 0) seats[i] = makeBot(i);
    });
    const h = human();
    if (h.stack <= 0) {
      handRunning = false;
      street = 'idle';
      renderAll();
      setMessage('Vous n\'avez plus de jetons à table. Recavez ou quittez la table.', 'msg-bad');
      document.getElementById('po-next-btn').hidden = true;
      document.getElementById('po-rebuy-btn').hidden = false;
      return;
    }
    document.getElementById('po-next-btn').hidden = true;
    document.getElementById('po-rebuy-btn').hidden = true;

    handRunning = true;
    handNo++;
    if (window.Stats) Stats.round();
    flopSeen = false;
    board = [];
    deck = freshDeck();
    seats.forEach((p) => {
      p.hole = [];
      p.bet = 0;
      p.total = 0;
      p.folded = false;
      p.allIn = false;
      p.acted = false;
      p.out = p.stack <= 0;
      p.lastAction = '';
      p.result = null;
    });
    clearBoardDOM();
    highlightCombo();

    dealerIdx = nextSeat(dealerIdx, (p) => !p.out);
    const playersIn = activeSeats().length;
    // en tête-à-tête, le donneur est petite blinde
    const sbIdx = playersIn === 2 ? dealerIdx : nextSeat(dealerIdx, (p) => !p.out);
    const bbIdx = nextSeat(sbIdx, (p) => !p.out);
    put(seats[sbIdx], sb);
    seats[sbIdx].lastAction = `Petite blinde ${fmt(sb)}`;
    put(seats[bbIdx], bb);
    seats[bbIdx].lastAction = `Grosse blinde ${fmt(bb)}`;
    currentBet = bb;
    minRaise = bb;
    street = 'preflop';
    Sfx.chip();
    renderAll();
    updateInfo();
    setMessage(`Main n° ${handNo} : distribution…`);

    // 2 cartes chacun, une par une, en partant de la gauche du donneur
    for (let round = 0; round < 2; round++) {
      let i = dealerIdx;
      for (let k = 0; k < seats.length; k++) {
        i = (i + 1) % seats.length;
        const p = seats[i];
        if (p.out) continue;
        p.hole.push(deck.pop());
        renderHole(p, true);
        if (p.isHuman) highlightCombo();
        Sfx.cardSlide();
        await sleep(110);
      }
    }
    await sleep(250);

    const firstToAct = nextSeat(bbIdx, (p) => !p.out);
    await bettingRound(firstToAct);
    await afterRound();
  }

  async function afterRound() {
    if (!seats.length) return;
    const contenders = seats.filter((p) => !p.out && !p.folded);
    if (seats.some((p) => p.bet > 0)) {
      collectBetsAnimation(); // les mises glissent vers le pot
      Sfx.chipsSweep();
      await sleep(320);
    }
    if (contenders.length === 1) {
      await awardUncontested(contenders[0]);
      return;
    }
    const canAct = contenders.filter((p) => !p.allIn);
    const runOut = canAct.length <= 1;

    if (street === 'river') {
      await showdown();
      return;
    }
    // carte(s) suivante(s)
    const nextStreet = { preflop: 'flop', flop: 'turn', turn: 'river' }[street];
    street = nextStreet;
    if (street === 'flop') flopSeen = true;
    deck.pop(); // carte brûlée
    const n = street === 'flop' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      board.push(deck.pop());
      renderBoard(true);
      highlightCombo();
      Sfx.cardFlip();
      await sleep(runOut ? 420 : 260);
    }
    seats.forEach((p) => {
      p.bet = 0;
      p.acted = false;
      if (!p.folded && !p.allIn) p.lastAction = '';
    });
    currentBet = 0;
    minRaise = bb;
    renderAll();
    updateInfo();

    if (runOut) {
      // tout le monde (ou presque) est à tapis : on déroule le board
      if (street !== 'river') await sleep(500);
      await afterRound();
      return;
    }
    const first = nextSeat(dealerIdx, (p) => !p.out && !p.folded && !p.allIn);
    await bettingRound(first);
    await afterRound();
  }

  function needsToAct(p) {
    return !p.out && !p.folded && !p.allIn && (!p.acted || p.bet < currentBet);
  }

  async function bettingRound(firstIdx) {
    let idx = firstIdx;
    let guard = 0;
    while (seats.length && guard++ < 200) {
      const live = seats.filter((p) => !p.out && !p.folded);
      if (live.length <= 1) return;
      if (!seats.some(needsToAct)) return;
      if (idx < 0) return;
      const p = seats[idx];
      if (needsToAct(p)) {
        highlightTurn(p);
        const action = p.isHuman ? await askHuman(p) : await botDecide(p);
        if (!seats.length) return; // le joueur a quitté la table
        applyAction(p, action);
        renderAll();
        updateInfo();
      }
      idx = nextSeat(idx, (q) => !q.out && !q.folded && !q.allIn);
      if (idx < 0) return;
    }
  }

  function applyAction(p, a) {
    const toCall = currentBet - p.bet;
    if (a.type === 'fold') {
      p.folded = true;
      p.lastAction = 'Se couche';
      foldCardsDOM(p);
      Sfx.whoosh(0.2, 0.08);
    } else if (a.type === 'check') {
      p.lastAction = 'Parole';
      Sfx.knock();
    } else if (a.type === 'call') {
      const paid = put(p, toCall);
      p.lastAction = p.allIn ? `Tapis ${fmt(p.bet)}` : `Suit ${fmt(paid)}`;
      Sfx.chip();
    } else if (a.type === 'raise') {
      const target = Math.min(a.to, p.bet + p.stack);
      put(p, target - p.bet);
      const raiseSize = p.bet - currentBet;
      if (raiseSize >= minRaise) minRaise = raiseSize;
      if (p.bet > currentBet) {
        currentBet = p.bet;
        seats.forEach((q) => {
          if (q !== p && !q.folded && !q.allIn) q.acted = false;
        });
      }
      p.lastAction = p.allIn ? `Tapis ${fmt(p.bet)}` : (toCall > 0 ? `Relance à ${fmt(p.bet)}` : `Mise ${fmt(p.bet)}`);
      Sfx.chipStack();
    }
    p.acted = true;
  }

  /* ---------------- Bots ---------------- */
  async function botDecide(p) {
    await sleep(rand(550, 1150) * (human().folded ? 0.45 : 1));
    const st = p.style;
    const toCall = currentBet - p.bet;
    const pot = potTotal();
    const opponents = seats.filter((q) => q !== p && !q.out && !q.folded).length;
    const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

    let strength;
    if (street === 'preflop') {
      // équité approximative à partir de la force préflop et du nombre d'adversaires
      const chen = preflopStrength(p.hole);
      strength = Math.min(0.95, chen * 1.25 / Math.sqrt(opponents) + 0.05);
    } else {
      strength = equity(p.hole, board, opponents, 220);
    }
    const fair = 1 / (opponents + 1); // part "normale" d'une main moyenne
    const confidence = strength / fair; // > 1 = mieux que la moyenne
    const r = Math.random();
    const potSizedRaise = (mult) => {
      const size = Math.max(minRaise, Math.round((pot + toCall) * mult / bb) * bb);
      return { type: 'raise', to: currentBet + size };
    };

    // gros jeu : relance (parfois tapis avec un monstre)
    if (confidence > 1.9 - st.aggr * 0.5 && strength > 0.45) {
      if (strength > 0.82 && r < 0.25) return { type: 'raise', to: p.bet + p.stack };
      if (r < 0.35 + st.aggr * 0.55) return potSizedRaise(rand(0.5, 1));
      return toCall > 0 ? { type: 'call' } : { type: 'check' };
    }
    // bluff de temps en temps (plus souvent quand personne n'a misé)
    if (r < st.bluff * (toCall === 0 ? 1.6 : 0.7) && p.stack > bb * 4) {
      return potSizedRaise(rand(0.4, 0.75));
    }
    if (toCall === 0) {
      if (confidence > 1.25 && r < st.aggr * 0.6) return potSizedRaise(rand(0.35, 0.6));
      return { type: 'check' };
    }
    // suivre si les chances battent les cotes du pot (avec une marge selon le style)
    const margin = (st.tight - 0.5) * 0.12;
    const cheap = toCall <= bb && street === 'preflop';
    if (strength > potOdds + margin || (cheap && confidence > 0.8 - (0.6 - st.tight) * 0.5)) {
      if (toCall >= p.stack && strength < 0.5 && confidence < 1.6) return { type: 'fold' };
      return { type: 'call' };
    }
    return { type: 'fold' };
  }

  /* ---------------- Joueur humain ---------------- */
  function askHuman(p) {
    return new Promise((resolve) => {
      humanResolver = (action) => {
        humanResolver = null;
        showActionBar(false);
        resolve(action);
      };
      showActionBar(true, p);
      setMessage(currentBet - p.bet > 0 ? `À vous : ${fmt(currentBet - p.bet)} pour suivre.` : 'À vous de parler.');
      Sfx.select();
      refreshHelp(true);
    });
  }

  function raiseBounds(p) {
    const toCall = currentBet - p.bet;
    const maxTo = p.bet + p.stack;
    const minTo = Math.min(maxTo, currentBet + Math.max(minRaise, bb));
    return { toCall, minTo, maxTo };
  }

  function showActionBar(show, p) {
    const bar = document.getElementById('po-actions');
    bar.classList.toggle('po-actions-on', !!show);
    bar.querySelectorAll('button, input').forEach((el) => (el.disabled = !show));
    if (!show || !p) return;
    const { toCall, minTo, maxTo } = raiseBounds(p);
    const callBtn = document.getElementById('po-call-btn');
    if (toCall <= 0) callBtn.textContent = 'Parole';
    else if (toCall >= p.stack) callBtn.textContent = `Tapis ${fmt(p.stack)}`;
    else callBtn.textContent = `Suivre ${fmt(toCall)}`;
    const slider = document.getElementById('po-raise-slider');
    const canRaise = maxTo > currentBet && seats.some((q) => q !== p && !q.folded && !q.out && !q.allIn);
    document.getElementById('po-raise-group').classList.toggle('po-disabled', !canRaise);
    bar.querySelectorAll('#po-raise-group button, #po-raise-group input').forEach((el) => (el.disabled = !canRaise));
    slider.min = minTo;
    slider.max = maxTo;
    slider.step = 1;
    slider.value = minTo;
    updateRaiseLabel();
  }

  function updateRaiseLabel() {
    const slider = document.getElementById('po-raise-slider');
    const btn = document.getElementById('po-raise-btn');
    const v = Number(slider.value);
    const p = human();
    const allIn = p && v >= p.bet + p.stack;
    btn.textContent = allIn ? `Tapis ${fmt(v)}` : (currentBet > 0 ? `Relancer à ${fmt(v)}` : `Miser ${fmt(v)}`);
  }

  function setRaisePreset(kind) {
    const p = human();
    if (!p) return;
    const { minTo, maxTo } = raiseBounds(p);
    const pot = potTotal() + (currentBet - p.bet);
    let v = minTo;
    if (kind === 'half') v = currentBet + Math.round(pot / 2);
    if (kind === 'pot') v = currentBet + pot;
    if (kind === 'allin') v = maxTo;
    v = Math.max(minTo, Math.min(maxTo, v));
    document.getElementById('po-raise-slider').value = v;
    updateRaiseLabel();
    Sfx.click();
  }

  /* ---------------- Aide (pédagogique) ---------------- */
  function refreshHelp(isHumanTurn) {
    highlightCombo();
    const box = document.getElementById('po-help');
    if (!box) return;
    box.hidden = !helpOn;
    const p = human();
    if (!helpOn || !p || !p.hole.length || p.folded || p.out) {
      box.innerHTML = helpOn ? '<div class="po-help-line">L\'aide s\'affiche quand vous avez des cartes en main.</div>' : '';
      return;
    }
    const opp = seats.filter((q) => q !== p && !q.out && !q.folded).length;
    const eq = equity(p.hole, board, opp, 500);
    const toCall = currentBet - p.bet;
    const pot = potTotal();
    const odds = toCall > 0 ? toCall / (pot + toCall) : 0;
    const made = board.length ? handName(evaluate([...p.hole, ...board])) : (p.hole[0].r === p.hole[1].r ? `Paire servie ${p.hole[0].r === 14 ? "d'As" : `de ${RANK_NAME_PLURAL[p.hole[0].r]}`}` : 'Deux cartes');
    let advice = '';
    if (isHumanTurn && toCall > 0) {
      advice = eq > odds
        ? 'Chances > cotes du pot : suivre est rentable à long terme.'
        : 'Chances < cotes du pot : suivre perd de l\'argent à long terme.';
    }
    box.innerHTML = `
      <div class="po-help-row"><span>Votre main</span><b>${made}</b></div>
      <div class="po-help-row"><span>Chances de gagner</span><b>${Math.round(eq * 100)} %</b></div>
      <div class="po-help-bar" data-tooltip="Le trait = part moyenne d'une main au hasard contre ${opp} adversaire${opp > 1 ? 's' : ''} (${Math.round(100 / (opp + 1))} %)"><span style="width:${Math.round(eq * 100)}%"></span><i style="left:${Math.round(100 / (opp + 1))}%"></i></div>
      ${toCall > 0 ? `<div class="po-help-row"><span>Cotes du pot</span><b>${Math.round(odds * 100)} %</b></div>` : ''}
      ${advice ? `<div class="po-help-advice">${advice}</div>` : ''}`;
  }

  /* ---------------- Fin de main ---------------- */
  function takeRake(amount) {
    if (!flopSeen) return 0;
    const rake = Math.min(Math.floor(amount * RAKE_RATE), RAKE_CAP_BB * bb);
    totalRake += rake;
    return rake;
  }

  async function awardUncontested(winner) {
    street = 'showdown';
    const pot = potTotal();
    const rake = takeRake(pot);
    winner.stack += pot - rake;
    winner.result = `+${fmt(pot - rake)}`;
    seats.forEach((p) => { p.total = 0; p.bet = 0; });
    renderAll();
    updateInfo(rake);
    flashWinner(winner);
    if (winner.isHuman) Sfx.win(1);
    setMessage(`${winner.isHuman ? 'Vous remportez' : `${winner.name} remporte`} ${fmt(pot - rake)} jetons (tout le monde s'est couché)${rake ? ` · commission du casino : ${fmt(rake)}` : ''}.`, winner.isHuman ? 'msg-good' : '');
    endHand();
  }

  async function showdown() {
    street = 'showdown';
    const contenders = seats.filter((p) => !p.out && !p.folded);
    // on retourne les cartes des bots encore en jeu
    for (const p of contenders) {
      if (!p.isHuman) {
        revealHole(p);
        Sfx.cardFlip();
        await sleep(300);
      }
      p.eval = evaluate([...p.hole, ...board]);
      p.lastAction = handName(p.eval);
    }
    renderAll();

    // pots (principal + annexes)
    const levels = [...new Set(contenders.map((p) => p.total))].sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    levels.forEach((lvl, i) => {
      const cap = i === levels.length - 1 ? Infinity : lvl;
      let amount = 0;
      seats.forEach((p) => {
        amount += Math.max(0, Math.min(p.total, cap) - Math.min(p.total, prev));
      });
      const eligible = contenders.filter((p) => p.total >= lvl);
      if (amount > 0) pots.push({ amount, eligible });
      prev = lvl;
    });
    const rake = takeRake(pots.reduce((s, x) => s + x.amount, 0));
    if (pots.length) pots[0].amount -= rake;

    const gains = new Map();
    const winnersAll = new Set();
    pots.forEach((pot) => {
      const best = Math.max(...pot.eligible.map((p) => p.eval.score));
      const winners = pot.eligible.filter((p) => p.eval.score === best);
      const share = Math.floor(pot.amount / winners.length);
      let rest = pot.amount - share * winners.length;
      winners.forEach((w) => {
        let g = share;
        if (rest > 0) { g++; rest--; }
        w.stack += g;
        gains.set(w, (gains.get(w) || 0) + g);
        winnersAll.add(w);
      });
    });
    seats.forEach((p) => { p.total = 0; p.bet = 0; });
    winnersAll.forEach((w) => {
      w.result = `+${fmt(gains.get(w))}`;
      flashWinner(w);
      highlightBest(w);
    });
    renderAll();
    updateInfo(rake);

    const h = human();
    const humanWon = winnersAll.has(h);
    const names = [...winnersAll].map((w) => (w.isHuman ? 'Vous' : w.name)).join(' et ');
    const best = [...winnersAll][0];
    if (humanWon) {
      const g = gains.get(h);
      Sfx.win(g >= buyIn * 0.5 ? 3 : g >= bb * 10 ? 2 : 1);
    }
    else if (!h.folded) Sfx.lose();
    setMessage(`${names} ${winnersAll.size > 1 ? 'se partagent' : (humanWon ? 'gagnez' : 'gagne')} avec ${handName(best.eval)}${rake ? ` · commission du casino : ${fmt(rake)}` : ''}.`, humanWon ? 'msg-good' : (h.folded ? '' : 'msg-bad'));
    endHand();
  }

  function endHand() {
    handRunning = false;
    refreshHelp(false);
    const h = human();
    if (!h) return;
    if (h.stack <= 0) {
      document.getElementById('po-rebuy-btn').hidden = false;
      setMessage('Plus de jetons à table ! Recavez pour continuer ou quittez la table.', 'msg-bad');
    } else {
      document.getElementById('po-next-btn').hidden = false;
    }
  }

  function rebuy() {
    const h = human();
    if (!h) return;
    if (!Wallet.canAfford(buyIn)) {
      setMessage('Solde insuffisant pour recaver. Quittez la table et rechargez.', 'msg-warn');
      Sfx.denied();
      return;
    }
    Wallet.subtract(buyIn);
    h.stack += buyIn;
    Sfx.chipStack();
    renderAll();
    startHand();
  }

  /* ================================================================
     Rendu
     ================================================================ */
  function cardHTML(c, extra) {
    const red = c.s === 1 || c.s === 2 ? ' po-red' : '';
    const label = RANK_LABEL[c.r] || c.r;
    return `<div class="po-card${red}${extra || ''}" data-card="${c.r}-${c.s}">
      <span class="po-card-rank">${label}</span><span class="po-card-suit">${SUITS[c.s]}</span>
      <span class="po-card-big">${SUITS[c.s]}</span>
    </div>`;
  }

  function backHTML(extra) {
    return `<div class="po-card po-card-back${extra || ''}"></div>`;
  }

  function seatEl(p) {
    return document.querySelector(`.po-seat[data-seat="${p.idx}"]`);
  }

  function renderHole(p, animateLast) {
    const el = seatEl(p);
    if (!el) return;
    const holeEl = el.querySelector('.po-hole');
    holeEl.innerHTML = p.hole
      .map((c, i) => {
        const anim = animateLast && i === p.hole.length - 1 ? ' po-deal-in' : '';
        return p.isHuman ? cardHTML(c, anim) : backHTML(anim);
      })
      .join('');
  }

  function revealHole(p) {
    const el = seatEl(p);
    if (!el) return;
    el.querySelector('.po-hole').innerHTML = p.hole.map((c) => cardHTML(c, ' po-flip-in')).join('');
  }

  function foldCardsDOM(p) {
    const el = seatEl(p);
    if (el) el.querySelectorAll('.po-hole .po-card').forEach((c) => c.classList.add('po-folded-card'));
  }

  function clearBoardDOM() {
    const b = document.getElementById('po-board');
    if (b) b.innerHTML = '';
    document.querySelectorAll('.po-hole').forEach((h) => (h.innerHTML = ''));
    document.querySelectorAll('.po-seat').forEach((s) => s.classList.remove('po-winner'));
  }

  function renderBoard(animateLast) {
    const b = document.getElementById('po-board');
    if (!b) return;
    b.innerHTML = board.map((c, i) => cardHTML(c, animateLast && i === board.length - 1 ? ' po-flip-in' : '')).join('');
  }

  function highlightBest(w) {
    const five = bestFive([...w.hole, ...board]);
    const keys = new Set(five.map((c) => `${c.r}-${c.s}`));
    document.querySelectorAll('#po-board .po-card').forEach((el) => el.classList.toggle('po-best', keys.has(el.dataset.card)));
    const el = seatEl(w);
    if (el) el.querySelectorAll('.po-hole .po-card').forEach((c) => c.classList.toggle('po-best', keys.has(c.dataset.card)));
  }

  function flashWinner(w) {
    const el = seatEl(w);
    if (!el) return;
    el.classList.remove('po-winner');
    void el.offsetWidth;
    el.classList.add('po-winner');
  }

  function highlightTurn(p) {
    document.querySelectorAll('.po-seat').forEach((s) => s.classList.toggle('po-turn', Number(s.dataset.seat) === p.idx));
  }

  function collectBetsAnimation() {
    document.querySelectorAll('.po-bet').forEach((b) => {
      if (b.classList.contains('show')) b.classList.add('po-bet-collect');
    });
  }

  function renderAll() {
    const tableEl = document.getElementById('po-table');
    if (!tableEl) return;
    tableEl.classList.toggle('po-empty', seats.length === 0);
    for (let i = 0; i < SEAT_COUNT; i++) {
      const el = document.querySelector(`.po-seat[data-seat="${i}"]`);
      const p = seats[i];
      if (!el) continue;
      if (!p) {
        el.classList.add('po-seat-empty');
        continue;
      }
      el.classList.remove('po-seat-empty');
      el.classList.toggle('po-folded', p.folded);
      el.classList.toggle('po-out', p.out);
      el.classList.toggle('po-allin', p.allIn && !p.folded);
      const avatar = el.querySelector('.po-avatar');
      if (p.skinId && typeof Skins !== 'undefined') avatar.style.backgroundImage = `url('${Skins.urlFor(p.skinId, SKIN_ROOT_PREFIX)}')`;
      el.querySelector('.po-name').textContent = p.name;
      el.querySelector('.po-style').textContent = p.isHuman ? '' : p.style.label;
      el.querySelector('.po-stack').innerHTML = `${fmt(p.stack)} ${coin()}`;
      const act = el.querySelector('.po-action');
      act.textContent = p.result || p.lastAction || '';
      act.classList.toggle('show', !!(p.result || p.lastAction));
      act.classList.toggle('po-action-win', !!p.result);
      el.querySelector('.po-dealer').classList.toggle('show', i === dealerIdx && street !== 'idle');
      const bet = el.querySelector('.po-bet');
      bet.classList.remove('po-bet-collect');
      bet.classList.toggle('show', p.bet > 0);
      bet.querySelector('span').textContent = p.bet > 0 ? fmt(p.bet) : '';
    }
    const potEl = document.getElementById('po-pot');
    if (potEl) {
      const pot = potTotal();
      potEl.innerHTML = pot > 0 ? `Pot : ${fmt(pot)} ${coin()}` : '';
      potEl.classList.toggle('show', pot > 0);
    }
    const streetEl = document.getElementById('po-street');
    if (streetEl) streetEl.textContent = { idle: '', preflop: 'Préflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Abattage' }[street] || '';
  }

  function updateInfo(lastRake) {
    const info = document.getElementById('po-info');
    if (!info) return;
    if (!seats.length) {
      info.innerHTML = '';
      return;
    }
    info.innerHTML = `
      <div class="po-stat"><span class="po-stat-label">Blindes</span><span class="po-stat-value">${fmt(sb)} / ${fmt(bb)}</span></div>
      <div class="po-stat"><span class="po-stat-label">Main</span><span class="po-stat-value">n° ${handNo}</span></div>
      <div class="po-stat" data-tooltip="5 % de chaque pot (max ${RAKE_CAP_BB} grosses blindes), seulement si le flop est servi"><span class="po-stat-label">Commission casino</span><span class="po-stat-value">${fmt(totalRake)} ${coin()}${lastRake ? ` <small>(+${fmt(lastRake)})</small>` : ''}</span></div>`;
  }

  function setMessage(msg, cls) {
    const el = document.getElementById('po-message');
    if (!el) return;
    el.textContent = msg;
    el.className = 'game-msg po-message' + (cls ? ' ' + cls : '');
  }

  function renderBuyIn() {
    const box = document.getElementById('po-buyin-options');
    if (!box) return;
    box.innerHTML = BUY_INS.map((amount) => {
      const big = Math.max(2, Math.round(amount / 50));
      const ok = Wallet.canAfford(amount);
      return `<button type="button" class="po-buyin-btn" data-amount="${amount}" ${ok ? '' : 'disabled'}>
        <span class="po-buyin-amount">${fmt(amount)} ${coin()}</span>
        <span class="po-buyin-blinds">Blindes ${fmt(Math.max(1, Math.floor(big / 2)))} / ${fmt(big)}</span>
      </button>`;
    }).join('');
    box.querySelectorAll('.po-buyin-btn').forEach((btn) => btn.addEventListener('click', () => seatIn(Number(btn.dataset.amount))));
  }

  /* ================================================================
     Construction de la page
     ================================================================ */
  function seatHTML(i) {
    return `
      <div class="po-seat po-seat-${i}" data-seat="${i}">
        <div class="po-bet"><span></span></div>
        <div class="po-hole"></div>
        <div class="po-plate">
          <div class="po-avatar"></div>
          <div class="po-plate-text">
            <div class="po-name"></div>
            <div class="po-stack"></div>
            <div class="po-style"></div>
          </div>
          <div class="po-dealer">D</div>
        </div>
        <div class="po-action"></div>
      </div>`;
  }

  function init() {
    const container = document.querySelector('#poker .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="po-wrap">
        <div class="po-left">
          <div class="po-topline" id="po-info"></div>

          <div class="po-stage" id="po-stage">
            <div class="po-table po-empty" id="po-table">
              <div class="po-felt">
                <div class="po-felt-logo">Croissantage Hold'em</div>
                <div class="po-street" id="po-street"></div>
                <div class="po-pot" id="po-pot"></div>
                <div class="po-board" id="po-board"></div>
              </div>
              ${Array.from({ length: SEAT_COUNT }, (_, i) => seatHTML(i)).join('')}

              <div class="po-buyin" id="po-buyin">
                <div class="po-buyin-box">
                  <div class="po-buyin-title">Prendre place à la table</div>
                  <p class="po-buyin-text">Choisissez votre cave : ces jetons sont retirés de votre solde et vous sont rendus quand vous quittez la table.</p>
                  <div class="po-buyin-options" id="po-buyin-options"></div>
                </div>
              </div>
            </div>
          </div>

          <p id="po-message" class="game-msg po-message">Choisissez une cave pour vous asseoir.</p>

          <div class="po-actions" id="po-actions">
            <button type="button" class="po-btn po-fold" id="po-fold-btn" disabled>Se coucher</button>
            <button type="button" class="po-btn po-call" id="po-call-btn" disabled>Parole</button>
            <div class="po-raise-group" id="po-raise-group">
              <div class="po-presets">
                <button type="button" class="po-preset" data-preset="min" disabled>Min</button>
                <button type="button" class="po-preset" data-preset="half" disabled>½ pot</button>
                <button type="button" class="po-preset" data-preset="pot" disabled>Pot</button>
                <button type="button" class="po-preset" data-preset="allin" disabled>Tapis</button>
              </div>
              <input type="range" class="po-slider" id="po-raise-slider" min="0" max="0" value="0" disabled>
              <button type="button" class="po-btn po-raise" id="po-raise-btn" disabled>Relancer</button>
            </div>
          </div>
        </div>

        <div class="po-right">
          <aside class="po-combos" id="po-combos" aria-label="Combinaisons du poker">
            <div class="po-combos-inner" id="po-combos-inner">${combosHTML()}</div>
          </aside>

          <div class="po-side">
            <div class="po-help-head">
              <span>Aide</span>
              <label class="po-switch"><input type="checkbox" id="po-help-toggle" checked><span></span></label>
            </div>
            <div class="po-help" id="po-help"></div>
            <div class="po-side-buttons">
              <button type="button" class="po-btn po-next" id="po-next-btn" hidden>Main suivante</button>
              <button type="button" class="po-btn po-next" id="po-rebuy-btn" hidden>Recaver</button>
              <button type="button" class="po-btn po-leave" id="po-leave-btn">Quitter la table</button>
            </div>
          </div>
        </div>
      </div>`;

    bindEvents(container);
    renderBuyIn();
    renderAll();
    refreshHelp(false);
    Wallet.refreshUI();
    fitLayout();
    window.addEventListener('resize', fitLayout);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(fitLayout);
      ro.observe(document.getElementById('po-stage'));
      ro.observe(document.getElementById('po-combos')); // l'aide change de hauteur -> on recalcule
    }
  }

  /* ---------------- Tout tient dans la fenêtre (aucun scroll) ----------------
     La table est dessinée à une taille de référence fixe (TABLE_W x TABLE_H)
     puis mise à l'échelle pour remplir la place disponible, comme une image :
     sièges, cartes et jetons gardent toujours les mêmes proportions.
     Le panneau des combinaisons rétrécit de la même façon s'il manque de
     hauteur. */
  const TABLE_W = 1000;
  const TABLE_H = 520;

  function fitLayout() {
    const stage = document.getElementById('po-stage');
    const table = document.getElementById('po-table');
    if (stage && table) {
      const s = Math.max(0.3, Math.min(stage.clientWidth / TABLE_W, stage.clientHeight / TABLE_H));
      table.style.transform = `scale(${s})`;
      table.style.left = `${Math.round((stage.clientWidth - TABLE_W * s) / 2)}px`;
      table.style.top = `${Math.round((stage.clientHeight - TABLE_H * s) / 2)}px`;
    }
    const box = document.getElementById('po-combos');
    const inner = document.getElementById('po-combos-inner');
    if (box && inner) {
      inner.style.transform = 'none';
      // rétrécit si ça déborde, grossit un peu (max x1.25) s'il reste de la place
      const s = Math.min(1.25, (box.clientHeight - 2) / inner.scrollHeight);
      inner.style.transform = `scale(${s})`;
      inner.style.width = `${100 / s}%`;
    }
  }

  function bindEvents(container) {
    container.querySelector('#po-fold-btn').addEventListener('click', () => humanResolver && humanResolver({ type: 'fold' }));
    container.querySelector('#po-call-btn').addEventListener('click', () => {
      if (!humanResolver) return;
      const p = human();
      humanResolver(currentBet - p.bet > 0 ? { type: 'call' } : { type: 'check' });
    });
    container.querySelector('#po-raise-btn').addEventListener('click', () => {
      if (!humanResolver) return;
      humanResolver({ type: 'raise', to: Number(document.getElementById('po-raise-slider').value) });
    });
    container.querySelector('#po-raise-slider').addEventListener('input', updateRaiseLabel);
    container.querySelectorAll('.po-preset').forEach((b) => b.addEventListener('click', () => setRaisePreset(b.dataset.preset)));
    container.querySelector('#po-next-btn').addEventListener('click', () => {
      Sfx.click();
      startHand();
    });
    container.querySelector('#po-rebuy-btn').addEventListener('click', rebuy);
    container.querySelector('#po-leave-btn').addEventListener('click', leaveTable);
    container.querySelector('#po-help-toggle').addEventListener('change', (e) => {
      helpOn = e.target.checked;
      refreshHelp(!!humanResolver);
    });
    Wallet.onChange(() => {
      if (!seats.length) renderBuyIn();
    });
    // filet de sécurité : si on quitte la page en étant assis, les jetons
    // à table retournent dans le solde
    window.addEventListener('pagehide', () => {
      const h = human();
      if (h && h.stack > 0) {
        Wallet.add(h.stack);
        h.stack = 0;
      }
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Poker.init());
