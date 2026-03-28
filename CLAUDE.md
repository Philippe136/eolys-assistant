# CLAUDE.md — Regles du projet Vox

## Stack
- **Runtime** : Node.js serverless sur Vercel (ES modules)
- **Frontend** : HTML/CSS/JS vanilla (pas de framework)
- **DB** : PostgreSQL sur Neon (`lib/db.js`, template literals `sql\`...\``)
- **AI** : Anthropic SDK — modele confirme : `claude-haiku-4-5-20251001`
- **Storage** : Vercel Blob (audio, documents, pieces jointes)
- **Jobs async** : Trigger.dev (`jobs/process-call.js`, `jobs/weekly-review.js`)
- **Auth** : HMAC-SHA256 session cookie (`eolys_session`, 7 jours)

## Structure du projet

```
public/                  <- FRONTEND (tout le client)
  pages/                    14 pages HTML
  css/app.css               Styles partages
  js/app.js                 Comportements partages (haptic, prefetch, nav)
  icons/                    Icones PWA (192, 512, apple-touch)
  sw.js                     Service Worker (cache vox-vXX)
  manifest.json             Manifest PWA

api/                     <- BACKEND (Vercel serverless, 12 fichiers)
  calls.js                  Route principale (~33KB) : CRUD notes, finance, attachments, merge
  ingest.js                 Creation de notes (texte/audio/document)
  auth.js                   Login / generation session
  google-calendar.js        Integration Google Calendar
  microsoft-oauth.js        OAuth Microsoft
  weekly-review.js          Revue hebdomadaire
  claude.js                 Proxy Claude pour le frontend
  actions.js                Gestion des items/taches
  export.js                 Export des donnees
  projects.js               Gestion des projets
  today.js                  Resume du jour
  retry.js                  Utilitaire retry

lib/                     <- UTILS BACKEND
  auth.js                   Session, CORS, requireSession(), requireBearer()
  db.js                     Connexion Neon PostgreSQL
  prompts.js                Tous les prompts AI (system, modes, patterns, radar, weekly)

jobs/                    <- TRIGGER.DEV
  process-call.js           Traitement async des notes (transcription + analyse)
  weekly-review.js          Generation revue hebdo

db/
  schema.sql                Schema complet + migrations V3.0 a V3.7
```

## Regles OBLIGATOIRES

### Architecture
1. **JAMAIS de nouveau fichier dans `api/`** — Vercel limite a 12 fonctions serverless. Toute nouvelle route = `?action=xxx` dans un fichier existant (principalement `api/calls.js`).
2. **Structure respectee** — Frontend dans `public/`, backend dans `api/` + `lib/` + `jobs/`.
3. **vercel.json** gere le mapping URL → fichier. Les HTML sont dans `public/pages/` mais servis sur `/dashboard`, `/finance`, etc.

### Code
4. **PAS de `export const config = { api: { bodyParser: false } }`** dans calls.js — casse silencieusement toutes les routes PATCH/POST. formidable fonctionne sans.
5. **Pattern try/catch** pour les colonnes DB ajoutees en migration — le code peut deployer avant que la migration soit executee dans Neon.
6. **`amount::float`** dans les SELECT finance — le type NUMERIC de PostgreSQL retourne des strings en JS.
7. **Route GET catch-all** dans calls.js : la condition est `req.method === 'GET' && !req.query.action` — ne JAMAIS retirer le `!req.query.action` sinon toutes les routes GET avec action sont interceptees.

### Deploy
8. **Bumper le cache** `sw.js` (changer `vox-vXX` en `vox-vYY`) a CHAQUE modification frontend. Sans ca, les utilisateurs voient l'ancienne version.
9. **Deployer** avec `vercel --prod` depuis la racine du projet.
10. **Verifier les logs** avec `vercel logs [deployment-url]` apres chaque deploy.

### UX
11. **Mobile-first** — l'utilisateur utilise principalement l'app sur telephone.
12. **Nav mobile 5 tabs max** : Aujourd'hui | Notes | Actions | Finance | Dossiers. Reglages via icone dans le header.
13. **Pas de bouton record** ni de lien **Projets** dans les menus.
14. **Francais** exclusivement dans l'UI.

### Finance
15. **Categories finance** : alimentation, restaurant, tabac, transport, logement, loisirs, sante, shopping, abonnement, transfert, avance, revenu, frais, other.
16. **Categorie `avance`** = retraits rembourses (net zero) — EXCLUE du calcul Pareto 80/20 et du totalSpend.
17. **Labels tabac connus** : Bar Tabac Gombert, Tabac de la Plage, Le Gallia, SNC LE BERGERAC, Le Saint Michel, IBEKA, MAXIME FONTANGE.
18. **Dedup** : `ON CONFLICT (date, label, amount) DO NOTHING` + auto-dedup dans le GET finance via ROW_NUMBER.

### Dossiers
19. **Dossier Travail** = travail GTB (technicien batiment) uniquement. Les notes sur Vox vont dans le dossier "Amelioration App" (categorie `app`).

## Commandes utiles

```bash
# Deploy
vercel --prod

# Logs du dernier deploy
vercel logs [url-du-deploy]

# Dev local Trigger.dev
npm run trigger:dev

# Deploy jobs Trigger.dev
npm run trigger:deploy
```

## Variables d'environnement requises (dans Vercel)

| Variable | Usage |
|----------|-------|
| `DATABASE_URL` | Connexion Neon PostgreSQL |
| `ANTHROPIC_API_KEY` | API Claude |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage |
| `DASHBOARD_SECRET` | Mot de passe login (si vide = acces libre) |
| `INGEST_SECRET` | Token Bearer pour iOS Shortcuts |
| `APP_URL` | URL de prod pour CORS |
| `TRIGGER_SECRET_KEY` | Cle Trigger.dev |
| `OPENAI_API_KEY` | API OpenAI (legacy) |
