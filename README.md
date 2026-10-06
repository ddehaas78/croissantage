# README.md — Croissantage : le Casino Secret

Ce fichier documente comment est construit le casino secret du site de croissantage,
pour que je/tu puisse(s) créer un **nouveau jeu** cohérent avec l'existant (thème,
structure de fichiers, conventions de code) sans avoir à redécouvrir l'architecture
à chaque fois.

⚠️ Aucun vrai argent : tout est en jetons fictifs (`Wallet`), stockés en `localStorage`.

Le but du projet est aussi **pédagogique** : comprendre comment marchent les jeux
de casino (probabilités, avantage de la maison, mécanismes qui poussent à rejouer).
Plusieurs jeux affichent donc leurs chances et leur retour théorique, et le
Distributeur (ATM) du lobby montre au joueur ses vraies statistiques.

---

## 1. Vue d'ensemble

Le joueur arrive sur `hihihi.html` (écran d'entrée), clique sur "Entrer au Casino",
et atterrit sur `lobby.html` : un petit village vu de dessus façon vieux Pokémon
(GBA/DS), où chaque jeu est une maison. Le joueur se déplace (clavier ZQSD/flèches)
et entre dans une maison pour lancer le jeu correspondant,
qui s'ouvre sur sa propre page HTML. Les deux **distributeurs (ATM)** près de la
fontaine s'utilisent comme une maison : on y entre en marchant contre (ou en
cliquant dessus) pour consulter ses statistiques (voir 5.4 et 7.3).

Deux ambiances visuelles cohabitent volontairement :
- **Le lobby** : pixel art rétro (police "Press Start 2P", palette bordeaux `#12070a`/or).
- **Les pages de jeu** : thème "casino chic" (or/bordeaux/émeraude, polices Cinzel + Poppins).

**Règles qui s'appliquent à toutes les pages de jeu :**
- **Aucune page ne défile** : tout doit tenir dans la fenêtre (`core/fit.js`, section 3).
- **Pas d'emoji dans les visuels des jeux d'arcade, du poker et du distributeur** :
  images (SVG/PNG dans `assets/`) ou formes CSS. Pièce = `.coin-icon`, icône de
  titre = `.title-icon` (section 8). Les anciens jeux de table gardent pour
  l'instant leurs emojis dans le titre et les messages.
- **Sons** sur chaque action, calés sur les animations (`core/sfx.js`).
- **Jetons cumulables** : cliquer 3 fois sur le jeton 100 = mise de 300 (section 4.5).

### Les jeux

| Maison / page | Dossier | Résumé |
|---|---|---|
| Blackjack | `games/blackjack/` | Sabot de 2 jeux, croupier tire jusqu'à 17, 3:2 sur blackjack |
| Roulette | `games/roulette/` | Roulette européenne (un zéro), table de mises complète |
| Poker | `games/poker/` | Texas Hold'em No Limit contre 4 bots (7.1) |
| Machines à sous | `games/columbus/` | Columbus Deluxe : 5 rouleaux, 10 lignes, Free Spins, Gamble |
| Baccara | `games/baccara/` | Punto Banco, paires, égalité |
| Bar | `games/bar/` | Cocktails (ivresse), choix du skin, caisses de personnages (7.2) |
| Arcade (hub) | `games/arcade/` | Carrousel : Fusée, Mines, Chicken Grill, Plinko, Craps (section 6) |
| Distributeur (ATM) | `games/atm/` | Relevé de compte / statistiques du joueur (7.3) |

---

## 2. Arborescence

```
/
├── hihihi.html          → écran d'entrée du site
├── lobby.html            → le village / plan du casino
├── README.md             → ce fichier
├── assets/
│   ├── columbus/          → sprites/cartes spécifiques au jeu Columbus
│   ├── misc/
│   │   ├── arcade/
│   │   │   ├── manette.svg     → icône du hub Arcade
│   │   │   ├── chicken/        → poulet, poulet-cuit, four, flammes, fumee, plan-de-travail (SVG)
│   │   │   ├── craps/des.svg
│   │   │   ├── fusee/fusee.png → sprite de la fusée (nez vers le HAUT)
│   │   │   ├── mine/           → diamant, bombe, explosion (SVG)
│   │   │   └── plinko/plinko.svg
│   │   ├── bar/            → image du barman
│   │   ├── batiment/        → une image par maison du lobby (toit+façade)
│   │   ├── lobby/           → sol/ (textures) et deco/ (plante, panneau, slot-deco.png = ATM)
│   │   └── poker/cartes.svg
│   └── player/             → spritesheets des skins jouables (grille 4x4)
├── boisson/               → une image par cocktail (utilisé par bar.js)
├── core/                  → tout le transverse (anciennement css/ + js/ à la racine)
│   ├── main.css             → variables globales, boutons, layout de base
│   ├── game-page.css        → habillage commun aux pages de jeu (topbar, .game-body, icônes, anti-scroll)
│   ├── game-stub.css        → écran "jeu pas encore prêt" (placeholder)
│   ├── drunk.css            → effet visuel d'ivresse (partagé)
│   ├── drunk.js             → niveau d'ivresse (transverse)
│   ├── lobby.css            → styles du village
│   ├── lobby.js             → logique du village (déplacement, portes, collisions, ATM)
│   ├── skins.js             → registre, rareté, possession et choix du skin joueur (transverse)
│   ├── topbar.js            → génère le bandeau du haut sur les pages de jeu (transverse)
│   ├── wallet.js            → solde de jetons (transverse)
│   ├── sfx.js               → tous les sons, synthétisés (transverse)
│   ├── stats.js             → statistiques du joueur, lues par le Distributeur (transverse)
│   └── fit.js               → réduit le jeu pour qu'il tienne dans la fenêtre (transverse)
└── games/
    ├── arcade/                → maison-menu regroupant des mini-jeux solo
    │   ├── arcade.html           → hub avec le carrousel de sélection
    │   ├── arcade.css
    │   ├── arcade.js
    │   ├── fusee/                → un sous-dossier par mini-jeu, trois niveaux sous la racine
    │   │   fusee.html
    │   │   fusee.css
    │   │   fusee.js
    │   ├── mine/
    │   ├── chicken/              → Chicken Grill (le dossier garde son ancien nom)
    │   ├── plinko/
    │   └── craps/
    ├── atm/                   → le Distributeur (statistiques), on y entre depuis les ATM du lobby
    └── <jeu>/                → un dossier par jeu (baccara, bar, blackjack, columbus, poker, roulette)
            <jeu>.html
            <jeu>.css
            <jeu>.js
```

**Changement important par rapport à l'ancienne structure** : il n'y a plus de
dossiers `css/` et `js/` séparés à la racine, ni de dossier `html/` commun. Tout
le transverse vit dans `core/`, et **chaque jeu a désormais son propre dossier**
sous `games/<jeu>/` contenant ses trois fichiers (`<jeu>.html`, `<jeu>.css`,
`<jeu>.js`) côte à côte, au lieu d'être éclatés dans `html/`, `css/`, `js/`.

