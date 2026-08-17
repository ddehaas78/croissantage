/* ============================================================
   LOBBY CASINO - façon vieux Pokémon (GBA/DS)
   - petit village en extérieur avec une maison par jeu
   - grille + collisions
   - déplacement clavier (ZQSD / flèches) case par case
   - déplacement tactile par pathfinding (Dijkstra) au clic/tap
   - joueur animé par spritesheet (direction + frames de marche)
   - portes des maisons -> redirection vers la page du jeu
   ============================================================ */

const root = document.querySelector(':root');
const info = document.getElementById('info');
const text = document.getElementById('text');
const player = document.getElementById('player');
const mapEl = document.getElementById('map');
const tilesetEl = document.getElementById('tileset');

const TILE = 64;

/* ---------- Définition des jeux / maisons ---------- */
/* Chaque jeu a : une porte (walkable + effet), un toit (bloquant, décoratif)
   et des façades (bloquantes) de part et d'autre de la porte. */
const GAMES = [
  { key: "blackjack", name: "Blackjack",        icon: "🃏", href: "./games/blackjack/blackjack.html" },
  { key: "roulette",  name: "Roulette",         icon: "🎡", href: "./games/roulette/roulette.html" },
  { key: "poker",     name: "Poker",            icon: "♠️", href: "./games/poker/poker.html" },
  { key: "slots",     name: "Machines à sous",  icon: "🎰", href: "./games/columbus/columbus.html" },
];
GAMES.forEach((g, i) => {
  g.doorCode = 10 + i;   // 10-13
  g.roofCode = 20 + i;   // 20-23
  g.facadeCode = 30 + i; // 30-33
});

/* ---------- Bâtiments annexes (même gabarit "maison" 3x2 que les jeux) ---------- */
/* future-left / future-right : rangée à part, plus proches du centre que les jeux.
   future-bottom-1 / bar / future-bottom-2 : rangée du bas, bar centré. */
const EXTRA_HOUSES = [
  { key: "future-left",     name: "Bientôt disponible", icon: "🔒", href: null, locked: true, x: 2,  y: 6 },
  { key: "future-right",    name: "Bientôt disponible", icon: "🔒", href: null, locked: true, x: 22, y: 6 },
  { key: "baccara",         name: "Baccara",            icon: "🎴", href: "./games/baccara/baccara.html", x: 7,  y: 8 },
  { key: "bar",             name: "Bar",                icon: "🍸", href: "./games/bar/bar.html",  x: 12, y: 8 },
  { key: "future-bottom-2", name: "Bientôt disponible", icon: "🔒", href: null, locked: true, x: 17, y: 8 },
];
EXTRA_HOUSES.forEach((e, i) => {
  e.doorCode = 40 + i;   // 40-44
  e.roofCode = 50 + i;   // 50-54
  e.facadeCode = 60 + i; // 60-64
});

const ALL_HOUSES = [...GAMES, ...EXTRA_HOUSES];

/* ---------- Images des bâtiments (toit + façade en un seul visuel) ---------- */
/* Chaque image doit faire (largeur_maison * TILE) x (2 * TILE) px, soit
   192x128 pour une maison classique (largeur 3). Dépose les fichiers dans
   assets/misc/batiment/ et remplace juste le fichier pour changer le visuel
   (pas besoin de retoucher le code). Retire une ligne pour revenir au rendu
   par défaut (couleur unie + icône) tant que l'image n'existe pas.
   Attention : contrairement à un url() écrit dans lobby.css (résolu relatif
   au fichier CSS), ce chemin est appliqué en JS via style.backgroundImage,
   donc résolu relativement à lobby.html lui-même. Comme assets/ est au même
   niveau que lobby.html (sibling de css/ et js/), pas de "../" ici. */
const HOUSE_IMAGE_BASE = "assets/misc/batiment/";
const HOUSE_IMAGES = {
  blackjack:        "blackjack.png",
  roulette:          "roulette.png",
  poker:             "poker.png",
  slots:             "slots.png",
  baccara:           "baccara.png",
  bar:               "bar.png",
  "future-left":     "future-left.png",
  "future-right":    "future-right.png",
  "future-bottom-2": "future-bottom-2.png",
};

