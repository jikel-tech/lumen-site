# LUMen — guide de mise en ligne

Ce dossier contient les phases 1, 3, 4, 5 et 6 de la feuille de route, plus le bouton **S'abonner / Se désabonner**.
La phase 2 (envoi de la newsletter) n'est pas touchée : garde ton `scripts/send-newsletter.js` et ton workflow `send-newsletter.yml` tels quels.

## 1. Mettre le code sur GitHub

1. Copie le contenu de ce dossier dans ton dépôt `jikel-tech/lumen-site` (les fichiers existants du même nom sont remplacés).
2. **Ne remplace pas** `scripts/send-newsletter.js` ni `.github/workflows/send-newsletter.yml`.
3. Si ton `scripts/package.json` contient d'autres dépendances que `fast-xml-parser` (utilisées par `send-newsletter.js`), **fusionne-les** dans celui fourni ici au lieu de l'écraser.
4. Ne copie pas `data/articles.json` : il existe déjà dans ton dépôt et est tenu à jour par le robot.

## 2. Secrets GitHub (Settings → Secrets and variables → Actions)

| Secret | Pour quoi | Obligatoire ? |
|---|---|---|
| `GEMINI_API_KEY` | résumés des actus + analyse hebdomadaire | déjà en place |
| `BREVO_API_KEY` | newsletter quotidienne | déjà en place |
| `FB_PAGE_ID`, `FB_PAGE_TOKEN` | partage auto sur une page Facebook | non (ignoré si absent) |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | partage auto sur X | non (ignoré si absent) |
| `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` | notification push du matin | non (ignoré si absent) |

Les workflows de partage et de push ont un bouton « Run workflow » en **mode simulation par défaut** : lance-les d'abord ainsi pour voir ce qui serait publié.

## 3. Variables Netlify (Site configuration → Environment variables)

Pour que « S'abonner / Se désabonner » fonctionne directement sur le site :

- `BREVO_API_KEY` : la même clé Brevo
- `BREVO_LIST_ID` : le numéro de ta liste de contacts (Brevo → Contacts → Listes)
- optionnel, pour la double confirmation par email : `BREVO_DOI_TEMPLATE_ID` (modèle d'email de confirmation Brevo)

Tant que ces variables manquent, le site retombe sur ton formulaire Brevo hébergé (rien ne casse).

## 4. À renseigner dans `assets/config.js`

- `GA_ID` : ton ID Google Analytics 4 (`G-…`). Tant que c'est `G-XXXXXXXXXX`, rien n'est chargé.
- `ONESIGNAL_APP_ID` : ton App ID OneSignal. Vide = le bouton cloche reste caché.

## 5. Ce que fait chaque phase

- **Phase 1 – solidifier** : doublons fusionnés (même sujet couvert par plusieurs sources → badge « N sources »), flux en panne ignorés sans bloquer les autres (alerte dans GitHub Actions après 6 échecs), résumés IA mis en cache (plus d'appels répétés toutes les 30 min), anti-spam du formulaire (piège invisible, délai minimal, limite par IP, contrôle d'origine). Un bug d'identifiants (collisions entre articles de sites en `www`) est corrigé.
- **Phase 3 – visuels** : un visuel dessiné par rubrique (`assets/categories/*.svg`), sans image générée par IA.
- **Phase 4 – Google Analytics 4** : chargé seulement avec un vrai ID et si le navigateur n'envoie pas « Ne pas suivre ». La politique de confidentialité est mise à jour.
- **Phase 5 – redesign éditorial** : navigation par rubriques, bandeau « En direct », à la une, tendances, sections par rubrique, dernières actus.
- **Phase 6 – audience** : archives du jour indexables (`/jour/`) et sitemap, analyse hebdomadaire (`/hebdo/`, dimanche), partage auto Facebook/X (3 par jour), push du matin, rubrique « Tech Afrique ».
- **Bouton newsletter** : « S'abonner » devient « Se désabonner » après inscription (mémorisé dans le navigateur).

## 6. Premier lancement

1. Pousse sur GitHub, puis dans l'onglet **Actions** lance « Collecte des actus LUMen » (Run workflow).
2. Vérifie que `data/articles.json` se remplit et que le site affiche les actus.
3. Lance « Archives du jour (SEO) » pour créer la première page `/jour/…`.
4. Dans Google Search Console, soumets `https://jikeltech.netlify.app/sitemap.xml`.

## 7. À savoir

- `netlify.toml` évite de redéployer le site à chaque commit du robot qui ne touche que `data/`. Seules les archives (1 fois par jour) et tes changements de code déclenchent un déploiement.
- Quand tu modifies `index.html`, `app.js` ou `style.css`, change `VERSION` dans `sw.js` (ex. `lumen-v3`) pour que les visiteurs reçoivent la nouvelle version.
- « Se désabonner » demande l'adresse email : n'importe qui connaissant l'adresse d'un abonné pourrait la désabonner. C'est le compromis habituel d'un site sans compte utilisateur ; le lien présent dans chaque email reste la voie la plus sûre.
- Le texte de l'analyse hebdomadaire est généré avec l'IA et indiqué comme tel. Tu peux le relire et le modifier dans `hebdo/*.html` et `data/weekly.json` avant de le publier.
- Pour ajouter ou retirer une source RSS : `scripts/feeds.json` (pas besoin de toucher au code).
- Le flux `https://techcabal.com/feed/` a été ajouté sans pouvoir être vérifié depuis mon environnement : s'il est en panne, le robot l'ignorera et te le signalera.
