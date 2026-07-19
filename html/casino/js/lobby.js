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

const TILE = 64;

/* ---------- Définition des jeux / maisons ---------- */
/* Chaque jeu a : une porte (walkable + effet), un toit (bloquant, décoratif)
   et des façades (bloquantes) de part et d'autre de la porte. */
const GAMES = [
  { key: "blackjack", name: "Blackjack",        icon: "🃏", href: "./html/blackjack.html" },
  { key: "roulette",  name: "Roulette",         icon: "🎡", href: "./html/roulette.html" },
  { key: "poker",     name: "Poker",            icon: "♠️", href: "./html/poker.html" },
  { key: "slots",     name: "Machines à sous",  icon: "🎰", href: "./html/columbus.html" },
];
GAMES.forEach((g, i) => {
  g.doorCode = 10 + i;   // 10-13
  g.roofCode = 20 + i;   // 20-23
  g.facadeCode = 30 + i; // 30-33
});

/* ---------- Lieux annexes (petite enseigne à plat, sans étage) ---------- */
/* Toutes les cases de la largeur sont des portes visibles (bordure + icône + label). */
const EXTRAS = [
  { key: "bar", name: "Bar", icon: "🍸", href: "./html/bar.html", x: 10, y: 10, width: 2 },
];
EXTRAS.forEach((e, i) => {
  e.doorCode = 40 + i; // 40-...
});

/* Position (colonne de départ, largeur 3) de chaque maison sur la grille */
const HOUSE_X = [2, 7, 12, 17];

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

const WIDTH = 22, HEIGHT = 13;
const colliders = buildGrid(WIDTH, HEIGHT);

/* ---------- Construction des maisons ---------- */
GAMES.forEach((g, i) => {
  const xs = HOUSE_X[i];
  g.x = xs; g.y = 3; g.width = 3;
  // toit (rangée y=2, 3 tuiles)
  colliders[2][xs]     = g.roofCode;
  colliders[2][xs + 1] = g.roofCode;
  colliders[2][xs + 2] = g.roofCode;
  // façade + porte (rangée y=3)
  colliders[3][xs]     = g.facadeCode;
  colliders[3][xs + 1] = g.doorCode;
  colliders[3][xs + 2] = g.facadeCode;
});

/* ---------- Allées en tapis rouge ---------- */
const CARPET = 2;
const doorXs = GAMES.map((g, i) => HOUSE_X[i] + 1); // [3, 8, 13, 18]

// une allée verticale sous chaque porte
doorXs.forEach(dx => {
  for (let y = 4; y <= 8; y++) colliders[y][dx] = CARPET;
});
// un grand boulevard horizontal qui relie toutes les allées
for (let x = 2; x <= 19; x++) colliders[6][x] = CARPET;
// une allée centrale qui redescend vers le point de spawn
for (let y = 6; y <= 9; y++) colliders[y][10] = CARPET;

/* ---------- Décorations ---------- */
const DECO = {
  TREE: 3,
  LAMP: 4,
  FOUNTAIN: 5,
};
const decoSpots = [
  [5, 8, DECO.TREE], [9, 4, DECO.TREE], [15, 4, DECO.TREE], [19, 8, DECO.TREE],
  [6, 10, DECO.TREE], [16, 10, DECO.TREE],
  [9, 5, DECO.LAMP], [11, 5, DECO.LAMP],
  [10, 5, DECO.FOUNTAIN],
];
decoSpots.forEach(([x, y, code]) => { colliders[y][x] = code; });

/* ---------- Lieux annexes sur la grille ---------- */
EXTRAS.forEach(e => {
  for (let dx = 0; dx < e.width; dx++) colliders[e.y][e.x + dx] = e.doorCode;
});

/* ---------- Table des types de tuiles ---------- */
const tileTypes = {
  0: { collide: false, kind: "floor" },
  1: { collide: true,  kind: "wall" },
  [CARPET]: { collide: false, kind: "carpet" },
  [DECO.TREE]:     { collide: true, kind: "deco", icon: "🌴" },
  [DECO.LAMP]:     { collide: true, kind: "deco", icon: "💡" },
  [DECO.FOUNTAIN]: { collide: true, kind: "deco", icon: "⛲" },
};
GAMES.forEach(g => {
  tileTypes[g.doorCode] = {
    collide: false, kind: "door", house: g.key,
    icon: g.icon, label: g.name, text: `Entrée : ${g.name}`,
    effect: () => enterHouse(g.href),
  };
  tileTypes[g.roofCode] = {
    collide: true, kind: "roof", house: g.key, icon: g.icon,
  };
  tileTypes[g.facadeCode] = {
    collide: true, kind: "facade", house: g.key,
  };
});
EXTRAS.forEach(e => {
  tileTypes[e.doorCode] = {
    collide: false, kind: "door", house: e.key,
    icon: e.icon, label: e.name, text: `Entrée : ${e.name}`,
    effect: () => enterHouse(e.href),
  };
});

/* ---------- Rendu de la grille ---------- */
mapEl.style.width = `${WIDTH * TILE}px`;
mapEl.style.height = `${HEIGHT * TILE}px`;

const ALL_PLACES = [...GAMES, ...EXTRAS];

for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const code = colliders[y][x];
    const type = tileTypes[code];
    const div = document.createElement('div');
    div.className = `tile ${type.kind}`;
    if (type.house) div.classList.add(`house-${type.house}`);
    div.style.left = `${x * TILE}px`;
    div.style.top = `${y * TILE}px`;

    if (type.kind === "door") {
      div.innerHTML = `<span class="label">${type.label}</span><span class="icon">${type.icon}</span>`;
    } else if (type.kind === "roof") {
      const place = ALL_PLACES.find(p => p.key === type.house);
      const centerX = place.x + Math.floor(place.width / 2);
      div.innerHTML = (x === centerX) ? `<span class="icon">${type.icon}</span>` : '';
    } else if (type.kind === "deco") {
      div.innerHTML = `<span class="icon">${type.icon}</span>`;
    }
    mapEl.appendChild(div);
  }
}


/* ---------- État du joueur ---------- */
const SPAWN_DEFAULT = { x: 10, y: 6 };
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
  up:    { axis: { x: 0, y: -1 }, sprite: -1 },
  left:  { axis: { x: -1, y: 0 }, sprite: -2 },
  right: { axis: { x: 1, y: 0 },  sprite: -3 },
};

/* cycle de frames de marche : pied gauche / centre / pied droit / centre */
const spriteFrames = [1, 0, -1, 0];
let currSprite = 1;

function updateMapPosition() {
  root.style.setProperty('--map-x', `${currPos.x * TILE}`);
  root.style.setProperty('--map-y', `${currPos.y * TILE}`);
}

// Placement initial sans animation : sinon la carte glisse depuis le
// centre par défaut jusqu'à la position restaurée (effet "téléportation").
mapEl.style.transition = 'none';
updateMapPosition();
void mapEl.offsetHeight; // force le navigateur à appliquer la position avant de réactiver la transition
requestAnimationFrame(() => {
  mapEl.style.transition = '';
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
  updateMapPosition();
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
  const x = Math.floor((e.clientX - rect.left) / TILE) + currPos.x;
  const y = Math.floor((e.clientY - rect.top) / TILE) + currPos.y;
  if (x < 0 || y < 0 || y >= HEIGHT || x >= WIDTH) return;

  if (followUpdate) { clearInterval(followUpdate); followUpdate = null; }
  control.moving = "idle";
  instantStop();

  const path = pathFind.getPath(currPos, { x, y });
  pathFind.drawPath(path);
  followPath(path);
});