/* Texture du tapis rouge (allées + boulevard), extraite du tilesheet fourni.
   Même logique de chemin que HOUSE_IMAGE_BASE : résolu en JS via
   style.backgroundImage, donc relatif à lobby.html. */
const CARPET_IMAGE = "assets/misc/lobby/sol/carpet-rouge.png";

/* Décorations en image (au lieu d'un simple emoji). Même principe : chemin
   résolu relativement à lobby.html. */
const DECO_IMAGE_BASE = "assets/misc/lobby/deco/";
const DECO_IMAGES = {
  slot: "slot-deco.png",
  plant: "plant-deco.png",
};

/* Position (colonne de départ, largeur 3) de chaque maison de jeu sur la grille.
   Symétrique autour de la colonne centrale (13) : 0<->3, 1<->2 */
const HOUSE_X = [4, 9, 15, 20];

function buildGrid(width, height) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const border = (x === 0 || x === width - 1 || y === 0 || y === height - 1);
      row.push(border ? 1 : 0);
    }
    grid.push(row);
  }
  return grid;
}

const WIDTH = 27, HEIGHT = 13;
const colliders = buildGrid(WIDTH, HEIGHT);

/* ---------- Construction des maisons (toutes en 3x2 : toit + façade/porte) ---------- */
function buildHouse(house, xs, y) {
  house.x = xs; house.y = y; house.width = 3;
  // toit (3 tuiles)
  colliders[y][xs]     = house.roofCode;
  colliders[y][xs + 1] = house.roofCode;
  colliders[y][xs + 2] = house.roofCode;
  // façade + porte
  colliders[y + 1][xs]     = house.facadeCode;
  colliders[y + 1][xs + 1] = house.doorCode;
  colliders[y + 1][xs + 2] = house.facadeCode;
}
GAMES.forEach((g, i) => buildHouse(g, HOUSE_X[i], 1));
EXTRA_HOUSES.forEach(e => {
  if (e.key === "bar") return; // le bar a une disposition inversée, gérée à part ci-dessous
  buildHouse(e, e.x, e.y);
});

/* Bar : entrée sur la rangée du HAUT (accès direct depuis le boulevard, par un
   chemin qui descend d'en haut), avec une rangée de façades pleine en dessous
   pour former un vrai bâtiment 3x2. */
{
  const bar = EXTRA_HOUSES.find(e => e.key === "bar");
  bar.width = 3;
  colliders[bar.y][bar.x]     = bar.facadeCode;
  colliders[bar.y][bar.x + 1] = bar.doorCode;
  colliders[bar.y][bar.x + 2] = bar.facadeCode;
  colliders[bar.y + 1][bar.x]     = bar.facadeCode;
  colliders[bar.y + 1][bar.x + 1] = bar.facadeCode;
  colliders[bar.y + 1][bar.x + 2] = bar.facadeCode;
}

/* ---------- Allées en tapis rouge ---------- */
const CARPET = 2;
const doorXs = GAMES.map((g, i) => HOUSE_X[i] + 1); // [5, 10, 16, 21]

// une allée verticale sous chaque porte des jeux (jusqu'à la rangée du bas des maisons annexes)
doorXs.forEach(dx => {
  for (let y = 3; y <= 7; y++) colliders[y][dx] = CARPET;
});
// un grand boulevard horizontal qui relie toutes les allées
for (let x = 2; x <= 24; x++) colliders[5][x] = CARPET;

// prolongement des allées de Blackjack (5) et Machines à sous (21) jusqu'à la rangée
// des maisons latérales, pour rejoindre future-left / future-right
colliders[8][5] = CARPET;
colliders[8][21] = CARPET;
for (let x = 3; x <= 4; x++) colliders[8][x] = CARPET;   // vers future-left (porte en x=3)
for (let x = 22; x <= 23; x++) colliders[8][x] = CARPET; // vers future-right (porte en x=23)

// prolongement des allées de Roulette (10) et Poker (16) jusqu'à la rangée du bas
for (let y = 8; y <= 10; y++) { colliders[y][10] = CARPET; colliders[y][16] = CARPET; }
// petits raccords pour rejoindre les portes de future-bottom-1 (8) et future-bottom-2 (18)
for (let x = 8; x <= 9; x++) colliders[10][x] = CARPET;   // vers future-bottom-1
for (let x = 17; x <= 18; x++) colliders[10][x] = CARPET; // vers future-bottom-2