**Convention de chemins (mise à jour)** : les pages de jeu vivent maintenant dans
`games/<jeu>/`, soit **deux niveaux** sous la racine (contre un seul niveau avant,
avec `html/<jeu>.html`). Tous leurs liens vers `core/`, `assets/`, `boisson/`
commencent donc désormais par `../../` (et non plus `../`). Le lobby et
`hihihi.html` restent à la racine, donc toujours pas de préfixe pour eux.

⚠️ Piège classique en migrant/créant un jeu : ne pas oublier de passer les chemins
de `../css/...`, `../js/...` à `../../core/...`, et `../assets/...` à `../../assets/...`.

**Cas particulier : maison-menu avec sous-jeux (ex. `games/arcade/`)** — le hub
lui-même (`arcade.html`) est à la même profondeur qu'un jeu classique (deux
niveaux, `../../core/...`), mais ses sous-jeux vivent **un niveau plus bas**,
dans `games/arcade/<jeu>/` (trois niveaux sous la racine). Depuis ces
sous-jeux, tous les chemins vers `core/`, `assets/`, `boisson/` commencent
donc par `../../../` (et non `../../`). Le hub, lui, n'a besoin de connaître
que le chemin relatif vers chaque sous-jeu (`./<jeu>/<jeu>.html`), pas leur
profondeur absolue.

Ce piège ne concerne pas que le HTML (`<link>`/`<script>`) : certains jeux
définissent aussi des **constantes de préfixe de chemin en JS** pour construire
des URLs dynamiquement vers `assets/`, `boisson/`, etc. (ex. `SKIN_ROOT_PREFIX`
dans `bar.js`, utilisée avec `Skins.urlFor()` — voir section 3). Ces constantes
suivent la même règle de profondeur (`../../` depuis `games/<jeu>/`, `../../../`
depuis `games/arcade/<jeu>/`), mais elles ne sont pas centralisées : chaque jeu
les définit lui-même, donc il faut penser à les vérifier dans le JS de chaque
jeu, pas seulement dans son HTML.

Autres jeux concernés : `SKIN_ROOT_PREFIX` dans `poker.js` et `atm.js`,
`ASSET_PATH` dans `chicken.js` et `mine.js`.

⚠️ Le dossier du Chicken Grill s'appelle toujours `chicken/` et celui des mines
`mine/` (sans "s") : les renommer casserait les liens (hub Arcade, stats).

---

## 3. Systèmes transverses (partagés par tous les jeux)

Ces fichiers (tous dans `core/`) doivent être inclus (dans cet ordre,
`wallet.js`/`drunk.js`/`skins.js` avant le script du jeu) sur **toute nouvelle
page de jeu** selon ses besoins. Ordre complet actuel :

```html
<script src="../../core/wallet.js"></script>
<script src="../../core/stats.js"></script>
<script src="../../core/topbar.js"></script>
<script src="../../core/fit.js"></script>
<script src="../../core/drunk.js"></script>
<script src="../../core/skins.js"></script>   <!-- seulement si le jeu affiche des skins -->
<script src="../../core/sfx.js"></script>
<script src="<jeu>.js"></script>
```
(`../../../` pour un sous-jeu de l'Arcade.)

### `core/wallet.js` → objet global `Wallet`
Solde de jetons fictifs, persisté en `localStorage`. API principale :
```js
Wallet.get()             // solde actuel
Wallet.canAfford(amount) // bool
Wallet.add(amount)
Wallet.subtract(amount)  // false si solde insuffisant, sinon débite et renvoie true
Wallet.recharge()        // remonte le solde si sous le seuil (voir RECHARGE_THRESHOLD)
Wallet.refreshUI()       // à appeler après avoir injecté du HTML avec data-wallet-balance
Wallet.onChange(fn)      // appelé à chaque changement de solde
```
Met à jour automatiquement tout élément `[data-wallet-balance]` et
`.topbar-balance` (flash animé) à chaque changement. Gère aussi les infobulles
`data-tooltip` de tout le site (affichage instantané, style casino).

`add`, `subtract` et `recharge` alimentent automatiquement `Stats` (voir
ci-dessous) : **les jeux n'ont rien à faire pour que l'argent misé / gagné soit
comptabilisé.**

### `core/stats.js` → objet global `Stats`
Statistiques du joueur, persistées en `localStorage` (`croissantage_stats_v1`),
affichées par le Distributeur (`games/atm/`, voir 7.3).
```js
Stats.round()              // à appeler au DÉBUT de chaque partie / tour / main
Stats.best(multiplicateur) // record de multiplicateur (fusée, mines, chicken, plinko...)
Stats.bar('cocktails' | 'remedies' | 'cases' | 'duplicates')
Stats.money('out' | 'in', montant) // appelé par wallet.js, pas par les jeux
Stats.recharge(montant)            // appelé par wallet.js
Stats.get() / Stats.reset()
```
Le jeu concerné est **déduit de l'adresse de la page** (`games/<jeu>/` ou
`games/arcade/<jeu>/`) : le nom du dossier sert d'identifiant. Le temps de jeu
est compté tout seul tant qu'une page est visible.

⚠️ Piège rencontré : une variable déclarée avec `const` au niveau global n'est
**pas** une propriété de `window`. `stats.js` fait donc explicitement
`window.Stats = Stats` pour que les tests `if (window.Stats)` fonctionnent.
Même chose à prévoir pour tout futur module testé via `window.X`.

### `core/sfx.js` → objet global `Sfx`
Tous les sons du site, **synthétisés en direct** avec la Web Audio API
(oscillateurs + bruit filtré) : aucun fichier audio. Ça permet de caler chaque
son au millième sur l'animation qu'il accompagne. Un bouton 🔊/🔇 (`.sfx-toggle`)
est injecté automatiquement dans le bandeau (choix mémorisé). Plus le joueur est
ivre, plus les sons se désaccordent.

Sons génériques :
```js
Sfx.click() / Sfx.denied() / Sfx.chip() / Sfx.chipStack() / Sfx.chipsSweep()
Sfx.cardSlide() / Sfx.cardFlip() / Sfx.coins(n, durée) / Sfx.cashRegister()
Sfx.win(1..4)              // jingle : 1 petit gain ... 4 jackpot
Sfx.winFor(rendu, mise)    // choisit le niveau tout seul (rendu = mise -> son "égalité")
Sfx.lose() / Sfx.push() / Sfx.whoosh(durée, volume)
```
Plus des sons propres à chaque jeu : `rouletteRoll` / `fretTick` / `ballSettle`,
`reelSpin` / `reelStop` / `anticipation` / `lineHit` / `fanfare` / `coinFlip`,
`ignition` / `engine` / `milestone` / `explosion`, `arm` / `gem`,
`cluck` / `hop` / `land` / `burn` / `ovenDing`, `drop` / `peg` / `plinkoLand`,
`diceThrow` / `pointOn`, `knock`, `pour` / `clink` / `sip`,
`caseTick` / `caseReveal`, `swipe` / `select` (voir les commentaires de `sfx.js`).

