/* atm.js — Distributeur (ATM) du lobby : relevé de compte du joueur.
   On y entre en marchant contre un des distributeurs du lobby, comme on
   entre dans une maison. Toutes les données viennent de core/stats.js
   (mises, gains, parties, records, bar, recharges, temps de jeu) et de
   Wallet / Skins / Drunk.

   Pédagogie : pour chaque jeu on compare le RETOUR RÉEL (récupéré / misé)
   au RETOUR THÉORIQUE du jeu. Sur peu de parties, le réel part dans tous
   les sens ; plus on joue, plus il se rapproche du théorique (loi des
   grands nombres) : c'est ce qui garantit les gains du casino.
*/
const Atm = (() => {
  const SKIN_ROOT_PREFIX = '../../';

  // rtp = retour théorique au joueur (en %), null = pas de valeur simple
  const GAMES = [
    { id: 'roulette', name: 'Roulette', rtp: 97.3, note: 'roulette européenne (un seul zéro)' },
    { id: 'blackjack', name: 'Blackjack', rtp: 99.4, note: 'en jouant la stratégie de base' },
    { id: 'baccara', name: 'Baccara', rtp: 98.9, note: 'mise Banquier' },
    { id: 'columbus', name: 'Machine à sous', rtp: null, note: 'dépend des réglages des rouleaux' },
    { id: 'poker', name: 'Poker', rtp: null, note: 'la maison prend 5 % des pots' },
    { id: 'craps', name: 'Craps', rtp: 98.6, note: 'Pass Line' },
    { id: 'fusee', name: 'Fusée', rtp: 99, note: '' },
    { id: 'mine', name: 'Mines', rtp: 99, note: '' },
    { id: 'chicken', name: 'Chicken Grill', rtp: 97, note: '' },
    { id: 'plinko', name: 'Plinko', rtp: 99, note: 'environ, selon les tables' },
  ];
  const BEST_MULT_GAMES = [
    { id: 'fusee', label: 'Fusée' },
    { id: 'mine', label: 'Mines' },
    { id: 'chicken', label: 'Chicken Grill' },
    { id: 'plinko', label: 'Plinko' },
  ];

  let built = false;
  let resetArmed = false;

  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
  const coin = () => '<span class="coin-icon" aria-hidden="true"></span>';

  function duration(ms) {
    const min = Math.floor(ms / 60000);
    const h = Math.floor(min / 60);
    if (h > 0) return `${h} h ${String(min % 60).padStart(2, '0')}`;
    if (min > 0) return `${min} min`;
    return `${Math.floor(ms / 1000)} s`;
  }

  function signed(n) {
    if (n > 0) return `+${fmt(n)}`;
    if (n < 0) return `−${fmt(-n)}`;
    return '0';
  }

  /* ---------------- Calculs ---------------- */
  function compute() {
    const st = Stats.get();
    const games = GAMES.map((g) => {
      const e = st.games[g.id] || { rounds: 0, wagered: 0, returned: 0, biggestWin: 0, bestMult: 0 };
      return { ...g, ...e, net: e.returned - e.wagered, real: e.wagered > 0 ? (e.returned / e.wagered) * 100 : null };
    });
    const totals = games.reduce(
      (t, g) => {
        t.rounds += g.rounds;
        t.wagered += g.wagered;
        t.returned += g.returned;
        t.biggest = Math.max(t.biggest, g.biggestWin);
        return t;
      },
      { rounds: 0, wagered: 0, returned: 0, biggest: 0 }
    );
    totals.net = totals.returned - totals.wagered;
    const played = games.filter((g) => g.rounds > 0);
    const favorite = played.sort((a, b) => b.rounds - a.rounds)[0] || null;
    const barEntry = st.games.bar || { wagered: 0, returned: 0 };
    return { st, games: GAMES.map((g) => games.find((x) => x.id === g.id)), totals, favorite, barSpent: barEntry.wagered - barEntry.returned };
  }

  /* ---------------- Rendu ---------------- */
  function kpi(label, value, cls, tip) {
    return `<div class="atm-kpi ${cls || ''}"${tip ? ` data-tooltip="${tip}"` : ''}>
      <span class="atm-kpi-label">${label}</span>
      <span class="atm-kpi-value">${value}</span>
    </div>`;
  }

  function gameRow(g) {
    if (!g.rounds && !g.wagered) {
      return `<tr class="atm-row-empty"><td>${g.name}</td><td colspan="5">pas encore joué</td><td>${g.rtp ? `${g.rtp.toLocaleString('fr-FR')} %` : '—'}</td></tr>`;
    }
    const real = g.real === null ? '—' : `${g.real.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
    const vs = g.real !== null && g.rtp ? (g.real >= g.rtp ? 'atm-good' : 'atm-bad') : '';
    return `<tr>
      <td>${g.name}</td>
      <td>${fmt(g.rounds)}</td>
      <td>${fmt(g.wagered)}</td>
      <td>${fmt(g.returned)}</td>
      <td class="${g.net > 0 ? 'atm-good' : g.net < 0 ? 'atm-bad' : ''}">${signed(g.net)}</td>
      <td class="${vs}">${real}</td>
      <td data-tooltip="${g.note || ''}">${g.rtp ? `${g.rtp.toLocaleString('fr-FR')} %` : '—'}</td>
    </tr>`;
  }

  function render() {
    const { st, games, totals, favorite, barSpent } = compute();
    const screen = document.getElementById('atm-screen-content');
    if (!screen) return;

    const skinName = typeof Skins !== 'undefined' ? Skins.getSkinById(Skins.getCurrentId()).name : 'Joueur';
    const skinUrl = typeof Skins !== 'undefined' ? Skins.urlFor(Skins.getCurrentId(), SKIN_ROOT_PREFIX) : '';
    const owned = typeof Skins !== 'undefined' ? `${Skins.getOwnedIds().length}/${Skins.getAll().length}` : '—';
    const drunk = typeof Drunk !== 'undefined' ? Drunk.stateLabel(Drunk.getLevel()) : '—';
    const since = new Date(st.firstSeen).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const realTotal = totals.wagered > 0 ? (totals.returned / totals.wagered) * 100 : null;

    const records = BEST_MULT_GAMES.map((b) => {
      const e = st.games[b.id];
      const v = e && e.bestMult ? `${e.bestMult.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}×` : '—';
      return `<li><span>${b.label}</span><b>${v}</b></li>`;
    }).join('');

    screen.innerHTML = `
      <div class="atm-head">
        <div class="atm-avatar" style="background-image:url('${skinUrl}')"></div>
        <div class="atm-id">
          <div class="atm-id-name">Titulaire : <b>${skinName}</b></div>
          <div class="atm-id-sub">Client depuis le ${since} · temps de jeu ${duration(st.playMs)}</div>
        </div>
        <div class="atm-bank">RELEVÉ DE COMPTE</div>
      </div>

      <div class="atm-kpis">
        ${kpi('Solde actuel', `${fmt(Wallet.get())} ${coin()}`, 'atm-kpi-main')}
        ${kpi('Bilan des jeux', signed(totals.net), totals.net >= 0 ? 'atm-good' : 'atm-bad', 'Total récupéré moins total misé, tous jeux confondus')}
        ${kpi('Total misé', fmt(totals.wagered))}
        ${kpi('Total récupéré', fmt(totals.returned))}
        ${kpi('Parties jouées', fmt(totals.rounds), '', favorite ? `Jeu préféré : ${favorite.name}` : '')}
        ${kpi('Plus gros gain', fmt(totals.biggest), '', 'Plus grosse somme encaissée en une fois')}
      </div>

      <div class="atm-body">
        <div class="atm-table-wrap">
          <table class="atm-table">
            <thead>
              <tr>
                <th>Jeu</th><th>Parties</th><th>Misé</th><th>Récupéré</th><th>Bilan</th>
                <th data-tooltip="Récupéré ÷ misé : ce que le jeu vous a vraiment rendu">Retour réel</th>
                <th data-tooltip="Ce que le jeu rend en moyenne sur un très grand nombre de parties">Retour théorique</th>
              </tr>
            </thead>
            <tbody>${games.map(gameRow).join('')}</tbody>
            <tfoot>
              <tr>
                <td>Total</td><td>${fmt(totals.rounds)}</td><td>${fmt(totals.wagered)}</td><td>${fmt(totals.returned)}</td>
                <td class="${totals.net > 0 ? 'atm-good' : totals.net < 0 ? 'atm-bad' : ''}">${signed(totals.net)}</td>
                <td>${realTotal === null ? '—' : `${realTotal.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`}</td><td></td>
              </tr>
            </tfoot>
          </table>
          <p class="atm-lesson">Sur peu de parties, le retour réel varie énormément. Plus vous jouez, plus il se rapproche du retour théorique, toujours sous 100 % : c'est la loi des grands nombres, et c'est elle qui fait gagner le casino.</p>
        </div>

        <div class="atm-side">
          <div class="atm-card">
            <div class="atm-card-title">Records de multiplicateur</div>
            <ul class="atm-list">${records}</ul>
          </div>
          <div class="atm-card">
            <div class="atm-card-title">Le bar</div>
            <ul class="atm-list">
              <li><span>Cocktails bus</span><b>${fmt(st.bar.cocktails)}</b></li>
              <li><span>Eaux et cafés</span><b>${fmt(st.bar.remedies)}</b></li>
              <li><span>Caisses ouvertes</span><b>${fmt(st.bar.cases)}</b></li>
              <li><span>Doublons</span><b>${fmt(st.bar.duplicates)}</b></li>
              <li><span>Personnages</span><b>${owned}</b></li>
              <li><span>Dépensé au bar</span><b>${fmt(Math.max(0, barSpent))}</b></li>
              <li><span>État actuel</span><b>${drunk}</b></li>
            </ul>
          </div>
          <div class="atm-card">
            <div class="atm-card-title">Compte</div>
            <ul class="atm-list">
              <li><span>Recharges</span><b>${fmt(st.recharges)}</b></li>
              <li><span>Jetons rechargés</span><b>${fmt(st.recharged)}</b></li>
              <li><span>Solde record</span><b>${fmt(Math.max(st.peakBalance || 0, Wallet.get()))}</b></li>
            </ul>
          </div>
        </div>
      </div>`;
  }

  /* ---------------- Construction ---------------- */
  function keypadHTML() {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''];
    return keys.map((k) => `<span class="atm-key${k ? '' : ' atm-key-blank'}">${k}</span>`).join('');
  }

  function init() {
    const container = document.querySelector('#atm .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `
      <div class="atm-machine">
        <div class="atm-top">
          <span class="atm-logo">CROISSANT BANK</span>
          <span class="atm-led"></span>
        </div>
        <div class="atm-main">
          <div class="atm-screen">
            <div class="atm-screen-content" id="atm-screen-content">
              <div class="atm-boot">Lecture de la carte<span class="atm-dots"></span></div>
            </div>
          </div>
          <div class="atm-panel">
            <div class="atm-slot" title="Fente à carte"><span></span></div>
            <div class="atm-keypad">${keypadHTML()}</div>
            <button type="button" class="atm-btn atm-btn-exit" id="atm-exit">Retirer la carte</button>
            <button type="button" class="atm-btn atm-btn-reset" id="atm-reset">Remettre à zéro</button>
          </div>
        </div>
        <div class="atm-bottom"><span class="atm-cash-slot"></span></div>
      </div>`;

    container.querySelector('#atm-exit').addEventListener('click', () => {
      Sfx.select();
      setTimeout(() => { window.location.href = '../../lobby.html'; }, 220);
    });
    container.querySelector('#atm-reset').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (!resetArmed) {
        resetArmed = true;
        btn.textContent = 'Confirmer la remise à zéro';
        btn.classList.add('atm-armed');
        Sfx.denied();
        setTimeout(() => {
          resetArmed = false;
          btn.textContent = 'Remettre à zéro';
          btn.classList.remove('atm-armed');
        }, 3000);
        return;
      }
      Stats.reset();
      resetArmed = false;
      btn.textContent = 'Remettre à zéro';
      btn.classList.remove('atm-armed');
      Sfx.chipsSweep();
      render();
    });
    container.querySelectorAll('.atm-key:not(.atm-key-blank)').forEach((k) => {
      k.addEventListener('click', () => Sfx.click());
    });

    // petite séquence de "lecture de carte" puis affichage du relevé
    setTimeout(() => {
      Sfx.click();
      render();
      document.getElementById('atm-screen-content').classList.add('atm-on');
    }, 700);
    Wallet.onChange(render);
    Wallet.refreshUI();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Atm.init());