// Accès direct au Bar depuis le boulevard central (entrée par le dessus, comme avant)
for (let y = 6; y <= 7; y++) colliders[y][13] = CARPET;

/* ---------- Décorations ---------- */
const DECO = {
  TREE: 3,
  LAMP: 4,
  FOUNTAIN: 5,
  SLOT: 6,
};
const decoSpots = [
  [2, 3, DECO.TREE], [7, 3, DECO.TREE], [19, 3, DECO.TREE], [24, 3, DECO.TREE],
  [5, 11, DECO.TREE], [21, 11, DECO.TREE],
  [12, 4, DECO.SLOT], [14, 4, DECO.SLOT],
  [13, 4, DECO.FOUNTAIN],
];
decoSpots.forEach(([x, y, code]) => { colliders[y][x] = code; });

/* ---------- Table des types de tuiles ---------- */
const tileTypes = {
  0: { collide: false, kind: "floor" },
  1: { collide: true,  kind: "wall" },
  [CARPET]: { collide: false, kind: "carpet" },
  [DECO.TREE]:     { collide: true, kind: "deco", image: DECO_IMAGES.plant },
  [DECO.LAMP]:     { collide: true, kind: "deco", icon: "💡" },
  [DECO.FOUNTAIN]: { collide: true, kind: "deco", icon: "⛲" },
  [DECO.SLOT]:     { collide: true, kind: "deco", image: DECO_IMAGES.slot },
};
function registerHouseTypes(house) {
  tileTypes[house.doorCode] = {
    collide: false, kind: "door", house: house.key, locked: !!house.locked,
    icon: house.icon, label: house.name,
    text: house.locked ? `${house.name}...` : `Entrée : ${house.name}`,
    effect: house.locked ? null : () => enterHouse(house.href),
  };
  tileTypes[house.roofCode] = {
    collide: true, kind: "roof", house: house.key, icon: house.icon, locked: !!house.locked,
  };
  tileTypes[house.facadeCode] = {
    collide: true, kind: "facade", house: house.key, locked: !!house.locked,
  };
}
ALL_HOUSES.forEach(registerHouseTypes);

/* ---------- Rendu de la grille ---------- */
mapEl.style.width = `${WIDTH * TILE}px`;
mapEl.style.height = `${HEIGHT * TILE}px`;
tilesetEl.style.width = `${WIDTH * TILE}px`;
tilesetEl.style.height = `${HEIGHT * TILE}px`;

const ALL_PLACES = ALL_HOUSES;

for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const code = colliders[y][x];
    const type = tileTypes[code];
    const div = document.createElement('div');
    div.className = `tile ${type.kind}`;
    if (type.house) div.classList.add(`house-${type.house}`);
    if (type.locked) div.classList.add('locked');
    div.style.left = `${x * TILE}px`;
    div.style.top = `${y * TILE}px`;

    // Maison avec image dédiée : on étale un seul visuel (192x128 pour une
    // largeur 3) sur les tuiles toit+façade, comme un spritesheet découpé.
    const place = type.house ? ALL_PLACES.find(p => p.key === type.house) : null;
    const houseImg = place ? HOUSE_IMAGES[place.key] : null;
    if (houseImg) {
      const dx = x - place.x;
      const dy = y - place.y;
      div.classList.add('has-image');
      div.style.backgroundImage = `url("${HOUSE_IMAGE_BASE}${houseImg}")`;
      div.style.backgroundSize = `${place.width * TILE}px ${2 * TILE}px`;
      div.style.backgroundPosition = `${-dx * TILE}px ${-dy * TILE}px`;
    }

    if (type.kind === "door") {
      const iconHtml = houseImg ? '' : `<span class="icon">${type.icon}</span>`;
      div.innerHTML = `<span class="label">${type.label}</span>${iconHtml}`;
    } else if (type.kind === "roof") {
      const centerX = place.x + Math.floor(place.width / 2);
      div.innerHTML = (!houseImg && x === centerX) ? `<span class="icon">${type.icon}</span>` : '';
    } else if (type.kind === "floor") {
      div.classList.add('has-image');
      div.style.backgroundImage = `url("${CARPET_IMAGE}")`;
      div.style.backgroundSize = `${TILE}px ${TILE}px`;
    } else if (type.kind === "deco") {
      if (type.image) {
        div.classList.add('has-image', 'deco-image');
        div.style.backgroundImage = `url("${DECO_IMAGE_BASE}${type.image}")`;
        div.style.backgroundSize = 'contain';
        div.style.backgroundRepeat = 'no-repeat';
        div.style.backgroundPosition = 'center bottom';
        div.style.imageRendering = 'pixelated';
      } else {
        div.innerHTML = `<span class="icon">${type.icon}</span>`;
      }
    }
    mapEl.appendChild(div);
  }
}