Principes à garder pour un nouveau jeu :
- un son à **chaque** action (jeton, carte, lancer...) et à chaque résultat ;
- le caler sur l'animation (même durée, ou déclenché au moment exact où l'objet
  se pose ; à la roulette, les "tics" suivent même la vraie position de la bille) ;
- **pas de son de victoire si le joueur récupère juste sa mise** (`winFor` joue
  alors un son neutre). Les vraies machines le font exprès ("pertes déguisées
  en gains") : ici on montre l'honnête.

### `core/fit.js` — zéro scroll
Si le contenu d'un jeu est plus haut que la place sous le bandeau, `fit.js` le
réduit proportionnellement (propriété CSS `zoom` sur le premier enfant de
`.game-body`). Sur un grand écran rien ne change. Recalcul automatique au
redimensionnement et quand le contenu change de taille. `game-page.css` met
`overflow: hidden` sur `html`, `body` et `.game-body`, et étire le conteneur
`#<jeu>` sur toute la hauteur (`body > :has(> .game-body)`).

⚠️ Avec ce zoom, **`getBoundingClientRect()` renvoie des tailles déjà
zoomées**. Pour dimensionner un `<canvas>`, utiliser `clientWidth` /
`clientHeight` (voir `setupCanvas()` dans `fusee.js`), sinon le zoom est
appliqué deux fois.

Le **poker** n'utilise pas `fit.js` : il a sa propre mise en page plein écran
(table dessinée à taille fixe 1000×520 puis mise à l'échelle, `fitLayout()`).

### `core/drunk.js` → objet global `Drunk`
Niveau d'ivresse global (0-100), persisté, redescend tout seul dans le temps
(2 points / 4s), applique des classes `drunk-1` à `drunk-4` sur `<body>` (gérées
visuellement par `drunk.css` : flou + tangage léger). API :
```js
Drunk.addDose(amount)     // amount peut être négatif (café, eau...)
Drunk.getLevel()
Drunk.stateLabel(level)   // "Sobre" / "Pompette" / "Éméché" / "Ivre" / "Complètement bourré"
Drunk.onChange(fn)
```
Inclure `<link rel="stylesheet" href="../../core/drunk.css">` et
`<script src="../../core/drunk.js">` sur **toutes** les pages de jeu, même celles
qui ne servent pas d'alcool — l'effet doit suivre le joueur partout tant qu'il
n'est pas redescendu à 0.

### `core/skins.js` → objet global `Skins`
Registre des skins jouables (fichiers dans `assets/player/`, grille spritesheet 4x4).
```js
Skins.getAll()
Skins.getCurrentId()
Skins.setCurrentId(id)
Skins.urlFor(id, rootPrefix)  // rootPrefix: '' à la racine, '../../' depuis /games/<jeu>/
Skins.getSkinById(id)
Skins.isOwned(id) / Skins.getOwnedIds()
Skins.unlock(id)              // true si nouveau, false si doublon
Skins.rarityOf(id) / Skins.RARITIES  // commun, rare, epique, legendaire, mythique
```
Utile seulement si le nouveau jeu affiche/permet de changer le skin (comme le
bar, le poker pour les avatars des bots, ou le Distributeur).

**Rareté et possession** : chaque skin a une `rarity` ; seuls les skins
possédés peuvent être équipés (`setCurrentId` refuse les autres). On les
débloque dans les caisses du bar (7.2). `starter: true` = possédé d'office
(Brendan). Pour ajouter un skin : une entrée dans `SKINS` avec sa rareté, il
entre automatiquement dans la caisse.

Dans un spritesheet, la frame "au repos, face caméra" s'obtient avec
`background-size: 400% 400%; background-position: 33.333% 0%`.

Le `rootPrefix` doit correspondre à la profondeur réelle du dossier du jeu par
rapport à la racine (`../../` depuis `games/<jeu>/`). Ce n'est **pas** déduit
automatiquement par `skins.js` : chaque jeu qui affiche des skins définit en
général sa propre constante en haut de son fichier JS (ex. `SKIN_ROOT_PREFIX`
dans `bar.js`) qu'il passe ensuite à `Skins.urlFor()`.

### `core/topbar.js`
Génère automatiquement le bandeau du haut (retour lobby, titre, bouton recharge,
solde) sur tout élément `[data-topbar]`. **Ne pas écrire le HTML du bandeau à la
main** : il suffit de placer la balise avec les bons attributs :
```html
<div class="game-topbar" data-topbar
     data-title="🎡 Roulette"
     data-back="../../lobby.html"                     <!-- optionnel, défaut : /html/casino/lobby.html -->
     data-recharge-label="+ Recharger"                <!-- optionnel -->
     data-recharge-class="btn btn-ghost recharge-btn"><!-- optionnel -->
</div>
<script src="../../core/topbar.js"></script>
```

`data-title` est injecté tel quel en HTML : on peut y mettre une image devant
le titre (`data-title='<img class="title-icon" src="..." alt=""> Mon Jeu'`).

⚠️ Le défaut réel de `data-back` dans `topbar.js` est le chemin absolu
`/html/casino/lobby.html` (valable quand le site est servi depuis la racine du
repo). En local ou ailleurs, mieux vaut toujours préciser `data-back`.

⚠️ `data-back` n'est **pas déduit automatiquement** de l'arborescence : pour un
jeu classique le défaut convient (`../../lobby.html`), mais pour un **sous-jeu
d'un hub** (ex. `games/arcade/fusee/`), il faut explicitement mettre
`data-back="../arcade.html"` pour revenir au menu du hub plutôt qu'au lobby.
Penser à le faire sur **chaque** sous-jeu du hub (fusée, mines, chicken...),
pas seulement le premier créé.

Le style visuel du bandeau (fond dégradé marron `#3a1608`→`#1c0a04`, bordure
`var(--gold)`, glow doré, titre en `var(--gold-bright)`) est défini dans
`core/game-page.css` (`.game-topbar`, `.game-title`, `.topbar-balance`) — voir
section 8. Comme `topbar.js` et `game-page.css` sont communs à tous les jeux,
changer ce style à un seul endroit le répercute automatiquement partout.

---

## 4. Anatomie d'un jeu — exemple de référence : Roulette

Chaque jeu suit le même trio de fichiers, désormais réunis dans un seul dossier
**`games/<jeu>/<jeu>.html` + `games/<jeu>/<jeu>.css` + `games/<jeu>/<jeu>.js`**.
La roulette (`games/roulette/`) est l'exemple le plus complet à suivre.

### 4.1 `games/roulette/roulette.html` — le squelette de page

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roulette - Casino</title>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../../core/main.css">
  <link rel="stylesheet" href="../../core/game-page.css">
  <link rel="stylesheet" href="../../core/drunk.css">
  <link rel="stylesheet" href="roulette.css">
</head>
<body>

  <div class="game-topbar" data-topbar data-title="🎡 Roulette"></div>

  <div id="roulette">
    <div class="game-body"></div>
  </div>

  <script src="../../core/wallet.js"></script>
  <script src="../../core/stats.js"></script>
  <script src="../../core/topbar.js"></script>
  <script src="../../core/fit.js"></script>
  <script src="../../core/drunk.js"></script>
  <script src="../../core/sfx.js"></script>
  <script src="roulette.js"></script>
</body>
</html>
```

**Points à reproduire pour un nouveau jeu** :
- `<body>` quasi vide : un `<div class="game-topbar" data-topbar ...>` + un conteneur
  racine `id="<jeu>"` contenant un `<div class="game-body"></div>` **vide**.
- Tout le contenu du jeu est **injecté en JS** via `.innerHTML`, jamais écrit en dur
  dans le HTML (voir 4.3).
- Ordre des scripts : `../../core/wallet.js` → `../../core/stats.js` →
  `../../core/topbar.js` → `../../core/fit.js` → `../../core/drunk.js` →
  (`../../core/skins.js` si besoin) → `../../core/sfx.js` → `<jeu>.js` (sans
  préfixe, car dans le même dossier).
- Le conteneur racine `#<jeu>` est automatiquement étiré sur toute la hauteur
  par `game-page.css` : indispensable pour que `fit.js` puisse mesurer la place.
- CSS : `../../core/main.css` puis `../../core/game-page.css` puis
  `../../core/drunk.css` puis `<jeu>.css` en dernier — ce dernier **sans**
  préfixe puisqu'il est désormais colocalisé dans le même dossier que le HTML
  (pour pouvoir surcharger si besoin).

### 4.2 `games/roulette/roulette.css` — conventions de style

- Toutes les couleurs viennent des **variables CSS de `core/main.css`** (`var(--gold)`,
  `var(--panel)`, `var(--emerald-bright)`, `var(--cream-dim)`, etc.) — jamais de
  couleur en dur qui casse le thème.
- Classes préfixées par les initiales du jeu pour éviter les collisions :
  `rl-*` pour roulette, `bar-*` pour le bar. **Un nouveau jeu doit préfixer ses
  classes de la même façon** (ex : `bj-*` pour blackjack). Préfixes utilisés :
  `rl-` roulette, `bj-` blackjack, `bc-` baccara, `cd-` columbus, `bar-` bar,
  `ac-` arcade, `fs-` fusée, `mn-` mines, `ch-` chicken, `pk-` plinko,
  `cr-` craps, `po-` poker, `atm-` distributeur.
- `.game-msg` (message de statut), `.msg-good` / `.msg-bad` / `.msg-warn` sont des
  classes génériques réutilisables pour les retours au joueur.
- Un bloc `@media (max-width: 860px)` puis `@media (max-width: 480px)` en fin de
  fichier pour le responsive (empilement vertical, tailles réduites).

**Style du panneau de mise** : le panneau (`.fs-side-panel`, `.bc-side-panel`
et équivalents) suit un fond dégradé sombre cohérent avec le thème casino —
`linear-gradient(160deg, var(--panel-light), var(--panel))` — bordé d'un trait
fin doré translucide (`border: 1px solid rgba(212, 175, 55, 0.25)`), coins
arrondis `16px`, contenu centré en colonne (`flex-direction: column;
align-items: center; gap: 14px`).

- **Jetons (`.fs-chip`, `.bc-mult-btn`, `.bc-zone-chip`)** : toujours ronds
  (`border-radius: 50%`), ~`42-44px`, avec un motif "camembert" en
  conic-gradient crème/transparent pour simuler les rayures d'un jeton, une
  bordure dorée sombre (`--gold-dim`), et un dégradé radial doré en
  pseudo-élément `::after` pour l'effet de relief/lumière. C'est la forme de
  référence pour **toute** sélection de montant de mise — jamais de bouton
  rectangulaire pour représenter un jeton. Légère élévation au survol
  (`translateY(-2px)`), désaturation + assombrissement (`filter: grayscale(0.6)
  brightness(0.7)`) quand désactivé.
  - Quand le jeton sert de **sélecteur stateful** (un seul montant actif à la
    fois, ex. `.bc-mult-btn`), l'état sélectionné se signale par un anneau
    lumineux crème en plus (`box-shadow: inset 0 0 0 2px var(--cream), ...`),
    sans changer la forme ni le fond du jeton — le remplissage doré reste
    identique entre état actif et inactif.
- **Champ de cible (`.fs-target-*`)** : encart sombre translucide
  (`rgba(0,0,0,0.35)`) bordé doré, texte crème centré, avec deux petits
  boutons +/- empilés à droite séparés par une bordure dorée fine.
- **Boutons d'action** (`.fs-actions .btn-action`, `.bc-deal-btn`,
  `.bc-new-round-btn`...) : police d'affichage en gras avec tracking, coins
  arrondis `10px`. Trois traitements distincts selon le rôle, appliqués
  systématiquement quel que soit le jeu :
  - *secondaires* (`.fs-clear`, `.fs-repeat`) : fond transparent, simple
    contour doré atténué (`--gold-dim`), passant au doré vif au survol ;
  - *action principale* (`.fs-launch`, `.bc-deal-btn`) : dégradé doré vertical
    (`--gold-bright` → `--gold` → `--gold-dim`), texte brun foncé (`#241a08`),
    ombre dorée diffuse, `filter: brightness(1.08)` au survol — jamais de
    couleur générique (grise/olive) par défaut, le dégradé doit être défini
    explicitement dans le CSS du jeu ;
  - *encaissement* (`.fs-cashout`) : dégradé émeraude (`--emerald-bright` →
    `--emerald`), texte crème, avec une pulsation lumineuse continue
    (`fsPulse`) pour attirer l'œil pendant que le multiplicateur monte.
- **Couleurs** : toujours puisées dans les variables globales du thème
  (`--gold`, `--gold-bright`, `--gold-dim`, `--cream`, `--cream-dim`,
  `--emerald`, `--emerald-bright`, `--panel`, `--panel-light`) — jamais de
  couleur codée en dur, sauf pour les teintes d'état ponctuelles (rouge perte
  `#e0685f`, brun texte sur fond doré `#241a08`).

