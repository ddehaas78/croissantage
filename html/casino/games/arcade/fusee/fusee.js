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
  let cashoutTarget = Infinity; // pas d'encaissement auto par défaut
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

  // Sons : moteur dont le sifflement monte avec le multiplicateur + cloche à chaque palier
  const MILESTONES = [1.5, 2, 3, 5, 10, 25, 50, 100];
  let engineSound = null;
  let milestoneIdx = 0;

  // Marque le point où le joueur a encaissé, pour continuer à dessiner la
  // courbe au-delà (en pointillés) et révéler jusqu'où la fusée serait
  // allée avant le vrai crash.
  let cashoutMultiplier = null;
  let cashoutElapsedTime = null;

  // ---------------- Effets visuels ----------------
  // particles : flammes / fumée de la traînée + éclats d'explosion (coords écran)
  // stars : champ d'étoiles qui défile à l'opposé de la fusée (sensation de vitesse)
  // shakeBoost : secousse supplémentaire (crash) qui décroît à chaque frame
  let particles = [];
  let stars = [];
  let shakeBoost = 0;
  let explosionStart = 0;
  let explosionRaf = null;
  let tip = null; // dernière position de la pointe de la courbe
  // Courbure de l'exponentielle affichée : elle AUGMENTE avec le temps de vol,
  // donc plus la fusée tient longtemps, plus la fin de courbe devient verticale.
  const CURVE_K_START = 2.2;
  const CURVE_K_PER_SEC = 0.16;
  const CURVE_K_MAX = 9;

  let canvas, ctx;

  // ---------------- Échelle dynamique (auto-zoom) ----------------
  // Le graphique "se rétrécit" progressivement (les axes s'étendent) pour que
  // la fusée reste toujours visible avec une marge confortable, au lieu de
  // foncer droit vers le coin et d'être coupée. FILL = fraction de l'espace
  // que la pointe de la courbe doit idéalement occuper ; EASE = vitesse de
  // lissage du zoom (plus petit = plus doux).
  const MIN_WINDOW = 6;
  const WINDOW_FILL = 0.94;
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
    const minRequiredWindow = Math.max(elapsedTime / 0.96, MIN_WINDOW);
    if (smoothedWindow < minRequiredWindow) smoothedWindow = minRequiredWindow;

    const desiredMax = Math.max(1 + (multiplier - 1) / MULT_FILL, 2);
    smoothedMaxMult += (desiredMax - smoothedMaxMult) * ZOOM_EASE;
    const minRequiredMax = Math.max(1 + (multiplier - 1) / 0.93, 2);
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

  // Taille du canvas en pixels CSS "de mise en page" (clientWidth/Height),
  // et non getBoundingClientRect() : avec le zoom automatique de core/fit.js,
  // getBoundingClientRect renvoie une taille déjà zoomée, ce qui faisait
  // appliquer le zoom deux fois (dessin trop petit dans son cadre).
  function setupCanvas() {
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const zoom = w ? canvas.getBoundingClientRect().width / w : 1;
    const ratio = (window.devicePixelRatio || 1) * zoom; // reste net même zoomé
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
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
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);

    drawStars(width, height);

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
    // Forme exponentielle normalisée : (e^(K·t) - 1) / (e^K - 1), t = fraction
    // du temps écoulé. La pointe vaut toujours 1 (= multiplicateur actuel).
    // K grandit avec le temps de vol : au début la courbe est douce, puis
    // elle se redresse jusqu'à devenir presque verticale.
    const CURVE_K = Math.min(CURVE_K_MAX, CURVE_K_START + elapsedTime * CURVE_K_PER_SEC);
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const timeAtPoint = elapsedTime * t;
      const multAtPoint = Math.pow(Math.E, 0.1 * timeAtPoint);
      // x suit le temps réel écoulé sur une échelle fixe (displayWindow),
      // donc la fusée démarre à gauche (x≈0) et avance vers la droite.
      const x = width * (timeAtPoint / displayWindow);
      const shapedFrac = (Math.exp(CURVE_K * t) - 1) / (Math.exp(CURVE_K) - 1);
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
    const prev = points[Math.max(0, points.length - 4)] || last;
    tip = { x: last.x, y: last.y };

    if (phase === 'crashed') {
      updateAndDrawParticles();
      drawExplosion(last.x, last.y);
      return;
    }

    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    drawRocket(last.x, last.y, angle, goldBright);
    updateAndDrawParticles();
  }

  /* ---------------- Fusée : sprite + flamme + traînée ---------------- */
  // ⚠️ Orientation du sprite : fusee.png a le NEZ VERS LE HAUT au repos.
  // On tourne donc de +90° pour aligner le nez sur la direction de la courbe.
  const ROCKET_H = 84;

  function drawRocket(x, y, angle, goldBright) {
    if (!(rocketImg.complete && rocketImg.naturalWidth)) {
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = goldBright;
      ctx.fill();
      return;
    }
    const drawH = ROCKET_H;
    const drawW = drawH * (rocketImg.naturalWidth / rocketImg.naturalHeight);
    const offsetY = -drawH * 0.08; // le nez touche la pointe de la courbe
    // sortie des réacteurs (repère local) : dans fusee.png la fusée occupe
    // 9 % -> 74 % de la hauteur, on démarre la flamme juste au-dessus de la
    // tuyère pour qu'elle passe SOUS le sprite, sans trou.
    const tailY = offsetY + drawH * 0.71;

    // la fusée vibre un peu plus fort à mesure qu'elle monte
    const wobble = Math.min(0.09, 0.012 * Math.log(multiplier + 1) * 3) * (Math.random() - 0.5);
    const r = angle + Math.PI / 2 + wobble;

    // particules de feu / fumée émises par les réacteurs (coords écran)
    const back = { x: -Math.cos(angle), y: -Math.sin(angle) };
    const tailX = x - tailY * Math.sin(r);
    const tailYw = y + tailY * Math.cos(r);
    if (!cashedOut || phase === 'running') {
      const power = Math.min(2.2, 1 + Math.log(multiplier) * 0.6);
      for (let i = 0; i < 3; i++) {
        const spread = (Math.random() - 0.5) * 1.6;
        particles.push({
          kind: Math.random() < 0.7 ? 'fire' : 'smoke',
          x: tailX + (Math.random() - 0.5) * 6,
          y: tailYw + (Math.random() - 0.5) * 6,
          vx: back.x * (2 + Math.random() * 2.5) * power - back.y * spread,
          vy: back.y * (2 + Math.random() * 2.5) * power + back.x * spread,
          life: 0,
          max: 18 + Math.random() * 18,
          size: 3 + Math.random() * 3,
        });
      }
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);

    // flamme principale (derrière la fusée), longueur qui vacille
    const flameLen = drawH * (0.55 + Math.random() * 0.3 + Math.min(0.6, Math.log(multiplier) * 0.18));
    const fw = drawW * 0.42;
    ctx.globalCompositeOperation = 'lighter';
    let g = ctx.createLinearGradient(0, tailY, 0, tailY + flameLen);
    g.addColorStop(0, 'rgba(255, 250, 220, 0.95)');
    g.addColorStop(0.25, 'rgba(255, 205, 80, 0.9)');
    g.addColorStop(0.6, 'rgba(255, 110, 30, 0.55)');
    g.addColorStop(1, 'rgba(255, 60, 20, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-fw / 2, tailY);
    ctx.quadraticCurveTo(-fw * 0.7, tailY + flameLen * 0.45, 0, tailY + flameLen);
    ctx.quadraticCurveTo(fw * 0.7, tailY + flameLen * 0.45, fw / 2, tailY);
    ctx.closePath();
    ctx.fill();
    // cœur bleu-blanc très chaud
    const coreLen = flameLen * 0.42;
    g = ctx.createLinearGradient(0, tailY, 0, tailY + coreLen);
    g.addColorStop(0, 'rgba(220, 240, 255, 1)');
    g.addColorStop(1, 'rgba(120, 180, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-fw * 0.22, tailY);
    ctx.quadraticCurveTo(-fw * 0.25, tailY + coreLen * 0.5, 0, tailY + coreLen);
    ctx.quadraticCurveTo(fw * 0.25, tailY + coreLen * 0.5, fw * 0.22, tailY);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.shadowColor = 'rgba(255, 170, 60, 0.8)';
    ctx.shadowBlur = 16;
    ctx.drawImage(rocketImg, -drawW / 2, offsetY, drawW, drawH);
    ctx.restore();
  }

  function updateAndDrawParticles() {
    const alive = [];
    for (const p of particles) {
      p.life += 1;
      if (p.life >= p.max) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= p.kind === 'spark' ? 0.95 : 0.93;
      p.vy = p.vy * (p.kind === 'spark' ? 0.95 : 0.93) + (p.kind === 'spark' ? 0.12 : -0.02);
      alive.push(p);
    }
    particles = alive.slice(-420);

    ctx.save();
    for (const p of particles) {
      const k = p.life / p.max; // 0 -> 1
      if (p.kind === 'smoke') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(190, 180, 170, ${0.22 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + k * 2.5), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        const gch = Math.round(230 - k * 170);
        ctx.fillStyle = `rgba(255, ${gch}, ${Math.round(80 - k * 60)}, ${0.85 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ---------------- Étoiles (fond qui défile) ---------------- */
  function drawStars(width, height) {
    if (stars.length === 0 || stars.w !== width || stars.h !== height) {
      stars = [];
      for (let i = 0; i < 70; i++) {
        stars.push({ x: Math.random() * width, y: Math.random() * height, s: 0.4 + Math.random() * 1.4, a: 0.25 + Math.random() * 0.6 });
      }
      stars.w = width;
      stars.h = height;
    }
    // plus le multiplicateur est haut, plus les étoiles filent vite
    const speed = phase === 'running' ? 0.4 + Math.log(multiplier) * 2.6 : 0.05;
    for (const st of stars) {
      st.x -= speed * 0.8 * st.s;
      st.y += speed * 0.55 * st.s;
      if (st.x < 0) st.x += width;
      if (st.y > height) st.y -= height;
      ctx.fillStyle = `rgba(243, 233, 210, ${st.a})`;
      const len = Math.min(14, speed * st.s * 1.4);
      if (len > 1.5) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = st.s;
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.lineTo(st.x + len * 0.8, st.y - len * 0.55);
        ctx.stroke();
      } else {
        ctx.fillRect(st.x, st.y, st.s, st.s);
      }
    }
  }

  /* ---------------- Explosion (crash) ---------------- */
  function spawnExplosion(x, y) {
    explosionStart = performance.now();
    shakeBoost = 16;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 7;
      particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 30 + Math.random() * 30, size: 2 + Math.random() * 3 });
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.5 + Math.random() * 2;
      particles.push({ kind: 'smoke', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 60 + Math.random() * 30, size: 6 + Math.random() * 6 });
    }
  }

  function drawExplosion(x, y) {
    const age = (performance.now() - explosionStart) / 1000;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (age < 0.25) {
      const flash = ctx.createRadialGradient(x, y, 0, x, y, 90);
      flash.addColorStop(0, `rgba(255, 255, 230, ${0.9 * (1 - age / 0.25)})`);
      flash.addColorStop(1, 'rgba(255, 140, 40, 0)');
      ctx.fillStyle = flash;
      ctx.beginPath();
      ctx.arc(x, y, 90, 0, Math.PI * 2);
      ctx.fill();
    }
    const ringAlpha = Math.max(0, 1 - age * 1.6);
    if (ringAlpha > 0) {
      ctx.strokeStyle = `rgba(255, 150, 60, ${ringAlpha})`;
      ctx.lineWidth = 4 * ringAlpha + 1;
      ctx.beginPath();
      ctx.arc(x, y, 12 + age * 170, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function explosionLoop() {
    drawCurve();
    applyShake();
    if (performance.now() - explosionStart < 1600) {
      explosionRaf = requestAnimationFrame(explosionLoop);
    } else {
      explosionRaf = null;
      resetShake();
    }
  }

  /* ---------------- Secousses ---------------- */
  function applyShake() {
    const el = document.querySelector('.fs-display');
    if (!el) return;
    const climb = phase === 'running' ? Math.min(7, 0.9 * Math.pow(Math.max(0, multiplier - 1), 0.75)) : 0;
    const amp = climb + shakeBoost;
    shakeBoost *= 0.9;
    if (amp < 0.15) {
      el.style.transform = '';
      return;
    }
    const dx = (Math.random() - 0.5) * amp;
    const dy = (Math.random() - 0.5) * amp;
    const rot = (Math.random() - 0.5) * amp * 0.06;
    el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) rotate(${rot.toFixed(3)}deg)`;
  }

  function resetShake() {
    shakeBoost = 0;
    const el = document.querySelector('.fs-display');
    if (el) el.style.transform = '';
  }

  function updateMultiplierDisplay() {
    const valueEl = document.getElementById('fs-multiplier-value');
    const displayEl = document.getElementById('fs-multiplier-display');
    if (!valueEl || !displayEl) return;
    valueEl.textContent = multiplier.toFixed(2);
    // le compteur "chauffe" : crème -> or -> orange -> rouge selon la hauteur
    const heat = Math.min(1, Math.log(multiplier) / Math.log(20));
    valueEl.style.color = phase === 'crashed' ? '' : `hsl(${Math.round(48 - heat * 40)}, ${Math.round(40 + heat * 60)}%, ${Math.round(88 - heat * 30)}%)`;
    valueEl.style.textShadow = phase === 'running' && heat > 0.2 ? `0 0 ${Math.round(heat * 24)}px rgba(255, 120, 40, ${heat})` : '';
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
      const tooltip = def.type === 'fraction' ? ` data-tooltip="Mise : ${fmt(chipAmount(def))} jetons"` : '';
      return `<button type="button" class="fs-chip" data-chip-index="${i}"${tooltip}>${def.label}</button>`;
    }).join('');
  }

  // Les jetons "fraction" affichent leur montant réel en tooltip ; on la
  // rafraîchit à chaque changement de mise ou de solde.
  function refreshFractionChipTooltips() {
    document.querySelectorAll('.fs-chip[data-chip-index]').forEach((btn) => {
      const def = CHIP_DEFS[Number(btn.dataset.chipIndex)];
      if (def && def.type === 'fraction') {
        btn.dataset.tooltip = `Mise : ${fmt(chipAmount(def))} jetons`;
      }
    });
  }

  function addChip(index) {
    if (inRound) return;
    const def = CHIP_DEFS[index];
    const amount = chipAmount(def);
    if (amount <= 0 || !Wallet.canAfford(bet + amount)) {
      setMessage('Solde insuffisant pour ce jeton.', 'fs-msg-warn');
      Sfx.denied();
      return;
    }
    bet += amount;
    Sfx.chip();
    updateBetDisplay();
    setMessage(`Mise : ${fmt(bet)} jetons. Cliquez sur LANCER quand vous êtes prêt.`);
  }

  function clearBet() {
    if (inRound) return;
    if (bet > 0) Sfx.chipsSweep();
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
    Sfx.chipStack();
    updateBetDisplay();
    setMessage(`Mise : ${fmt(bet)} jetons. Cliquez sur LANCER.`);
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
    Sfx.ignition();
    if (window.Stats) Stats.round();
    engineSound = Sfx.engine();
    milestoneIdx = 0;
    inRound = true;
    cashedOut = false;
    toggleBetControls(false);
    document.getElementById('fs-cashout-btn').disabled = false;

    // Encaissement auto : champ vide = désactivé (encaissement manuel uniquement)
    const targetInput = document.getElementById('fs-target-input');
    const typed = parseFloat(String(targetInput.value).replace(',', '.'));
    cashoutTarget = Number.isFinite(typed) && typed >= 1.01 ? typed : Infinity;
    if (cashoutTarget === Infinity) targetInput.value = '';

    multiplier = 1.00;
    elapsedTime = 0;
    crashPoint = generateCrashPoint();
    startTime = Date.now();
    phase = 'running';
    cashoutMultiplier = null;
    cashoutElapsedTime = null;
    resetScale();
    particles = [];
    hideMissed();
    if (explosionRaf) cancelAnimationFrame(explosionRaf);
    explosionRaf = null;
    resetShake();

    updateStatus();
    setMessage(
      cashoutTarget === Infinity
        ? 'Envolée ! Cliquez sur ENCAISSER avant le crash.'
        : `Envolée ! Encaissement auto à ${cashoutTarget.toFixed(2)}×, ou cliquez sur ENCAISSER.`
    );
    gameLoop();
  }

  function gameLoop() {
    const elapsed = (Date.now() - startTime) / 1000;
    elapsedTime = elapsed;
    multiplier = Math.pow(Math.E, 0.1 * elapsed);

    if (engineSound) engineSound.update(Math.min(multiplier, crashPoint));
    while (milestoneIdx < MILESTONES.length && multiplier >= MILESTONES[milestoneIdx] && multiplier < crashPoint) {
      Sfx.milestone(milestoneIdx);
      milestoneIdx++;
    }

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
      if (engineSound) engineSound.stop();
      engineSound = null;
      Sfx.explosion();
      if (!cashedOut) setTimeout(() => Sfx.lose(), 700);
      updateMultiplierDisplay();
      spawnExplosion(tip ? tip.x : 0, tip ? tip.y : 0);
      explosionLoop(); // explosion + grosse secousse pendant ~1,6 s
      updateStatus();
      crash();
      return;
    }

    updateMultiplierDisplay();
    drawCurve();
    applyShake(); // l'écran tremble de plus en plus à mesure que ça monte
    if (cashedOut) updateMissed(false);
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
    Sfx.cashRegister();
    Sfx.winFor(payout, bet);
    if (window.Stats) Stats.best(multiplier);
    if (engineSound) engineSound.setVolume(0.35); // la fusée continue, plus en retrait

    history.unshift({ mult: multiplier, win: true });
    history = history.slice(0, 12);
    renderHistory();

    setMessage(
      (auto ? `Encaissement automatique à ${multiplier.toFixed(2)}× ! ` : `Encaissé à ${multiplier.toFixed(2)}× ! `) +
        `Vous gagnez ${fmt(payout)} jetons (profit ${fmt(profit)}). La fusée continue son vol pour révéler la suite...`,
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
      setMessage(`Crash à ${multiplier.toFixed(2)}×. Vous perdez ${fmt(bet)} jetons.`, 'fs-msg-bad');
    } else {
      const could = Math.round(bet * multiplier);
      const got = Math.round(bet * cashoutMultiplier);
      setMessage(
        could > got
          ? `Crash à ${multiplier.toFixed(2)}× : en restant jusqu'au bout vous auriez gagné ${fmt(could)} jetons au lieu de ${fmt(got)}… mais personne ne sait quand elle explose !`
          : `La fusée s'est écrasée à ${multiplier.toFixed(2)}× — encaissé juste à temps !`,
        'fs-msg-good'
      );
      updateMissed(true);
    }

    endRound();
  }

  /* ---------------- Gain manqué (après encaissement) ----------------
     Une fois encaissé, la fusée continue de monter : on affiche en direct
     ce que le joueur aurait gagné s'il était resté, puis le bilan au crash. */
  function updateMissed(final) {
    const el = document.getElementById('fs-missed');
    if (!el || !cashedOut || cashoutMultiplier == null) return;
    const got = Math.round(bet * cashoutMultiplier);
    const could = Math.round(bet * multiplier);
    const diff = could - got;
    el.classList.remove('fs-hidden');
    el.classList.toggle('fs-missed-final', !!final);
    if (final) {
      el.innerHTML = diff > 0
        ? `Encaissé <b>${fmt(got)}</b> à ${cashoutMultiplier.toFixed(2)}× · max possible <b>${fmt(could)}</b> à ${multiplier.toFixed(2)}× <span class="fs-missed-diff">(+${fmt(diff)})</span>`
        : `Encaissé pile au bon moment : <b>${fmt(got)}</b>`;
    } else {
      el.innerHTML = `Si vous étiez resté : <b>${fmt(could)}</b> <span class="fs-missed-diff">+${fmt(diff)}</span>`;
    }
  }

  function hideMissed() {
    const el = document.getElementById('fs-missed');
    if (el) el.classList.add('fs-hidden');
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
          <div class="fs-missed fs-hidden" id="fs-missed"></div>
        </div>

        <div class="fs-side-panel">
          <p id="fs-message" class="game-msg">Placez votre mise, puis lancez la fusée.</p>
          <div class="fs-total-bet">Mise : <span id="fs-bet-amount">0</span> <span class="coin-icon" aria-hidden="true"></span></div>
          <div class="fs-chip-row" id="fs-chip-row">${buildChipsHTML()}</div>

          <div class="fs-target-group">
            <span class="fs-target-label">Encaissement auto à</span>
            <div class="fs-target-wrapper">
              <input type="text" inputmode="decimal" class="fs-target-input" id="fs-target-input" value="" placeholder="Aucun (manuel)">
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
      const v = parseFloat(input.value);
      input.value = Number.isFinite(v) ? (v + 0.1).toFixed(2) : '1.50'; // champ vide -> 1.50
    });
    container.querySelector('#fs-target-down').addEventListener('click', () => {
      const input = document.getElementById('fs-target-input');
      const v = parseFloat(input.value);
      if (!Number.isFinite(v)) return; // déjà en manuel
      // sous 1.01 on repasse en manuel (champ vide)
      input.value = v - 0.1 < 1.01 ? '' : (v - 0.1).toFixed(2);
    });

    window.addEventListener('resize', () => {
      setupCanvas();
      drawCurve();
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Fusee.init());