/* ---------- État du joueur ---------- */
const SPAWN_DEFAULT = { x: 13, y: 5 };
const POS_KEY = 'croissantage_lobby_pos';

function loadSavedPos() {
  try {
    const raw = sessionStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      Number.isInteger(p.x) && Number.isInteger(p.y) &&
      p.x >= 0 && p.y >= 0 && p.x < WIDTH && p.y < HEIGHT &&
      !getTile(p.x, p.y).collide
    ) return p;
  } catch (e) { /* ignore, on repart du spawn par défaut */ }
  return null;
}

function savePos() {
  try {
    sessionStorage.setItem(POS_KEY, JSON.stringify({ x: currPos.x, y: currPos.y }));
  } catch (e) { /* stockage indisponible, tant pis */ }
}

const currPos = loadSavedPos() || { ...SPAWN_DEFAULT };
const control = { moving: "idle", lastMoving: "idle" };

// délai entre chaque case parcourue (vitesse de marche)
const delay = 220;
let fixedUpdate = null;
// délai entre chaque frame de sprite (2x plus rapide que le pas)
let animUpdate = null;
let transitioning = false;

/* directions : axe de déplacement + ligne du spritesheet (--player-sprite-v) */
const directions = {
  down:  { axis: { x: 0, y: 1 },  sprite: 0 },
  left:  { axis: { x: -1, y: 0 }, sprite: -1 },
  right: { axis: { x: 1, y: 0 },  sprite: -2 },
  up:    { axis: { x: 0, y: -1 }, sprite: -3 },
};

/* cycle de frames de marche : pied gauche / centre / pied droit / centre */
const spriteFrames = [1, 0, -1, 0];
let currSprite = 1;

function updatePlayerPosition() {
  root.style.setProperty('--player-x', `${currPos.x * TILE}`);
  root.style.setProperty('--player-y', `${currPos.y * TILE}`);
}

// Applique le skin choisi (sauvegardé via skins.js) avant le premier rendu,
// pour éviter tout flash du skin par défaut.
if (typeof Skins !== 'undefined') {
  // Le chemin est utilisé dans une variable CSS consommée par lobby.css :
  // il se résout donc relativement à css/lobby.css (d'où le "../"), pas à
  // lobby.html — même logique que le url() de secours dans lobby.css.
  const skinUrl = Skins.urlFor(Skins.getCurrentId(), '../');
  root.style.setProperty('--player-skin-url', `url("${skinUrl}")`);
}

// Placement initial sans animation : sinon le joueur glisse depuis le
// spawn par défaut jusqu'à la position restaurée (effet "téléportation").
player.style.transition = 'none';
updatePlayerPosition();
void player.offsetHeight; // force le navigateur à appliquer la position avant de réactiver la transition
requestAnimationFrame(() => {
  player.style.transition = '';
});
setSpriteDirection('down');

function setSpriteDirection(direction) {
  root.style.setProperty('--player-sprite-v', directions[direction].sprite);
}

function walkAnimation() {
  currSprite = (currSprite + 1) % 4;
  root.style.setProperty('--player-sprite-h', spriteFrames[currSprite]);
}

function instantStop() {
  currSprite = 1;
  root.style.setProperty('--player-sprite-h', 0);
  if (fixedUpdate != null) { clearInterval(fixedUpdate); fixedUpdate = null; }
  if (animUpdate != null) { clearInterval(animUpdate); animUpdate = null; }
}

function getTile(x, y) {
  if (x < 0 || y < 0 || y >= colliders.length || x >= colliders[0].length) return tileTypes[1];
  return tileTypes[colliders[y][x]];
}