### 4.3 `games/roulette/roulette.js` — le pattern de module

Chaque jeu est un **IIFE nommé** exposant une petite API publique, construit
entièrement en JS et injecté dans `.game-body` :

```js
const Roulette = (() => {
  // --- constantes de jeu (règles, valeurs de jetons, tables de paiement...) ---

  let built = false; // empêche une double construction du DOM

  function init() {
    const container = document.querySelector('#roulette .game-body');
    if (!container || built) return;
    built = true;

    container.innerHTML = `...HTML du plateau généré ici...`;

    bindEvents(container);
    Wallet.refreshUI();
  }

  function bindEvents(container) { /* addEventListener sur les éléments injectés */ }

  // --- logique de jeu : placer une mise, lancer, résoudre, payer via Wallet ---

  return { init, spin }; // API publique minimale
})();

document.addEventListener('DOMContentLoaded', () => Roulette.init());
```

Règles à suivre pour un nouveau jeu :
1. **Un seul IIFE global** nommé comme le jeu (`Blackjack`, `Baccara`, ...).
2. `init()` vérifie `built` pour ne jamais reconstruire le DOM deux fois, cible
   `#<jeu> .game-body`, injecte le HTML, bind les événements, puis appelle
   `Wallet.refreshUI()`.
3. Les mises/achats passent **toujours** par `Wallet.canAfford()` avant de débiter
   avec `Wallet.subtract()`, et les gains via `Wallet.add()`. Ne jamais modifier
   le solde autrement.
