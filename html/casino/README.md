# Casino Pokémon — structure du projet

```
casino-pokemon/
├── lobby.html          Page d'accueil (la salle avec les 4 portes de jeu)
├── lobby.css            Style + logique du sprite animé
├── lobby.js              Déplacement, collisions, pathfinding, animation
├── game-stub.css         Style commun aux pages de jeu (placeholder)
├── blackjack.html
├── roulette.html
├── poker.html
├── slots.html
└── assets/
    └── sprites/
        └── player.png    (vide pour l'instant, voir ci-dessous)
```

Tous les fichiers doivent rester dans le même dossier (les liens sont en
chemins relatifs `./nom-du-fichier`).

## Changer le sprite du joueur

Pour l'instant `lobby.css` pointe vers une image externe (le sprite Brendan
de Pokémon Emerald) juste pour que l'animation soit visible tout de suite.

Pour mettre TON sprite :

1. Place ton spritesheet dans `assets/sprites/player.png`
2. Dans `lobby.css`, cherche `#player-body` et remplace la ligne
   `background-image: url("https://...")` par :
   ```css
   background-image: url("./assets/sprites/player.png");
   ```
3. Ajuste ces variables selon les dimensions de TON image :
   - `--original-h` / `--original-v` : largeur/hauteur réelle du fichier PNG
   - `--sprite-size-local` : taille en pixels d'une case du sprite dans le PNG
   - `--x` / `--y` : décalage pour choisir la bonne frame (dépend de la mise
     en page de ton spritesheet — nombre de colonnes/lignes, marges, etc.)

La logique d'animation (4 frames de marche, 4 directions) est dans
`lobby.js`, variables `directions` et `spriteFrames`.