function showText(t) {
  if (t == null) {
    text.classList.remove('show');
    text.innerText = '';
    return;
  }
  text.classList.add('show');
  text.innerText = t;
}

function enterHouse(href) {
  if (transitioning) return;
  transitioning = true;
  savePos();
  stopAllMovement();
  player.classList.add('fade-out');
  mapEl.style.transition = 'opacity 250ms linear';
  mapEl.style.opacity = 0;
  setTimeout(() => { window.location.href = href; }, 320);
}

function stopAllMovement() {
  control.moving = "idle";
  instantStop();
  if (followUpdate) { clearInterval(followUpdate); followUpdate = null; pathFind.clearPath(); }
}

function setMove(direction) {
  if (transitioning) return;
  if (control.moving === direction) return;

  control.moving = direction;
  setSpriteDirection(direction);

  if (fixedUpdate == null) {
    const nextTile = getTile(currPos.x + directions[direction].axis.x, currPos.y + directions[direction].axis.y);
    showText(nextTile.text);

    fixedUpdate = setInterval(move, delay);
    animUpdate = setInterval(walkAnimation, delay / 2);
    walkAnimation();
    move();
  }
}

function setStop(direction) {
  if (control.moving === direction) control.moving = "idle";
}

function move() {
  if (transitioning) return;

  if (control.moving === "idle") {
    instantStop();
    if (control.lastMoving !== "idle") {
      const nextTile = getTile(currPos.x + directions[control.lastMoving].axis.x, currPos.y + directions[control.lastMoving].axis.y);
      showText(nextTile.text);
      control.lastMoving = "idle";
    }
    return;
  }

  setSpriteDirection(control.moving);

  const axis = directions[control.moving].axis;
  const next = getTile(currPos.x + axis.x, currPos.y + axis.y);

  if (next.collide) {
    if (next.kind !== "wall") showText(next.text);
    instantStop();
    return;
  }

  currPos.x += axis.x;
  currPos.y += axis.y;
  updatePlayerPosition();
  savePos();

  if (next.text) showText(next.text); else showText(null);
  if (next.effect) next.effect();

  control.lastMoving = control.moving;
}

/* ---------- Clavier ---------- */
window.addEventListener('keydown', (e) => {
  if (followUpdate != null) { clearInterval(followUpdate); followUpdate = null; pathFind.clearPath(); }
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'z' || k === 'arrowup') setMove('up');
  else if (k === 'd' || k === 'arrowright') setMove('right');
  else if (k === 'a' || k === 'q' || k === 'arrowleft') setMove('left');
  else if (k === 's' || k === 'arrowdown') setMove('down');
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'z' || k === 'arrowup') setStop('up');
  else if (k === 'd' || k === 'arrowright') setStop('right');
  else if (k === 'a' || k === 'q' || k === 'arrowleft') setStop('left');
  else if (k === 's' || k === 'arrowdown') setStop('down');
});

/* ---------- D-pad tactile ---------- */
document.querySelectorAll('#dpad button').forEach(btn => {
  const dir = btn.dataset.dir;
  const start = (ev) => { ev.preventDefault(); setMove(dir); };
  const stop = (ev) => { ev.preventDefault(); setStop(dir); };
  btn.addEventListener('mousedown', start);
  btn.addEventListener('touchstart', start);
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', stop);
  btn.addEventListener('touchend', stop);
});

/* ============================================================
   Pathfinding (Dijkstra) pour le déplacement au clic/tap
   ============================================================ */
class PriorityQueue {
  constructor() { this.items = []; }
  enqueue(element, priority) {
    const q = { element, priority };
    let added = false;
    for (let i = 0; i < this.items.length; i++) {
      if (q.priority < this.items[i].priority) { this.items.splice(i, 0, q); added = true; break; }
    }
    if (!added) this.items.push(q);
  }
  dequeue() { return this.items.shift(); }
  isEmpty() { return this.items.length === 0; }
}

class PathFind {
  constructor(grid, tileTypes) {
    this.grid = grid;
    this.tileTypes = tileTypes;
    this.pathTiles = [];

    const target = document.createElement('div');
    target.className = 'player-target';
    target.style.display = 'none';
    this.pathTiles.push(target);
    mapEl.appendChild(target);

    for (let i = 1; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'player-path';
      p.style.display = 'none';
      this.pathTiles.push(p);
      mapEl.appendChild(p);
    }

    this.graph = this.#buildGraph();
  }

