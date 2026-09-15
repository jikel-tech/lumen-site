# LUMEN — Guide de déploiement (100% gratuit)

Ce site est prêt à héberger. Cinq étapes, environ 30 minutes au total.

## 1. Mettre le site sur GitHub (gratuit)

1. Créez un compte sur github.com si vous n'en avez pas.
2. Créez un nouveau repository **public** (ex: `lumen-site`).
3. Téléversez tous les fichiers de ce dossier dans le repository (glisser-déposer
   sur la page GitHub, ou via `git push` si vous connaissez Git).

> Important : le dépôt doit être **public** pour que GitHub Actions (l'automatisation)
> reste gratuit et illimité. Un dépôt privé a un quota gratuit limité par mois.

## 2. Héberger le site (gratuit) — GitHub Pages

1. Dans le repository, allez dans **Settings → Pages**.
2. Source : "Deploy from a branch" → branche `main`, dossier `/root`.
3. Votre site sera en ligne sous 2 minutes à l'adresse
   `https://votre-nom.github.io/lumen-site/`.

Alternative équivalente : Netlify ou Vercel (glisser-déposer le dossier), aussi gratuits.

## 3. Activer la mise à jour automatique toutes les 30 min

Rien à faire ! Le fichier `.github/workflows/update-news.yml` s'active automatiquement
dès que le repository est en ligne. GitHub Actions est gratuit et illimité pour les
dépôts publics.

Pour vérifier que ça tourne : onglet **Actions** du repository → vous verrez
"Mise à jour des actus LUMEN" s'exécuter toutes les 30 minutes.

Pour la déclencher tout de suite sans attendre : onglet Actions → cliquez sur
le workflow → "Run workflow".

### Résumés par IA (optionnel)

Par défaut, le site affiche un extrait court de chaque article source (fiable,
gratuit, sans clé à configurer). Si vous voulez de vrais résumés en 3 phrases
générés par IA :

1. Créez une clé API sur console.anthropic.com (un petit budget est nécessaire
   au-delà de l'offre d'essai — ce n'est pas gratuit à volume élevé, contrairement
   au reste du système).
2. Dans le repository GitHub : **Settings → Secrets and variables → Actions →
   New repository secret**, nom `ANTHROPIC_API_KEY`, collez votre clé.
3. Le script bascule automatiquement sur les résumés IA la fois suivante.

## 4. Newsletter — Brevo (gratuit jusqu'à 300 emails envoyés/jour)

1. Créez un compte gratuit sur brevo.com.
2. Créez un formulaire d'inscription (Contacts → Formulaires).
3. Brevo vous donne un code d'intégration. Remplacez, dans `index.html`, les
   deux blocs `<form id="newsletter-form">` et `<form id="popupForm">` par ce
   code (ou connectez leur API si vous préférez garder le style actuel).

## 5. Statistiques et monétisation

- **Google Analytics 4** (gratuit) : créez une propriété sur analytics.google.com,
  copiez votre ID de mesure (`G-XXXXXXX`), remplacez-le dans le bloc commenté en
  bas de `index.html`, puis décommentez ces deux lignes.
- **Google AdSense / affiliation Jumia-Amazon** : ces programmes exigent une
  validation manuelle (contenu réel, trafic, ancienneté du site — comptez
  plusieurs semaines après la mise en ligne). L'emplacement publicitaire est
  déjà réservé dans la page (`<div class="ad-slot">`) ; vous n'aurez qu'à
  coller le code fourni par AdSense une fois votre compte approuvé.

## 6. Icônes PWA

Ajoutez deux images dans le dossier `icons/` :
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)

Sans elles, le site fonctionne quand même, mais l'icône d'installation sera
absente sur le téléphone des visiteurs.

## Limites à connaître

- Les flux RSS fournis par défaut sont des exemples réels (Frandroid, Numerama,
  Clubic, TechCrunch) — ajoutez ou retirez des sources dans
  `scripts/fetch-news.js` selon votre audience (ex. flux plus centrés Afrique/
  mobile si vous ciblez les lecteurs de marques comme Tecno ou Infinix).
- Le système ne recopie jamais un article en entier : c'est un extrait court +
  lien vers la source, ce qui est à la fois légal et bon pour vos relations
  avec les sites sources.
- Tout ce système est gratuit à l'usage courant. Seul le résumé par IA a un
  coût si vous dépassez le quota d'essai d'Anthropic — sinon le site reste
  fonctionnel avec les extraits RSS.