4. Un message de statut textuel (`#<jeu>-message` ou équivalent) informe le joueur
   à chaque action (mise placée, solde insuffisant, résultat...).
5. `toggleControls(enabled)` désactive les boutons pendant une animation/résolution
   pour éviter les actions concurrentes (voir `spinning` dans roulette.js).
6. Si le jeu sert de l'alcool ou pourrait affecter l'ivresse : appeler
   `Drunk.addDose(...)`. Sinon inclure quand même `drunk.css`/`drunk.js` pour que
   l'effet visuel persiste si le joueur est déjà éméché en arrivant.
7. Appeler `Stats.round()` au début de chaque partie / tour, et
   `Stats.best(multiplicateur)` si le jeu a un multiplicateur (section 3).
8. Jouer un son `Sfx` à chaque action et à chaque résultat, calé sur l'animation.
9. Mise composée avec les jetons (section 4.5).

### 4.4 Cas particulier : jeu incomplet

Un jeu peut exister comme dossier avec seulement `<jeu>.html` (pas encore de
`.css`/`.js` dédiés, comme l'était `games/poker/poker.html` avant le Texas
Hold'em). Dans ce cas,
préférer `locked: true` dans le lobby (voir section 5) plutôt que de publier un
lien mort ou une page cassée, ou utiliser `game-stub.css` pour afficher un écran
"bientôt disponible" en attendant.

### 4.5 Mise composée avec les jetons (convention commune)

Chaque clic sur un jeton **ajoute** sa valeur à la mise (`stake += montant`) :
100 cliqué 3 fois = 300. Les jetons 1/4, 1/2, ALL se calculent sur ce qui reste
disponible (`Wallet.get() - stake`). Un bouton `.stake-clear` "Effacer" à côté
du montant remet la mise à 0, et le jeton cliqué rebondit (`.chip-bump`). Il n'y
a plus de jeton "sélectionné" (pas de classe `active`).
Exemples : `mine.js`, `chicken.js`, `baccara.js`, `columbus.js` (`blackjack.js`
et `fusee.js` cumulaient déjà). À la roulette et au craps, on choisit un jeton
puis on clique sur une case de la table : chaque clic y ajoute le jeton.

---

## 5. Ajouter un jeu à la carte du lobby (`core/lobby.js`)

Le lobby gère une grille de collisions (`colliders`) où chaque case a un code.
Toutes les maisons (jeux principaux, bar, baccara, emplacements "Bientôt
disponible"...) vivent dans **un seul tableau `ALL_HOUSES`**, avec `x`/`y`
explicites pour chacune — il n'y a plus de séparation entre "jeux" et
"bâtiments annexes", ni de tableau `HOUSE_X` séparé à maintenir en synchro.

Pour ajouter une nouvelle maison :

1. Ajouter une entrée dans `ALL_HOUSES` :
   ```js
   { key: "monjeu", name: "Mon Jeu", icon: "🎲", href: "./games/monjeu/monjeu.html", x: 6, y: 2 }
   ```
   `x` = colonne de départ (largeur de maison = 3 cases), `y` = ligne de départ.
   Les codes `doorCode`/`roofCode`/`facadeCode` sont attribués automatiquement
   à partir de la position de l'entrée dans le tableau — pas besoin d'y toucher.

2. **`y: 2` a un sens particulier** : c'est la rangée du haut, réservée aux
   jeux "principaux", symétrique autour de la colonne centrale (13). Toute
   maison placée à `y: 2` reçoit automatiquement son allée verticale en tapis
   rouge et son raccord au grand boulevard (voir la section "Allées en tapis
   rouge" du fichier, basée sur `ALL_HOUSES.filter(h => h.y === 2)`) — rien à
   faire de plus. Pour une maison ailleurs (`y` différent, comme le bar ou
   Arcade), il faut en revanche vérifier/ajouter le raccord de tapis à la main
   si l'emplacement n'est pas déjà relié au boulevard.

3. **Cas particulier du bar** : sa porte est sur la rangée du HAUT de son
   bâtiment (accès direct depuis au-dessus) au lieu du bas comme les autres
   maisons. Ce n'est pas géré par `buildHouse()` mais par un bloc de code à
   part juste après (repéré via `ALL_HOUSES.find(h => h.key === "bar")`). Si
   un nouveau jeu a besoin d'une disposition de porte non standard, suivre ce
   modèle plutôt que de complexifier `buildHouse()`.

4. **Image du bâtiment** (optionnelle mais recommandée) : déposer un visuel
   `192x128px` (largeur_maison × TILE=64, hauteur 2×TILE) dans
   `assets/misc/batiment/` et l'enregistrer dans `HOUSE_IMAGES` :
   ```js
   monjeu: "monjeu.png",
   ```
   Sans image, le lobby affiche une case colorée générique + l'icône emoji.
   (Un visuel `slots.png` existe déjà dans `assets/misc/batiment/` sans dossier
   `games/slots/` correspondant pour l'instant — probablement un jeu prévu mais
   pas encore implémenté.)

5. **Verrouillage temporaire** : ajouter `locked: true` à l'entrée — la maison
   s'affiche en niveaux de gris, la porte ne redirige pas, et le texte affiché
   devient `"<name>..."` au lieu de `"Entrée : <name>"`.

6. Le pathfinding (Dijkstra) et les collisions se recalculent automatiquement à
   partir de `colliders` : pas besoin de toucher à `PathFind`.

### 5.1 Textures de sol (`core/lobby.js`)

Trois textures distinctes, chacune résolue en JS via `style.backgroundImage`
donc **relative à `lobby.html`** (pas à `lobby.css`, contrairement à un `url()`
écrit directement dans le CSS) :

| Constante | Fichier attendu | Appliquée à |
|---|---|---|
| `CARPET_IMAGE` | `assets/misc/lobby/sol/carpet-rouge.png` | sol nu (`kind: "floor"`, code `0`) — sert aussi de fond sous les images de bâtiments et de décos, visible dès que l'image a des zones transparentes |
| `PATH_IMAGE` | `assets/misc/lobby/sol/chemin.png` | allées + boulevard (`kind: "carpet"`, code `CARPET = 2`) |
| `CONTOUR_IMAGE` | `assets/misc/lobby/sol/contour.png` | murs du pourtour de la carte (`kind: "wall"`, code `1`) |

⚠️ Piège : `CARPET_IMAGE` désigne le sol nu, pas les allées en tapis — le nom
prête à confusion mais remonte à l'historique du fichier (l'ancien tapis rouge
couvrait aussi bien le sol que les allées). `PATH_IMAGE` est la vraie texture
du "chemin".

### 5.2 Panneaux interactifs au pied des bâtiments (`SIGN_SIDE`)

Certains bâtiments ont un panneau (`assets/misc/lobby/deco/panneau.png`) posé
au sol juste devant, une case sous la façade, à gauche ou à droite selon
`SIGN_SIDE` :
```js
const SIGN_SIDE = {
  blackjack: "left", roulette: "left", arcade: "left", baccara: "left",
  poker: "right", slots: "right", "future-right": "right", "future-bottom-2": "right",
};
```
- C'est une **vraie tuile de la grille** (comme une porte ou une déco), pas un
  simple visuel flottant : elle bloque le passage (`collide: true`) et affiche
  son texte (le nom du jeu) dans la popup du bas via le système générique de
  collision — même mécanisme que les portes, rien à coder en plus.
- Un panneau côté "right" est retourné horizontalement en CSS (`.sign-flip`,
  `transform: scaleX(-1)`) pour qu'il semble "regarder" vers le bâtiment.
- Le bar n'a volontairement pas de panneau (absent de `SIGN_SIDE`).
- Pas de garde-fou automatique : ajouter une maison à `SIGN_SIDE` sans
  vérifier que la case calculée (une sous la façade, à gauche/droite) tombe
  bien sur du sol libre — sinon elle écrase silencieusement une autre tuile
  (allée, déco...).
- Le nom du bâtiment ne flotte plus au-dessus de la porte (l'ancien `<span
  class="label">`) : le panneau a repris ce rôle. Les règles CSS
  `.tile.door .label` / `.tile.door.has-image .label` existent encore dans
  `lobby.css` mais ne sont plus utilisées par le rendu JS.

### 5.3 Vitesse de déplacement : deux valeurs à garder synchronisées

Le déplacement case par case combine un `setInterval` en JS et une transition
CSS :
- `delay` (JS, `core/lobby.js`, actuellement `220`) : temps entre deux cases.
- `--moving-speed` (CSS, `core/lobby.css`, actuellement `220ms`) : durée du
  glissement visuel du joueur.

Ces deux valeurs **doivent rester égales**. Si `--moving-speed` est plus
courte que `delay`, le perso finit son glissement avant que la case suivante
ne démarre → micro-arrêt visible à chaque pas.

### 5.4 Distributeurs (ATM) : des objets "dans lesquels on entre"

Les deux décors `DECO.SLOT` (cases (12,5) et (14,5), image `slot-deco.png`) sont
des distributeurs. Leur type de tuile a `atm: true`, un texte
("Distributeur : vos statistiques") et un `effect` qui appelle
`enterHouse("./games/atm/atm.html")` :
- **en marchant contre** : dans `move()`, quand la case suivante bloque
  (`next.collide`) et qu'elle a `atm`, on déclenche son `effect` ;
- **au clic** : le perso va sur la case juste en dessous, puis entre
  (`pendingAtm` / `checkPendingAtm()`).

Même mécanisme réutilisable pour tout objet bloquant dans lequel on doit
pouvoir "entrer" sans que ce soit une maison.

---

## 6. Maison-menu avec sous-jeux — exemple de référence : Arcade

Certaines maisons ne mènent pas directement à un jeu, mais à un **hub**
proposant plusieurs mini-jeux au sein d'une même thématique. `games/arcade/`
en est le premier exemple : sa porte dans le lobby (`href:
"./games/arcade/arcade.html"`) ouvre un menu carrousel plutôt qu'un jeu.

### 6.1 Le hub (`arcade.html` + `arcade.css` + `arcade.js`)

Suit exactement le même squelette qu'un jeu classique (section 4.1) — topbar
+ `#arcade .game-body` vide, IIFE `Arcade` avec `init()`/`built` — à la
différence près que son contenu injecté est un **carrousel de sélection**
plutôt qu'un plateau de jeu :

- Chaque mini-jeu est décrit par un objet `{ id, name, icon, img, tagline,
  href, ready }` dans un tableau interne à `arcade.js`. `img` (prioritaire sur
  l'emoji `icon`) affiche une image sur la carte du carrousel.
- `ready: false` tant que le mini-jeu n'a pas de dossier fonctionnel : cliquer
  dessus affiche un message "bientôt disponible" au lieu de naviguer vers un
  lien mort (même logique que `locked: true` au niveau du lobby, mais gérée
  ici en interne au hub plutôt que dans `core/lobby.js`).
- Le carrousel utilise une **position virtuelle non bornée** (`center`, un
  entier qui peut dépasser 0..N-1) plutôt qu'un simple index modulo : les
  vignettes DOM gardent leur identité tant qu'elles restent dans la fenêtre
  visible (on ne les recrée jamais), ce qui permet à la transition CSS sur
  `transform` de les faire glisser d'une position à l'autre au lieu de sauter
  instantanément. Seules les vignettes qui entrent/sortent de la fenêtre
  visible sont créées/retirées, avec un glissement depuis/vers le bord.
- Navigation : flèches `.ac-nav-prev/next`, clic sur une vignette latérale,
  flèches du clavier, ou glisser (swipe) à la souris/au doigt — tout passe par
  la même fonction `go(delta)`.

### 6.2 Les sous-jeux (`games/arcade/<jeu>/`)

Chaque mini-jeu (`fusee`, `mine`, `chicken`, `plinko`, `craps`) est un jeu **classique** au
sens de la section 4, avec son propre trio `<jeu>.html`/`<jeu>.css`/`<jeu>.js`
et son propre IIFE — la seule différence est la profondeur de chemin (voir
section 2 : `../../../` au lieu de `../../`, puisqu'on est un niveau plus bas
que `games/<jeu>/`). Une fois qu'un sous-jeu est prêt, il suffit de passer son
`ready` à `true` dans le tableau d'`arcade.js` pour le débloquer dans le
carrousel.

### 6.3 Jeux à `<canvas>` et boucle physique — exemple de référence : Plinko

`games/arcade/plinko/` est le premier jeu qui ne se résout pas en un seul
clic : une balle tombe image par image dans un `<canvas>`, avec gravité et
rebonds sur des chevilles, jusqu'à atterrir dans un bac. Ce pattern diffère
assez du modèle "jeu de table" (section 4) pour mériter sa propre fiche.

**Structure générale** (`plinko.js`) :
- Le plateau (chevilles + bacs) est **recalculé géométriquement** à partir de
  quelques constantes (`WIDTH`, `HEIGHT`, `PADDING_X`, `PADDING_TOP`,
  `PADDING_BOTTOM`) plutôt que positionné en dur — indispensable dès qu'un
  réglage (nombre de lignes, difficulté) doit reconstruire le plateau à la
  volée (`rebuildBoard()`).
- Une boucle physique unique (`loop()` + `requestAnimationFrame`, démarrée par
  `ensureLoop()` et jamais arrêtée) met à jour toutes les balles en vol à
  chaque frame, teste leurs collisions avec les chevilles, puis détecte
  l'atterrissage dans un bac.
- Les bacs/multiplicateurs sont rendus en **HTML classique** juste sous le
  canvas (pas dessinés dedans) : plus simple à animer (flash au bon bac) et à
  thémer avec les variables CSS habituelles, plutôt que de gérer du texte en
  `<canvas>`.
- Mise : boutons à montant fixe (10/20/50/100/200) — cliquer lance
  **immédiatement** une balle (spam-clickable, plafonné par
  `MAX_ACTIVE_BALLS`), au lieu du couple "choisir un montant puis valider"
  des jeux de table.

**Pièges rencontrés à surveiller sur tout futur jeu du même genre** :

- **Marge de spawn au-dessus du plateau** : si l'objet qui tombe apparaît
  trop près de la première rangée d'obstacles, il la percute quasiment sans
  vitesse acquise (gravité pas encore appliquée) et reste "collé" au lieu de
  tomber franchement. Calculer la position de départ à partir de la taille
  réelle de l'objet (`freeFallClearance` dans `plinko.js`), pas une valeur
  fixe — surtout si cette taille dépend elle-même d'un réglage (voir point
  suivant).
- **Taille d'un objet qui dépend d'un réglage variable (nombre de lignes,
  difficulté...)** : ne pas la définir comme un simple multiple d'une autre
  grandeur (ex. `rayonChevilleᵃᶜᵗᵘᵉˡ × 2`), car le ratio par rapport à
  l'espace disponible (l'écart entre chevilles) peut dériver d'un réglage à
  l'autre — l'objet devient proportionnellement trop gros à certains réglages
  et se coince entre les obstacles. Fixer plutôt son rayon comme un
  **pourcentage constant de l'écart disponible**, mesuré sur le réglage de
  référence qui "tombe" bien (voir `ballToGapRatio()` dans `plinko.js`), puis
  appliquer ce même pourcentage à tous les réglages.
- **Historique/log qui s'affiche au fil du jeu** (ici les derniers gains,
  `.pk-log`) : lui donner une **grille à taille fixe** (colonnes × lignes
  définies en CSS, hauteur figée) et retirer la plus ancienne entrée dès que
  la limite est dépassée, plutôt que de laisser le conteneur grandir avec le
  contenu — sinon la page se redimensionne légèrement à chaque nouvelle
  entrée.
- **Collisions balle/obstacle** : une reprojection complète de la vitesse sur
  l'angle de collision à chaque frame de contact peut donner un rebond très
  franc mais aussi un ralentissement artificiel quand la balle frôle un
  obstacle en angle (elle reste "en collision" plusieurs frames de suite). Une
  décomposition normale/tangentielle de la vitesse est plus fidèle physiquement
  mais peut aussi donner l'impression que la balle va trop vite selon le
  facteur de rebond choisi — à retester en jeu à chaque changement, ce
  réglage est sensible et se juge à l'œil plus qu'au calcul.

**Lumières façon vraie machine** (ajoutées après coup) : enseigne néon
"PLINKO", rampe d'ampoules générée en JS (`buildBulbsHTML()`) autour du plateau,
avec des modes CSS sur `.pk-cabinet` : repos (chenillard lent), `pk-live`
(bille en jeu, chenillard rapide), `pk-win` (gain ≥ 2×, tout clignote),
`pk-jackpot` (gain ≥ 10×, stroboscope arc-en-ciel). Les chevilles touchées
s'allument dans une couleur qui dépend de leur hauteur, avec une onde, et la
bille laisse une traînée lumineuse.

### 6.4 Fusée (crash game)

- Point de crash : 4 % d'explosion immédiate, sinon `0,99 / (1 - r)` plafonné à
  1000×. Probabilité d'atteindre x = **0,99 / x** (2× : 49,5 %, 10× : 9,9 %,
  1000× : ≈ 1 partie sur 1 010) ; retour au joueur ≈ 99 % quelle que soit la cible.