  getId(c) { return c.y * this.grid[0].length + c.x; }
  getCord(id) {
    const w = this.grid[0].length;
    return { x: id % w, y: Math.floor(id / w) };
  }
  #tileAt(x, y) {
    if (x < 0 || y < 0 || y >= this.grid.length || x >= this.grid[0].length) return this.tileTypes[1];
    return this.tileTypes[this.grid[y][x]];
  }
  #buildGraph() {
    const graph = {};
    for (let y = 0; y < this.grid.length; y++) {
      for (let x = 0; x < this.grid[y].length; x++) {
        const id = this.getId({ x, y });
        const vertex = { id, x, y, distance: Infinity, parent: null, visited: false, neighbors: [] };
        graph[id] = vertex;
        const deltas = [[-1,0],[1,0],[0,-1],[0,1]];
        for (const [dx, dy] of deltas) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || ny >= this.grid.length || nx >= this.grid[y].length) continue;
          if (!this.#tileAt(nx, ny).collide) vertex.neighbors.push(this.getId({ x: nx, y: ny }));
        }
      }
    }
    return graph;
  }
  #dijkstra(start) {
    const nodes = JSON.parse(JSON.stringify(this.graph));
    const queue = new PriorityQueue();
    const startId = this.getId(start);
    nodes[startId].distance = 0;
    queue.enqueue(startId, 0);
    while (!queue.isEmpty()) {
      const current = nodes[queue.dequeue().element];
      for (const nId of current.neighbors) {
        const nVertex = nodes[nId];
        const d = current.distance + 1;
        if (d < nVertex.distance) {
          nVertex.distance = d;
          nVertex.parent = current.id;
          if (!nVertex.visited) { queue.enqueue(nVertex.id, d); nVertex.visited = true; }
        }
      }
    }
    return nodes;
  }
  getPath(initial, final) {
    const start = this.getId(initial);
    let end = this.getId(final);
    const graph = this.#dijkstra(initial);

    if (!graph[end] || (graph[end].parent == null && end !== start)) return [];

    const path = [];
    let current = end;
    while (current !== start) {
      path.unshift(current);
      const v = graph[current];
      if (!v || v.parent == null) return [];
      current = v.parent;
    }
    path.unshift(start);
    return path;
  }
  drawPath(path) {
    this.clearPath();
    for (let i = 1; i < path.length; i++) {
      const tile = this.pathTiles[path.length - i];
      if (!tile) continue;
      const cord = this.getCord(path[i]);
      tile.style.left = `${cord.x * TILE}px`;
      tile.style.top = `${cord.y * TILE}px`;
      tile.style.display = 'block';
    }
  }
  clearPath() { this.pathTiles.forEach(t => t.style.display = 'none'); }
}

const pathFind = new PathFind(colliders, tileTypes);

let followUpdate = null;
function followPath(path) {
  if (path.length < 2) return;
  const cords = path.map(id => pathFind.getCord(id));
  let i = 0;
  followUpdate = setInterval(() => {
    i++;
    if (i >= cords.length || transitioning) {
      clearInterval(followUpdate);
      followUpdate = null;
      pathFind.clearPath();
      control.moving = "idle";
      return;
    }
    const c = cords[i];
    if (c.x < currPos.x) setMove("left");
    else if (c.x > currPos.x) setMove("right");
    else if (c.y < currPos.y) setMove("up");
    else if (c.y > currPos.y) setMove("down");
    pathFind.clearPath();
  }, delay);
}

document.getElementById('tileset').addEventListener('click', (e) => {
  if (transitioning) return;
  const rect = document.getElementById('tileset').getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / TILE);
  const y = Math.floor((e.clientY - rect.top) / TILE);
  if (x < 0 || y < 0 || y >= HEIGHT || x >= WIDTH) return;

  if (followUpdate) { clearInterval(followUpdate); followUpdate = null; }
  control.moving = "idle";
  instantStop();

  const path = pathFind.getPath(currPos, { x, y });
  pathFind.drawPath(path);
  followPath(path);
});