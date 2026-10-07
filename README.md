# CorrigePro

**Correction de copies et grilles d'évaluation pour enseignants** — un compagnon de [ClassPro](https://lucaslecoadoupro.github.io/classpro-desktop/), même philosophie : gratuit, sans inscription, 100 % local, Mac & Windows.

## Fonctionnalités

### Classes & suivi des résultats
- Création de classes par **copier-coller d'une liste** (« NOM Prénom » de Pronote, « Prénom NOM », CSV/tableur avec colonnes Nom ; Prénom) ou par **fichier CSV/TXT**.
- **Import direct depuis une sauvegarde ClassPro** (`.json`) : les classes et élèves sont récupérés.
- **Relevé de notes** élèves × évaluations, moyenne pondérée par coefficient (ramenée sur 20), mini-courbe et tendance par élève.
- **Évolution** : courbe de la moyenne de classe (min/max), répartition des notes par évaluation, élèves en progression / en baisse, fiche élève avec sa courbe comparée à la classe.
- Seules les copies **validées** comptent dans les moyennes.

### Grilles d'évaluation imprimables
- Modèles : expression écrite / orale, compréhension écrite / orale, contrôle de connaissances, tâche finale, **compétences du socle (MI / MF / MS / TBM)**, grille vierge.
- Barème **/10, /20, /30, /40, /50, /100 ou libre** ; arrondi au centième, quart, demi-point ou point.
- Notation **par points** ou **par niveaux de maîtrise** (pourcentages modifiables).
- Critères et parties réordonnables, descriptions, consigne, champs Nom / Classe / Date, lignes d'appréciation, légende, signatures.
- Si le total des critères diffère du barème, la note est ramenée automatiquement (bouton « Ajuster »).
- **Portrait ou paysage, 1 ou 2 grilles par feuille** (trait de coupe) — moitié moins de photocopies.
- Impression **vierge** ou **pré-remplie avec les noms d'une classe**. Aperçu fidèle à l'échelle.

### Correction numérique
- Import des copies en **PDF, JPG ou PNG** : par élève (glisser-déposer sur sa ligne) ou **en lot** (un PDF de toute la classe découpé automatiquement en N pages par copie, ou un fichier par élève avec reconnaissance du nom dans le nom de fichier).
- **Vue paysage : copie à gauche, grille à droite** (panneau redimensionnable).
- Outils : stylo, surligneur, souligner, **souligner en vague** (erreur de langue), entourer, texte, **tampons** personnalisables (« ✓ », « Conj. », « ¡Muy bien! »…), gomme, annuler/rétablir, zoom, rotation et réordonnancement des pages.
- Notation au clic (valeurs rapides ou saisie au quart de point), bonus/pénalité, note forcée, **appréciations rapides**.
- « Valider et passer à la suivante » (Ctrl/Cmd + Entrée) enchaîne les copies non corrigées.
- **Impression** : copie annotée + grille complétée **côte à côte en paysage** (comme à l'écran) ou **copie puis grille en portrait** ; ou grilles complétées seules (2 par feuille). **Export PDF** direct.

Raccourcis de correction : `P` stylo · `S` surligneur · `U` souligner · `V` vague · `O` entourer · `T` texte · `M` tampon · `E` gomme · `H` déplacer · `Ctrl/Cmd+Z` annuler · `Alt+←/→` élève précédent/suivant · `Ctrl/Cmd+molette` zoom.

## Données

Tout reste sur l'ordinateur :

| Système | Dossier |
|---|---|
| macOS | `~/Library/Application Support/CorrigePro/data/` |
| Windows | `%APPDATA%\CorrigePro\data\` |

- `corrigepro.json` : classes, grilles, évaluations, notes, annotations (écriture atomique + copie `.bak`).
- `copies/` : une image JPEG par page de copie importée.

Réglages → « Exporter une sauvegarde » produit un fichier `.json` unique (avec ou sans les copies numérisées) restaurable sur un autre poste.

## Développement

```bash
npm install
npm start          # construit l'interface puis lance l'application
npm run dev        # idem + outils de développement
npm run watch      # reconstruit l'interface à chaque modification (relancer/recharger Electron)
npm run build:web  # version HTML autonome : dist-web/corrigepro.html
```

Structure :

```
src/main/            processus principal Electron (fichiers, impression, PDF, protocole cpblob://)
src/renderer/app/    interface React (bundlée par esbuild dans src/renderer/dist/)
  modules/           Accueil, Classes, Grilles, Évaluations, Correction, Réglages
  sheets.jsx         rendu des grilles et des pages imprimables (dimensions en mm)
  annotations.jsx    formes d'annotation (stockées en pixels de l'image d'origine)
src/renderer/vendor/ pdf.js (lecture des PDF importés)
assets/icon.png      icône 1024 px (convertie automatiquement en .icns / .ico)
```

## Publier une version

1. Mettre à jour `"version"` dans `package.json` (c'est la seule source : l'app lit `app.getVersion()`).
2. `git tag v1.0.0 && git push --tags`
3. Le workflow **Release** construit les `.dmg` (Intel + Apple Silicon), l'installeur `.exe` Windows et `corrigepro.html`, puis crée la release GitHub.

En local : `npm run dist:mac` (sur un Mac) ou `npm run dist:win`.

L'application n'est pas signée : mêmes manipulations au premier lancement que pour ClassPro (Réglages Système → Confidentialité → « Ouvrir quand même », ou `xattr -cr "/Applications/CorrigePro.app"` ; sous Windows « Informations complémentaires » → « Exécuter quand même »).

## Notes techniques

- pdf.js 3.11 est utilisé avec `isEvalSupported: false` (correctif officiel de la faille CVE-2024-4367 signalée par `npm audit`) ; les autres alertes d'audit concernent uniquement les outils de build (`electron-builder` → `tar`), pas l'application livrée.
- Toutes les dépendances sont en `devDependencies` : le paquet final ne contient que le bundle de l'interface, pdf.js et le processus principal.
