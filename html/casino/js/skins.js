/* skins.js — registre des skins du personnage, partagé par toutes les pages
   (lobby, bar, futur shop...). Le choix est persisté en localStorage, comme
   Wallet et Drunk, pour suivre le joueur d'une page à l'autre.

   Pour ajouter un nouveau skin (ex: via le futur shop) : ajoute simplement
   une entrée dans SKINS ci-dessous, avec le fichier déposé dans
   assets/player/. Chaque fichier doit respecter la même grille 4x4
   (cases carrées) : ligne 0 = bas, 1 = gauche, 2 = droite, 3 = haut ;
   colonne 0 = pas gauche, 1 = idle, 2 = pas droit, 3 = libre.
*/
const Skins = (() => {
  const STORAGE_KEY = 'croissantage_player_skin';
  const BASE_PATH = 'assets/player/'; // relatif à la racine du site, sans slash de début

  const SKINS = [
    { id: 'brendan', name: 'Brendan', file: 'brendan.png' },
    { id: 'ace-trainer', name: 'Ace Trainer', file: 'aceTrainer.png' },
    { id: 'archie', name: 'Archie', file: 'archie.png' },
    { id: 'courtney', name: 'Courtney', file: 'courtney.png' },
    { id: 'flannery', name: 'Flannery', file: 'flannery.png' },

    // Futurs skins (achetables dans le shop) : ajoute-les ici, ex.
    // { id: 'pirate', name: 'Pirate', file: 'pirate.png' },
  ];

  const DEFAULT_SKIN_ID = SKINS[0].id;

  function getAll() {
    return SKINS;
  }

  function getSkinById(id) {
    return SKINS.find((s) => s.id === id) || SKINS[0];
  }

  function getCurrentId() {
    try {
      const id = localStorage.getItem(STORAGE_KEY);
      if (id && SKINS.some((s) => s.id === id)) return id;
    } catch (e) { /* stockage indisponible, tant pis */ }
    return DEFAULT_SKIN_ID;
  }

  function setCurrentId(id) {
    if (!SKINS.some((s) => s.id === id)) return;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* stockage indisponible, tant pis */ }
  }

  // rootPrefix : chemin relatif vers la racine du site depuis la page appelante
  // ('' si la page est à la racine comme lobby.html, '../' si elle est dans
  // /html/... comme bar.html, columbus.html, etc.)
  function urlFor(id, rootPrefix) {
    const skin = getSkinById(id);
    return `${rootPrefix || ''}${BASE_PATH}${skin.file}`;
  }

  return { getAll, getSkinById, getCurrentId, setCurrentId, urlFor, DEFAULT_SKIN_ID };
})();