- Courbe exponentielle dont la courbure augmente avec le temps de vol
  (`CURVE_K_START`, `CURVE_K_PER_SEC`, `CURVE_K_MAX`) : douce au début, presque
  verticale si la fusée tient longtemps.
- Sprite `fusee.png` : nez vers le HAUT ; la fusée occupe 9 % → 74 % de la
  hauteur du PNG, la flamme démarre à 71 % pour passer sous la tuyère sans trou.
  Flamme et traînée de particules en canvas, étoiles qui défilent plus vite à
  mesure que ça monte, écran qui tremble de plus en plus (`applyShake()`),
  explosion en particules au crash (`spawnExplosion()`).
- Encaissement auto **vide par défaut** (= encaissement manuel).
- Après encaissement, la bulle `#fs-missed` montre en direct ce qu'on aurait en
  restant, puis le "max possible" au crash.

### 6.5 Mines

Grille 5×5, images `diamant.svg` / `bombe.svg` / `explosion.svg`. Chaque
diamant trouvé joue une note plus aiguë que la précédente (`Sfx.gem(série)`).

### 6.6 Chicken Grill

Rangée de fours (`four.svg`), le poulet saute de four en four. Dans `four.svg`
(viewBox 110×132), l'écran est la zone x27 y7 56×20 et la vitre x17 y53 76×58 :
les overlays HTML (multiplicateur, voyant, lueur) sont positionnés en % sur ces
zones. Mort : le four s'embrase, flammes, le sprite passe à `poulet-cuit.svg`
+ "ding" de minuteur (chronologie `HOP_MS`, `BURN_AT`, `COOKED_AT`, `END_AT`).

