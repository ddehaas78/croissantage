/* sfx.js — effets sonores partagés par toutes les pages de jeu.
   Aucun fichier audio : tous les sons sont synthétisés en direct avec la
   Web Audio API (oscillateurs + bruit filtré). Avantages : zéro asset à
   charger, et chaque son peut être calé au millième sur l'animation qu'il
   accompagne (durée, hauteur qui monte avec le multiplicateur, etc.).

   Inclure sur une page de jeu, après drunk.js et avant le script du jeu :
     <script src="../../core/sfx.js"></script>        (games/<jeu>/)
     <script src="../../../core/sfx.js"></script>     (games/arcade/<jeu>/)

   Un bouton 🔊/🔇 est ajouté automatiquement dans le bandeau du haut
   (.game-topbar-right). Le choix est persisté en localStorage.

   API principale (toutes les fonctions sont sans danger si l'audio est
   indisponible ou coupé : elles ne font simplement rien) :
     Sfx.click() / Sfx.chip() / Sfx.chipStack() / Sfx.chipsSweep()
     Sfx.cardSlide() / Sfx.cardFlip()
     Sfx.win(level 1..4) / Sfx.winFor(payout, stake) / Sfx.lose() / Sfx.push()
     Sfx.coins(n, spreadSec) / Sfx.cashRegister()
     ...et des sons propres à chaque jeu (roulette, rouleaux, fusée, mines,
     poulet, plinko, bar, caisses) — voir plus bas.

   Petit clin d'œil : plus le joueur est ivre (Drunk), plus les sons
   se désaccordent légèrement.
*/
const Sfx = (() => {
  const STORAGE_KEY = 'croissantage_sfx_muted';
  const MASTER_VOLUME = 0.7;

  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  try { muted = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* tant pis */ }

  /* ---------------- Moteur ---------------- */
  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); // évite la saturation quand tout sonne en même temps
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, () => ac(), { capture: true, passive: true })
  );

  function ready() {
    return !muted && ac() !== null;
  }

  function noise() {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function drunkCents() {
    const level = window.Drunk && typeof Drunk.getLevel === 'function' ? Drunk.getLevel() : 0;
    return level * 3 * (Math.random() - 0.5); // jusqu'à ±150 cents à 100 % d'ivresse
  }

  function m2f(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function envelope(gainNode, t, vol, attack, dur) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  // Oscillateur simple avec enveloppe. t = délai en secondes.
  function tone({ f = 440, f2 = null, type = 'sine', t = 0, d = 0.2, v = 0.2, a = 0.005, lp = null, out = null }) {
    const start = ctx.currentTime + t;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, start);
    if (f2) osc.frequency.exponentialRampToValueAtTime(f2, start + d);
    osc.detune.value = drunkCents();
    envelope(gain, start, v, a, d);
    let node = osc;
    if (lp) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lp;
      node.connect(filter);
      node = filter;
    }
    node.connect(gain).connect(out || master);
    osc.start(start);
    osc.stop(start + d + 0.05);
  }

  // Bruit blanc filtré avec enveloppe (frottements, souffles, explosions...)
  function hiss({ t = 0, d = 0.2, v = 0.2, a = 0.005, type = 'bandpass', f = 1000, f2 = null, q = 1, out = null }) {
    const start = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = noise();
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f, start);
    if (f2) filter.frequency.exponentialRampToValueAtTime(f2, start + d);
    const gain = ctx.createGain();
    envelope(gain, start, v, a, d);
    src.connect(filter).connect(gain).connect(out || master);
    src.start(start, Math.random() * 1.5);
    src.stop(start + d + 0.05);
  }

  // Petite cloche métallique (2 partiels inharmoniques)
  function bell(f, t, v, d) {
    tone({ f, t, d: d || 0.5, v: v || 0.12, type: 'sine' });
    tone({ f: f * 2.76, t, d: (d || 0.5) * 0.5, v: (v || 0.12) * 0.35, type: 'sine' });
  }

  function safe(fn) {
    return (...args) => {
      if (!ready()) return undefined;
      try { return fn(...args); } catch (e) { return undefined; }
    };
  }

  /* ---------------- Sons génériques ---------------- */
  const click = safe(() => {
    tone({ f: 1800, f2: 1200, type: 'triangle', d: 0.04, v: 0.08 });
  });

  const denied = safe(() => {
    tone({ f: 220, type: 'square', d: 0.09, v: 0.06, lp: 900 });
    tone({ f: 180, type: 'square', t: 0.1, d: 0.12, v: 0.06, lp: 900 });
  });

  // Deux jetons en argile qui s'entrechoquent
  const chip = safe(() => {
    const base = 2600 + Math.random() * 500;
    hiss({ d: 0.035, v: 0.35, f: base, q: 6 });
    tone({ f: base * 1.1, type: 'triangle', d: 0.03, v: 0.06 });
    hiss({ t: 0.045, d: 0.03, v: 0.22, f: base * 0.85, q: 6 });
  });

  // Pile de jetons poussée sur le tapis (au moment de valider la mise)
  const chipStack = safe(() => {
    for (let i = 0; i < 5; i++) {
      hiss({ t: i * 0.035 + Math.random() * 0.01, d: 0.03, v: 0.25, f: 2200 + Math.random() * 900, q: 6 });
    }
    hiss({ t: 0, d: 0.18, v: 0.05, f: 900, q: 0.8 }); // frottement sur le feutre
  });

  // Le croupier ramasse / on retire les mises
  const chipsSweep = safe(() => {
    hiss({ d: 0.3, v: 0.08, f: 1400, f2: 600, q: 0.7 });
    for (let i = 0; i < 4; i++) hiss({ t: 0.05 + i * 0.05, d: 0.025, v: 0.18, f: 2400 - i * 200, q: 6 });
  });

  // Carte qui glisse sur le tapis
  const cardSlide = safe(() => {
    hiss({ d: 0.14, v: 0.22, a: 0.01, f: 3200, f2: 1200, q: 0.9 });
    hiss({ t: 0.12, d: 0.03, v: 0.12, f: 1800, q: 2 }); // la carte se pose
  });

  // Carte retournée (petit "snap")
  const cardFlip = safe(() => {
    hiss({ d: 0.05, v: 0.3, f: 4200, q: 1.5, type: 'highpass' });
    tone({ f: 900, f2: 1500, type: 'triangle', d: 0.05, v: 0.05 });
  });

  // Pièces qui tombent en cascade : n pièces réparties sur spread secondes
  const coins = safe((n = 8, spread = 0.6) => {
    for (let i = 0; i < n; i++) {
      const t = (i / n) * spread + Math.random() * 0.05;
      const f = 2600 + Math.random() * 1800;
      tone({ f, t, d: 0.12, v: 0.05, type: 'sine' });
      tone({ f: f * 1.5, t: t + 0.01, d: 0.08, v: 0.025, type: 'sine' });
      hiss({ t, d: 0.02, v: 0.06, f: 6000, type: 'highpass' });
    }
  });

  // "Ka-ching !" de la caisse enregistreuse (encaissement)
  const cashRegister = safe(() => {
    hiss({ d: 0.05, v: 0.25, f: 2000, q: 2 });           // ka-
    tone({ f: 180, f2: 90, type: 'square', d: 0.05, v: 0.05, lp: 1200 });
    bell(m2f(91), 0.07, 0.14, 0.6);                        // -ching (sol)
    bell(m2f(96), 0.11, 0.12, 0.8);                        // (do aigu)
  });

  // Jingle de victoire : 1 = petit gain, 2 = bon gain, 3 = gros gain, 4 = jackpot
  const win = safe((level = 1) => {
    const lvl = Math.max(1, Math.min(4, Math.round(level)));
    const step = lvl >= 3 ? 0.085 : 0.07;
    // Arpège majeur montant (do-mi-sol-do...), plus long selon le niveau
    const phrase = [72, 76, 79, 84, 88, 91, 96].slice(0, 2 + lvl);
    phrase.forEach((m, i) => {
      tone({ f: m2f(m), t: i * step, d: 0.18, v: 0.09, type: 'square', lp: 3500 });
      tone({ f: m2f(m + 12), t: i * step, d: 0.14, v: 0.04, type: 'triangle' });
    });
    const end = phrase.length * step;
    if (lvl >= 2) {
      // accord final tenu
      [60, 64, 67, 72].forEach((m) => tone({ f: m2f(m + (lvl >= 4 ? 12 : 0)), t: end, d: 0.5 + lvl * 0.25, v: 0.05, type: 'sawtooth', lp: 2200, a: 0.02 }));
      bell(m2f(96), end, 0.08, 0.9);
    }
    if (lvl >= 3) {
      // fanfare de cuivres
      [67, 72, 76, 79].forEach((m, i) => tone({ f: m2f(m), t: end + 0.25 + i * 0.12, d: 0.3, v: 0.07, type: 'sawtooth', lp: 1800 }));
    }
    if (lvl >= 4) {
      [72, 76, 79, 84].forEach((m, i) => tone({ f: m2f(m + 5), t: end + 0.8 + i * 0.12, d: 0.4, v: 0.07, type: 'sawtooth', lp: 2200 }));
      [65, 69, 72, 77].forEach((m) => tone({ f: m2f(m), t: end + 1.3, d: 1.4, v: 0.05, type: 'sawtooth', lp: 2000, a: 0.03 }));
    }
    coins([3, 8, 22, 45][lvl - 1], [0.3, 0.6, 1.3, 2.4][lvl - 1]);
  });

  // Choisit le niveau de victoire selon le rapport gain / mise
  function winFor(payout, stake) {
    if (!payout || payout <= 0) return;
    const ratio = stake > 0 ? payout / stake : 2;
    if (ratio <= 1.0001) return push();
    if (ratio < 2.5) return win(1);
    if (ratio < 6) return win(2);
    if (ratio < 25) return win(3);
    return win(4);
  }

  // Perte : petit "womp" descendant, volontairement doux
  const lose = safe(() => {
    tone({ f: m2f(67), f2: m2f(66), type: 'triangle', d: 0.2, v: 0.1 });
    tone({ f: m2f(62), f2: m2f(58), type: 'triangle', t: 0.18, d: 0.45, v: 0.1 });
    tone({ f: m2f(50), f2: m2f(46), type: 'sawtooth', t: 0.18, d: 0.45, v: 0.035, lp: 600 });
  });

  // Égalité / remboursement : deux notes neutres
  const push = safe(() => {
    tone({ f: m2f(72), type: 'triangle', d: 0.14, v: 0.08 });
    tone({ f: m2f(72), type: 'triangle', t: 0.15, d: 0.2, v: 0.07 });
  });

  const whoosh = safe((d = 0.3, v = 0.18) => {
    hiss({ d, v, a: d * 0.4, f: 500, f2: 2500, q: 0.8 });
  });

  /* ---------------- Roulette ---------------- */
  // Roulement continu de la bille sur la piste : renvoie une poignée dont on
  // met à jour la vitesse (0..1) à chaque frame, puis qu'on arrête.
  function rouletteRoll() {
    if (!ready()) return { update() {}, stop() {} };
    const src = ctx.createBufferSource();
    src.buffer = noise();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    src.connect(filter).connect(gain).connect(master);
    src.start();
    return {
      update(speed) {
        const s = Math.max(0, Math.min(1, speed));
        gain.gain.setTargetAtTime(0.02 + s * 0.12, ctx.currentTime, 0.05);
        filter.frequency.setTargetAtTime(500 + s * 2200, ctx.currentTime, 0.05);
      },
      stop() {
        gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
        src.stop(ctx.currentTime + 0.5);
      },
    };
  }

  // La bille percute une séparation entre deux cases
  const fretTick = safe((intensity = 1) => {
    const f = 3000 + Math.random() * 900;
    tone({ f, type: 'triangle', d: 0.025, v: 0.05 * intensity });
    hiss({ d: 0.02, v: 0.12 * intensity, f: 5000, q: 3 });
  });

  // La bille sautille puis se cale dans sa case
  const ballSettle = safe(() => {
    [0, 0.13, 0.22, 0.28, 0.32].forEach((t, i) => {
      const k = 1 - i * 0.17;
      tone({ f: 2400 - i * 150, type: 'triangle', t, d: 0.04, v: 0.09 * k });
      hiss({ t, d: 0.03, v: 0.2 * k, f: 3800, q: 4 });
    });
    tone({ f: 160, f2: 110, t: 0.32, d: 0.12, v: 0.08 }); // "toc" final dans la case
  });

  /* ---------------- Machine à sous ---------------- */
  // Rouleaux qui tournent : cliquetis mécanique continu
  function reelSpin() {
    if (!ready()) return { setActive() {}, stop() {} };
    let active = 5;
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 55;
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 300;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.05;
    hum.connect(lpf).connect(humGain).connect(master);
    hum.start();
    const timer = setInterval(() => {
      if (active <= 0) return;
      hiss({ d: 0.02, v: 0.04 + active * 0.015, f: 2500 + Math.random() * 800, q: 5 });
    }, 55);
    return {
      setActive(n) {
        active = n;
        humGain.gain.setTargetAtTime(0.01 * n + 0.0001, ctx.currentTime, 0.05);
      },
      stop() {
        clearInterval(timer);
        humGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
        hum.stop(ctx.currentTime + 0.3);
      },
    };
  }

  // Un rouleau s'arrête : "clunk", un peu plus aigu à chaque rouleau
  const reelStop = safe((index = 0) => {
    tone({ f: 170 + index * 18, f2: 70, d: 0.14, v: 0.22 });
    hiss({ d: 0.04, v: 0.25, f: 1600 + index * 150, q: 3 });
    tone({ f: m2f(72 + index * 2), type: 'triangle', t: 0.01, d: 0.06, v: 0.04 });
  });

  // Suspense : un roulement qui monte pendant que le dernier rouleau tourne
  const anticipation = safe((d = 0.8) => {
    tone({ f: m2f(60), f2: m2f(72), type: 'sawtooth', d, v: 0.06, lp: 1600, a: d * 0.6 });
    hiss({ d, v: 0.06, a: d * 0.7, f: 800, f2: 4000, q: 1.5 });
  });

  // Une ligne gagnante s'allume (montée d'un ton à chaque ligne)
  const lineHit = safe((i = 0) => {
    bell(m2f(79 + ((i * 2) % 12)), 0, 0.07, 0.35);
  });

  // Déclenchement de bonus / Free Spins
  const fanfare = safe(() => {
    [60, 64, 67, 72, 67, 72, 76, 79].forEach((m, i) => {
      tone({ f: m2f(m + 12), t: i * 0.09, d: 0.16, v: 0.08, type: 'square', lp: 3000 });
    });
    [72, 76, 79, 84].forEach((m) => tone({ f: m2f(m), t: 0.75, d: 1.2, v: 0.05, type: 'sawtooth', lp: 2400, a: 0.03 }));
    bell(m2f(96), 0.75, 0.1, 1.2);
    coins(25, 1.4);
  });

  // Pièce lancée (Pile ou Face) : tintements qui ralentissent sur d secondes
  const coinFlip = safe((d = 1.1) => {
    let t = 0;
    let gap = 0.05;
    while (t < d - 0.1) {
      tone({ f: 3400 + Math.random() * 400, t, d: 0.05, v: 0.04 });
      t += gap;
      gap *= 1.12;
    }
    tone({ f: 2200, t: d - 0.06, d: 0.25, v: 0.08 });
    hiss({ t: d - 0.06, d: 0.04, v: 0.2, f: 3000, q: 3 });
  });

  /* ---------------- Fusée (crash) ---------------- */
  const ignition = safe(() => {
    hiss({ d: 0.9, v: 0.3, a: 0.05, type: 'lowpass', f: 400, f2: 2500 });
    tone({ f: 60, f2: 140, type: 'sawtooth', d: 0.9, v: 0.12, lp: 500 });
  });

  // Moteur : grondement + sifflement qui montent avec le multiplicateur
  function engine() {
    if (!ready()) return { update() {}, setVolume() {}, stop() {} };
    const t0 = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(1, t0 + 0.3);
    out.connect(master);

    const rumble = ctx.createBufferSource();
    rumble.buffer = noise();
    rumble.loop = true;
    const rumbleF = ctx.createBiquadFilter();
    rumbleF.type = 'lowpass';
    rumbleF.frequency.value = 350;
    const rumbleG = ctx.createGain();
    rumbleG.gain.value = 0.22;
    rumble.connect(rumbleF).connect(rumbleG).connect(out);
    rumble.start();

    const whistle = ctx.createOscillator();
    whistle.type = 'triangle';
    whistle.frequency.value = 220;
    const whistleG = ctx.createGain();
    whistleG.gain.value = 0.035;
    whistle.connect(whistleG).connect(out);
    whistle.start();

    let lastStep = 0;
    return {
      update(mult) {
        const now = ctx.currentTime;
        // le sifflement monte d'une octave à chaque doublement du multiplicateur
        const f = Math.min(220 * Math.pow(2, Math.log2(mult) * 1.2), 2600);
        whistle.frequency.setTargetAtTime(f, now, 0.08);
        rumbleF.frequency.setTargetAtTime(Math.min(350 + (mult - 1) * 260, 2400), now, 0.1);
        // petit "bip" de compteur à chaque +0.10x
        const step = Math.floor(mult * 10);
        if (step !== lastStep) {
          lastStep = step;
          tone({ f: Math.min(f * 2, 4000), type: 'sine', d: 0.03, v: 0.018 });
        }
      },
      setVolume(v) {
        out.gain.setTargetAtTime(Math.max(v, 0.0001), ctx.currentTime, 0.15);
      },
      stop() {
        out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
        rumble.stop(ctx.currentTime + 0.4);
        whistle.stop(ctx.currentTime + 0.4);
      },
    };
  }

  // Palier franchi (x2, x3, x5, x10...) : petite cloche qui monte
  const milestone = safe((k = 0) => {
    bell(m2f(84 + Math.min(k, 6) * 2), 0, 0.09, 0.45);
    bell(m2f(91 + Math.min(k, 6) * 2), 0.07, 0.07, 0.5);
  });

  const explosion = safe(() => {
    hiss({ d: 1.4, v: 0.6, a: 0.005, type: 'lowpass', f: 3500, f2: 90 });
    tone({ f: 110, f2: 28, d: 0.8, v: 0.45 });
    for (let i = 0; i < 7; i++) {
      hiss({ t: 0.08 + Math.random() * 0.6, d: 0.04, v: 0.15, f: 1500 + Math.random() * 2500, q: 2 });
    }
  });

  /* ---------------- Mines ---------------- */
  const arm = safe(() => {
    tone({ f: 300, f2: 900, type: 'square', d: 0.12, v: 0.04, lp: 1600 });
    hiss({ t: 0.1, d: 0.05, v: 0.15, f: 2500, q: 3 });
  });

  // Diamant trouvé : la hauteur monte à chaque case (gamme pentatonique)
  const gem = safe((streak = 1) => {
    const scale = [0, 2, 4, 7, 9];
    const n = Math.max(0, streak - 1);
    const m = 76 + scale[n % 5] + 12 * Math.floor(n / 5);
    bell(m2f(Math.min(m, 108)), 0, 0.11, 0.5);
    tone({ f: m2f(Math.min(m + 7, 112)), t: 0.04, d: 0.25, v: 0.04, type: 'triangle' });
    hiss({ d: 0.15, v: 0.05, f: 8000, type: 'highpass' }); // scintillement
  });

  /* ---------------- Chicken Road ---------------- */
  const cluck = safe((t = 0) => {
    [0, 0.09].forEach((dt, i) => {
      tone({ f: 820 - i * 60, f2: 480, type: 'square', t: t + dt, d: 0.07, v: 0.05, lp: 2200 });
    });
    tone({ f: 1050, f2: 650, type: 'square', t: t + 0.2, d: 0.13, v: 0.05, lp: 2200 }); // "...cot !"
  });

  // Saut d'une case à l'autre (dure ~0.45s comme l'animation CSS)
  const hop = safe(() => {
    tone({ f: 260, f2: 720, type: 'sine', d: 0.18, v: 0.12 });
    hiss({ d: 0.25, v: 0.05, f: 900, f2: 2400, q: 1 });
  });

  // Atterrissage réussi sur la case n : chime qui monte avec la progression
  const land = safe((n = 1) => {
    tone({ f: 140, f2: 80, d: 0.08, v: 0.15 });
    const m = 72 + Math.min(n - 1, 12) * 2;
    tone({ f: m2f(m), type: 'square', t: 0.02, d: 0.09, v: 0.05, lp: 3000 });
    tone({ f: m2f(m + 7), type: 'square', t: 0.09, d: 0.14, v: 0.05, lp: 3000 });
  });

  // Le poulet tombe dans le four
  const burn = safe(() => {
    hiss({ d: 0.6, v: 0.35, a: 0.02, f: 600, f2: 3000, q: 0.7 });       // flamme
    for (let i = 0; i < 8; i++) hiss({ t: Math.random() * 0.5, d: 0.025, v: 0.15, f: 2000 + Math.random() * 3000, q: 3 }); // crépitements
    tone({ f: 1300, f2: 500, type: 'square', t: 0.05, d: 0.35, v: 0.06, lp: 2500 }); // cri du poulet
  });

  // "Ding !" de minuteur de four : le poulet est cuit
  const ovenDing = safe(() => {
    bell(m2f(88), 0, 0.16, 1.4);
    bell(m2f(88), 0.004, 0.05, 0.3);
    hiss({ t: 0.1, d: 1.2, v: 0.05, a: 0.2, f: 3500, q: 0.6 }); // grésillement
  });

  /* ---------------- Craps ---------------- */
  // Lancer de dés : secousse dans la main, envol, puis un double "clac" à
  // chaque rebond (bounces = fractions de la durée d, mêmes valeurs que
  // l'animation des dés) avec un volume qui décroît.
  const diceThrow = safe((d = 1.4, bounces = [0.32, 0.58, 0.78, 0.9]) => {
    for (let i = 0; i < 4; i++) hiss({ t: i * 0.035, d: 0.025, v: 0.12, f: 2600 + Math.random() * 800, q: 5 }); // secousse
    hiss({ t: 0.05, d: 0.3, v: 0.06, a: 0.08, f: 700, f2: 1800, q: 0.8 }); // envol
    bounces.forEach((b, i) => {
      const t = b * d;
      const k = 1 - i * 0.22;
      [0, 0.03 + Math.random() * 0.03].forEach((dt) => {
        hiss({ t: t + dt, d: 0.03, v: 0.32 * k, f: 2200 + Math.random() * 1200, q: 4 });
        tone({ f: 1500 + Math.random() * 600, type: 'triangle', t: t + dt, d: 0.03, v: 0.05 * k });
      });
      tone({ f: 160, f2: 90, t, d: 0.07, v: 0.1 * k }); // impact sur le feutre
    });
    hiss({ t: bounces[bounces.length - 1] * d, d: 0.12, v: 0.05, f: 2000, q: 2 }); // les dés se calent
  });

  // Point établi : palet "ON" posé
  const pointOn = safe(() => {
    tone({ f: 220, f2: 120, d: 0.06, v: 0.12 });
    bell(m2f(81), 0.05, 0.1, 0.5);
    bell(m2f(88), 0.16, 0.08, 0.6);
  });

  /* ---------------- Poker ---------------- */
  // "Parole" : deux petits coups frappés sur le tapis
  const knock = safe(() => {
    [0, 0.11].forEach((t) => {
      tone({ f: 140, f2: 80, t, d: 0.08, v: 0.22 });
      hiss({ t, d: 0.03, v: 0.12, f: 900, q: 1.5 });
    });
  });

  /* ---------------- Plinko ---------------- */
  const drop = safe(() => {
    tone({ f: 900, f2: 1400, type: 'sine', d: 0.07, v: 0.07 });
  });

  let lastPegAt = 0;
  // Bille qui touche une cheville. pos = 0 (haut) .. 1 (bas) → plus aigu en descendant
  const peg = safe((pos = 0.5) => {
    const now = ctx.currentTime;
    if (now - lastPegAt < 0.018) return; // limite le nombre de sons simultanés
    lastPegAt = now;
    const f = 900 + pos * 1100 + Math.random() * 60;
    tone({ f, type: 'triangle', d: 0.06, v: 0.06 });
    tone({ f: f * 2, type: 'sine', d: 0.03, v: 0.02 });
  });

  // Bille qui tombe dans un bac de multiplicateur
  const plinkoLand = safe((mult = 1) => {
    if (mult < 1) {
      tone({ f: 200, f2: 120, d: 0.12, v: 0.12 });
      tone({ f: m2f(64), type: 'triangle', t: 0.02, d: 0.1, v: 0.04 });
    } else if (mult < 2) {
      tone({ f: 200, f2: 120, d: 0.1, v: 0.1 });
      bell(m2f(79), 0.02, 0.07, 0.3);
    } else if (mult < 10) {
      win(1);
    } else if (mult < 50) {
      win(3);
    } else {
      win(4);
    }
  });

  /* ---------------- Bar ---------------- */
  // Verser un liquide (glouglou filtré)
  const pour = safe((d = 0.8) => {
    const start = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(500, start);
    // glouglous : la fréquence oscille et monte à mesure que le verre se remplit
    for (let t = 0; t < d; t += 0.07) {
      filter.frequency.linearRampToValueAtTime(500 + (t / d) * 700 + Math.random() * 400, start + t);
    }
    const gain = ctx.createGain();
    envelope(gain, start, 0.35, 0.05, d);
    src.connect(filter).connect(gain).connect(master);
    src.start(start);
    src.stop(start + d + 0.05);
  });

  // Tintement de verres + glaçons
  const clink = safe((t = 0) => {
    bell(2600, t, 0.08, 0.5);
    bell(3150, t + 0.08, 0.06, 0.45);
    for (let i = 0; i < 3; i++) tone({ f: 4200 + Math.random() * 1500, t: t + 0.15 + i * 0.05, d: 0.05, v: 0.025 });
  });

  const sip = safe((t = 0) => {
    hiss({ t, d: 0.3, v: 0.12, f: 1200, f2: 600, q: 2 });
    tone({ f: 180, f2: 90, t: t + 0.3, d: 0.1, v: 0.12 }); // gloups
  });

  /* ---------------- Caisses (bar) ---------------- */
  const caseTick = safe(() => {
    tone({ f: 1200 + Math.random() * 300, type: 'square', d: 0.04, v: 0.035, lp: 3000 });
  });

  // rarityIndex : 0 = commun ... 4 = mythique
  const caseReveal = safe((rarityIndex = 0) => {
    if (rarityIndex <= 0) {
      tone({ f: m2f(72), type: 'square', d: 0.12, v: 0.06, lp: 2500 });
      tone({ f: m2f(79), type: 'square', t: 0.1, d: 0.2, v: 0.06, lp: 2500 });
    } else {
      win(Math.min(4, rarityIndex));
    }
  });

  /* ---------------- Carrousel (hub Arcade) ---------------- */
  const swipe = safe(() => {
    hiss({ d: 0.18, v: 0.1, a: 0.04, f: 800, f2: 2200, q: 1 });
    tone({ f: 600, f2: 900, type: 'triangle', d: 0.08, v: 0.03 });
  });

  const select = safe(() => {
    tone({ f: m2f(76), type: 'square', d: 0.08, v: 0.05, lp: 3000 });
    tone({ f: m2f(83), type: 'square', t: 0.07, d: 0.16, v: 0.05, lp: 3000 });
  });

  /* ---------------- Lecture de la position d'un élément animé ---------------- */
  // Utile pour caler des sons sur une transition CSS en cours.
  function angleOf(el) {
    const tr = getComputedStyle(el).transform;
    if (!tr || tr === 'none') return 0;
    const m = new DOMMatrixReadOnly(tr);
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  }

  /* ---------------- Bouton muet dans le bandeau ---------------- */
  function setMuted(value, silent) {
    muted = !!value;
    try { localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch (e) { /* tant pis */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.02);
    document.querySelectorAll('[data-sfx-toggle]').forEach((btn) => {
      btn.textContent = muted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son');
      btn.dataset.tooltip = muted ? 'Son coupé' : 'Son activé';
    });
    if (!muted && !silent) click();
  }

  function injectToggle() {
    document.querySelectorAll('.game-topbar-right').forEach((bar) => {
      if (bar.querySelector('[data-sfx-toggle]')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sfx-toggle';
      btn.dataset.sfxToggle = '';
      btn.addEventListener('click', () => setMuted(!muted));
      bar.insertBefore(btn, bar.firstChild);
    });
    setMuted(muted, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggle);
  } else {
    injectToggle();
  }

  return {
    // génériques
    click, denied, chip, chipStack, chipsSweep, cardSlide, cardFlip,
    coins, cashRegister, win, winFor, lose, push, whoosh,
    // roulette
    rouletteRoll, fretTick, ballSettle,
    // machine à sous
    reelSpin, reelStop, anticipation, lineHit, fanfare, coinFlip,
    // fusée
    ignition, engine, milestone, explosion,
    // mines
    arm, gem,
    // chicken
    cluck, hop, land, burn, ovenDing,
    // craps
    diceThrow, pointOn,
    // poker
    knock,
    // plinko
    drop, peg, plinkoLand,
    // bar
    pour, clink, sip, caseTick, caseReveal,
    // arcade
    swipe, select,
    // utilitaires
    angleOf, isMuted: () => muted, setMuted,
  };
})();
