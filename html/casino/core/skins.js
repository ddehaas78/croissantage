/* skins.js — registre des skins du personnage, partagé par toutes les pages
   (lobby, bar, futur shop...). Le choix ET la liste des skins possédés sont
   persistés en localStorage, comme Wallet et Drunk, pour suivre le joueur
   d'une page à l'autre.

   Pour ajouter un nouveau skin : ajoute une entrée dans SKINS ci-dessous,
   avec le fichier déposé dans assets/player/ et une rareté (clé de
   RARITIES). Il entre alors automatiquement dans la caisse du bar.
   Chaque fichier doit respecter la même grille 4x4 (cases carrées) :
   ligne 0 = bas, 1 = gauche, 2 = droite, 3 = haut ;
   colonne 0 = pas gauche, 1 = idle, 2 = pas droit, 3 = libre.

   `starter: true` = possédé d'office (jamais dans la caisse).
*/
const Skins = (() => {
  const STORAGE_KEY = 'croissantage_player_skin';
  const OWNED_KEY = 'croissantage_owned_skins';
  const BASE_PATH = 'assets/player/'; // relatif à la racine du site, sans slash de début

  // Raretés façon Counter-Strike (bleu → violet → rose → rouge → or).
  // Les couleurs sont des teintes d'état, utilisées en variable CSS --rarity.
  const RARITIES = {
    commun:     { label: 'Commun',     color: '#4b69ff' },
    rare:       { label: 'Rare',       color: '#8847ff' },
    epique:     { label: 'Épique',     color: '#d32ce6' },
    legendaire: { label: 'Légendaire', color: '#eb4b4b' },
    mythique:   { label: 'Mythique',   color: '#e4ae39' },
  };

  const SKINS = [
    { id: 'brendan', name: 'Brendan', file: 'brendan.png', rarity: 'commun', starter: true },
    { id: 'ace-trainer', name: 'Ace Trainer', file: 'aceTrainer.png', rarity: 'commun' },
    { id: 'poke-maniac', name: 'Poke-maniac', file: 'poke-maniac-1.png', rarity: 'commun' },
    { id: 'courtney', name: 'Courtney', file: 'courtney.png', rarity: 'commun' },
    { id: 'archie', name: 'Archie', file: 'archie.png', rarity: 'rare' },
    { id: 'flannery', name: 'Flannery', file: 'flannery.png', rarity: 'rare' },
    { id: 'phyre', name: 'Phyre', file: 'phyre.png', rarity: 'epique' },
    { id: 'giovanni', name: 'Giovanni', file: 'giovanni.png', rarity: 'legendaire' },
    { id: 'cynthia', name: 'Cynthia', file: 'cynthia.png', rarity: 'mythique' },
  ];

  const DEFAULT_SKIN_ID = SKINS[0].id;

  function getAll() {
    return SKINS;
  }

  function getSkinById(id) {
    return SKINS.find((s) => s.id === id) || SKINS[0];
  }

  function rarityOf(id) {
    return RARITIES[getSkinById(id).rarity] || RARITIES.commun;
  }

  // --- Possession ---
  function loadOwned() {
    let list = null;
    try { list = JSON.parse(localStorage.getItem(OWNED_KEY)); } catch (e) { /* tant pis */ }
    const firstTime = !Array.isArray(list);
    if (firstTime) {
      list = [];
      // Migration : le skin déjà choisi avant l'arrivée des caisses reste acquis.
      try {
        const prev = localStorage.getItem(STORAGE_KEY);
        if (prev) list.push(prev);
      } catch (e) { /* tant pis */ }
    }
    const owned = new Set(list.filter((id) => SKINS.some((s) => s.id === id)));
    SKINS.filter((s) => s.starter).forEach((s) => owned.add(s.id));
    if (firstTime) saveOwned(owned);
    return owned;
  }

  function saveOwned(set) {
    try { localStorage.setItem(OWNED_KEY, JSON.stringify([...set])); } catch (e) { /* tant pis */ }
  }

  function isOwned(id) {
    return loadOwned().has(id);
  }

  function getOwnedIds() {
    return [...loadOwned()];
  }

  // Débloque un skin. Renvoie true si c'est une nouveauté, false si doublon.
  function unlock(id) {
    if (!SKINS.some((s) => s.id === id)) return false;
    const owned = loadOwned();
    if (owned.has(id)) return false;
    owned.add(id);
    saveOwned(owned);
    return true;
  }

  // --- Skin équipé ---
  function getCurrentId() {
    try {
      const id = localStorage.getItem(STORAGE_KEY);
      if (id && SKINS.some((s) => s.id === id) && isOwned(id)) return id;
    } catch (e) { /* stockage indisponible, tant pis */ }
    return DEFAULT_SKIN_ID;
  }

  function setCurrentId(id) {
    if (!SKINS.some((s) => s.id === id) || !isOwned(id)) return false;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* stockage indisponible, tant pis */ }
    return true;
  }

  // rootPrefix : chemin relatif vers la racine du site depuis la page appelante
  // ('' à la racine comme lobby.html, '../../' depuis games/<jeu>/).
  function urlFor(id, rootPrefix) {
    const skin = getSkinById(id);
    return `${rootPrefix || ''}${BASE_PATH}${skin.file}`;
  }

  return {
    getAll, getSkinById, getCurrentId, setCurrentId, urlFor,
    isOwned, getOwnedIds, unlock, rarityOf, RARITIES, DEFAULT_SKIN_ID,
  };
})();