### 6.7 Craps

Pass Line / Don't Pass (verrouillées une fois le point établi, palet ON/OFF),
Field, Any 7, Any Craps. Dés 3D en CSS animés avec l'API Web Animations, sons
calés sur les rebonds (`BOUNCES`). Infobulles et encart "Règles et chances"
avec l'avantage de la maison de chaque mise.

---

## 7. Autres jeux et pages

### 7.1 Poker (Texas Hold'em)

- Le joueur + 4 bots (avatars = skins). La cave est prise dans le Wallet et
  rendue en quittant la table ou la page (`pagehide`).
- Évaluateur de mains 7 cartes (`evaluate()`), pots annexes, tapis.
- Bots : équité estimée par **simulation Monte-Carlo** comparée aux cotes du
  pot, avec un style (serré, agressif, large, maniaque, équilibré).
- La maison gagne via une **commission** (rake) : 5 % du pot, plafonnée à
  3 grosses blindes, seulement si le flop est servi.
- Panneau "Aide" (chances de gagner, cotes du pot) et panneau "Combinaisons"
  (la main du joueur s'y allume en direct).
- Mise en page plein écran sans `fit.js` (table 1000×520 mise à l'échelle).

### 7.2 Bar et caisses de personnages

Cocktails (ivresse), eau/café (dessaoulent), choix du skin parmi ceux possédés.
**Caisse à 750 jetons** façon Counter-Strike : on tire d'abord une rareté selon
son poids (`CASE_ODDS`), puis un skin de cette rareté ; un doublon rembourse une
partie de la mise. Le résultat est tiré **avant** l'animation (la bande n'est
que de la mise en scène). "Voir les chances" affiche les probabilités et la
valeur moyenne d'une caisse.

### 7.3 Distributeur (`games/atm/`)

Relevé façon ATM : solde, bilan, total misé / récupéré, parties, plus gros
gain, tableau par jeu avec **retour réel vs retour théorique**, records de
multiplicateur, bar, recharges, temps de jeu, remise à zéro (double clic). Les
retours théoriques sont dans le tableau `GAMES` de `atm.js` : à compléter pour
tout nouveau jeu.

---

## 8. Charte graphique (`core/main.css`)

Variables CSS disponibles partout (déclarées sur `:root`) :

| Variable | Usage |
|---|---|
| `--gold`, `--gold-bright`, `--gold-dim` | Accents dorés, bordures, texte important |
| `--burgundy`, `--burgundy-bright` | Rouge bordeaux (danger, roulette rouge) |
| `--emerald`, `--emerald-bright` | Vert tapis / zéro à la roulette |
| `--cream`, `--cream-dim` | Texte principal / texte secondaire |
| `--panel`, `--panel-light` | Fonds de panneaux/cartes |
| `--black`, `--near-black` | Fond de page |
| `--font-display` (Cinzel) | Titres, montants, boutons d'action |
| `--font-body` (Poppins) | Texte courant |
| `--radius`, `--shadow` | Arrondis et ombres cohérents |

Classes utilitaires prêtes à l'emploi : `.btn` + `.btn-primary` / `.btn-ghost` /
`.btn-danger`, `.gold-text` (dégradé texte doré), `.modal-backdrop` + `.modal`,
`.hidden`, `.chip-icon`.

Et dans `core/game-page.css` :
- `.coin-icon` → petite pièce dorée (remplace l'emoji pièce) ;
- `.title-icon` → image devant le titre du bandeau ;
- `.stake-clear` → bouton "Effacer" de la mise ; `.chip-bump` → rebond d'un jeton ;
- `.sfx-toggle` → bouton son (injecté par `sfx.js`).

Le lobby (`core/lobby.css`) utilise volontairement une **autre** police
("Press Start 2P") et sa propre palette bordeaux/or en pixel art — ne pas
mélanger les deux styles entre le village et les pages de jeu.

**Bandeau du haut (`.game-topbar`, dans `core/game-page.css`)** : reprend le
même style que la popup de confirmation dorée (`.cd-confirm-box` dans
`columbus.css`) — fond dégradé marron `linear-gradient(160deg, #3a1608,
#1c0a04)`, bordure `2px solid var(--gold)`, glow doré (`box-shadow`), titre en
`var(--gold-bright)`. Commun à **tous** les jeux via `game-page.css` : pas
besoin (ni recommandé) de le redéfinir dans le CSS d'un jeu particulier.

---

## 9. Checklist pour créer un nouveau jeu

1. Créer un dossier `games/<jeu>/` contenant `<jeu>.html` sur le modèle de
   `games/roulette/roulette.html` (topbar + `.game-body` vide). Si le jeu fait
   partie d'une maison-menu existante (ex. Arcade), le créer plutôt dans
   `games/<hub>/<jeu>/` (voir section 6.2) et passer son `ready` à `true` dans
   le JS du hub une fois prêt.
2. Créer `games/<jeu>/<jeu>.css` avec préfixe de classes dédié, variables de
   `core/main.css` uniquement, des images plutôt que des emojis.
3. Créer `games/<jeu>/<jeu>.js` : IIFE `const <Jeu> = (() => {...})()`, `init()`
   qui injecte dans `.game-body`, mises/paiements via `Wallet`, message de
   statut, `toggleControls`, mise composée avec les jetons (4.5),
   `Stats.round()` au début d'une partie, sons `Sfx` calés sur les animations.
4. Si c'est un nouveau jeu principal (pas un sous-jeu d'un hub) : ajouter une
   entrée dans `ALL_HOUSES` de `core/lobby.js` (+ éventuellement une image
   dans `assets/misc/batiment/`).
5. Vérifier les chemins relatifs : `../../core/`, `../../assets/`, `../../boisson/`
   depuis `games/<jeu>/` (deux niveaux), ou `../../../` depuis un sous-jeu de
   hub (`games/<hub>/<jeu>/`, trois niveaux) ; le CSS/JS du jeu lui-même est
   référencé sans préfixe puisqu'il est dans le même dossier.
6. Tester : le solde (`Wallet`) doit se mettre à jour dans la topbar, et si le jeu
   n'est pas encore prêt, préférer `locked: true` dans le lobby (ou `ready: false`
   si c'est un sous-jeu de hub) plutôt que de publier une page cassée (ou
   utiliser `game-stub.css` pour un écran "bientôt disponible").
7. Inclure les scripts dans l'ordre de la section 3 (wallet, stats, topbar,
   fit, drunk, [skins], sfx, jeu) et vérifier qu'**aucun scroll** n'apparaît
   en 1366×768.
8. Si le jeu a un retour théorique connu, l'ajouter dans `GAMES` de
   `games/atm/atm.js` pour qu'il apparaisse au Distributeur.

---

## 10. Problèmes connus

- **Solde de départ à 0** : dans `wallet.js`, `Number(localStorage.getItem(...))`
  vaut `0` quand rien n'est encore enregistré (`Number(null) === 0`), donc un
  nouveau visiteur démarre à 0 au lieu de `STARTING_BALANCE` (1 000). Correction
  possible : tester `getItem(...) === null` avant de convertir.
- **Stats du poker** : la cave compte comme "misé" et l'argent ne revient en
  "récupéré" qu'en quittant la table ; le bilan poker n'est juste qu'une fois sorti.
