# Comment fonctionne Vox — Guide pour comprendre le code

> Ce document explique tout le code de Vox en langage simple.
> Pas besoin d'etre developpeur pour le lire.

---

## L'idee generale

Vox, c'est une app sur telephone qui fait ca :

1. Tu dictes ou tapes un texte
2. L'IA (Claude) comprend ce que tu dis et le range automatiquement
3. Tu retrouves tout dans des dossiers, avec des taches, des notes, etc.
4. Tu peux aussi importer tes releves bancaires pour analyser tes depenses

C'est une **PWA** (Progressive Web App) : ca ressemble a une app native sur ton telephone, mais c'est en fait un site web. Pas besoin de l'App Store.

---

## Comment c'est construit (l'analogie du restaurant)

Imagine un restaurant :

| Dans un restaurant | Dans Vox | Fichiers |
|---|---|---|
| **La salle** (ce que le client voit) | Les pages de l'app | `public/pages/*.html` |
| **La decoration** | Le style visuel | `public/css/app.css` |
| **Le serveur** (qui prend la commande) | Le code qui reagit aux clics | `public/js/app.js` + JS dans chaque HTML |
| **La cuisine** (qui prepare les plats) | Les fonctions serveur qui traitent les donnees | `api/*.js` |
| **Les recettes** | Les instructions donnees a Claude (IA) | `lib/prompts.js` |
| **Le frigo** (stockage) | La base de donnees | Neon PostgreSQL |
| **Le cahier de reservations** | L'authentification | `lib/auth.js` + `api/auth.js` |
| **Le livreur** (qui travaille en arriere-plan) | Les jobs Trigger.dev | `jobs/*.js` |

---

## Les fichiers un par un

### Frontend (public/) — ce que tu vois sur ton telephone

#### `public/pages/dashboard.html` (~98 KB — le plus gros fichier)
C'est la page d'accueil. Elle affiche :
- Tes notes sous forme de cartes
- Le champ pour ajouter une note rapide (quick-add)
- Les liens vers les autres pages

**Comment ca marche :**
- Au chargement, le JS appelle `GET /api/calls` pour recuperer tes notes
- Chaque note est une "carte" generee par la fonction `renderCard()`
- Quand tu tapes du texte et cliques Envoyer → `POST /api/ingest` cree la note
- La note passe en "traitement" (status: processing) puis "fait" (status: done)

#### `public/pages/finance.html` (~29 KB)
La page Finance avec l'analyse 80/20 de tes depenses.

**Comment ca marche :**
1. Au chargement → `loadFinance()` appelle `GET /api/calls?action=finance`
2. Le serveur renvoie toutes tes transactions + le calcul Pareto
3. `renderPareto()` affiche les categories groupees (Tabac, Restaurant, etc.)
4. Quand tu cliques "Importer CSV" → `uploadCSV()` envoie le fichier a `POST /api/calls?action=finance_csv_upload`
5. Le serveur donne le CSV a Claude qui detecte les colonnes et categorise chaque ligne
6. Les transactions sont inserees en base avec dedup (les doublons sont ignores)

#### `public/pages/folders.html` (~20 KB)
Les 5 dossiers thematiques : Travail, Perso, Idees, App, Inbox.
Chaque dossier filtre les notes par categorie.

#### `public/pages/actions.html` (~28 KB)
La liste des taches extraites de tes notes.
Les taches sont dans la table `items` — chaque note peut generer plusieurs taches.

#### `public/pages/today.html` (~31 KB)
Resume de ta journee : notes du jour + taches en cours.

#### `public/pages/settings.html` (~25 KB)
Parametres de l'app : changer de mot de passe, vider le cache, etc.

#### `public/pages/context.html` (~24 KB)
Tes entites de contexte : personnes, lieux, ambitions, envies.
L'IA utilise ce contexte pour mieux comprendre tes notes.

#### `public/pages/gmail.html` (~29 KB)
Integration Gmail : voir tes emails et les traiter depuis Vox.

#### `public/pages/patterns.html` (~22 KB)
Analyse de tes habitudes : pics d'energie, meilleurs jours, taux de completion.

#### `public/pages/radar.html` (~18 KB)
Detection de signaux faibles : stress, opportunites, stagnation.

#### `public/pages/insights.html` (~18 KB)
Recommandations et score d'utilisation de l'app.

#### `public/pages/projects.html` (~34 KB)
Page projets (cachee des menus, accessible via URL directe).

#### `public/pages/record.html` (~32 KB)
Page d'enregistrement audio (plus utilisee — tu dictes dans le champ texte).

---

#### `public/css/app.css`
Les styles partages entre toutes les pages :
- Transitions entre pages (effet de slide)
- Gestion du "notch" iPhone (safe-area)
- Responsive mobile

#### `public/js/app.js`
Le code partage entre toutes les pages :
- **Vibration** quand tu appuies sur un bouton (haptic feedback)
- **Prefetch** : quand tu survoles un lien, la page suivante commence a charger
- **Navigation** : surligne l'onglet actif dans la barre du bas

#### `public/sw.js` — Le Service Worker
C'est un programme invisible qui tourne en arriere-plan sur ton telephone.

**A quoi ca sert :**
- **Mode hors-ligne** : si tu n'as pas de reseau, l'app affiche quand meme les pages (depuis le cache)
- **File d'attente** : si tu crees une note sans reseau, elle est stockee localement et envoyee quand le reseau revient
- **Mise a jour** : quand je change le numero de version (`vox-v22` → `vox-v23`), le telephone re-telecharge tout

**Comment ca marche (simplifie) :**
1. A l'installation, il telecharge et met en cache toutes les pages
2. Quand tu ouvres une page → il la sert depuis le cache (rapide) ET verifie si une nouvelle version existe (mise a jour en arriere-plan)
3. Les appels API (`/api/*`) ne sont JAMAIS caches — toujours en direct

#### `public/manifest.json`
Le fichier qui dit au telephone "ceci est une app installable" :
- Nom : Vox
- Icone : l'onde sonore orange
- Demarrage : `/dashboard`
- Mode : standalone (pas de barre d'adresse)

---

### Backend (api/) — la cuisine

#### `api/calls.js` (~33 KB — le fichier le plus important)

C'est le "couteau suisse" de l'app. Toutes ces routes sont dedans :

| Quand tu fais... | Le serveur recoit... | Ce qui se passe |
|---|---|---|
| Tu ouvres le dashboard | `GET /api/calls` | Renvoie tes 200 dernieres notes |
| Tu ouvres une note | `GET /api/calls?callId=xxx` | Renvoie le detail de cette note |
| Tu modifies une note | `PATCH /api/calls` (body: titre, resume...) | Met a jour en base |
| Tu archives une note | `PATCH /api/calls` (body: archived=true) | Marque comme archivee |
| Tu cliques "Regrouper" | `POST /api/calls?action=merge-similar` | Claude analyse les notes et fusionne les similaires |
| Tu ouvres Finance | `GET /api/calls?action=finance` | Renvoie transactions + calcul Pareto |
| Tu importes un CSV | `POST /api/calls?action=finance_csv_upload` | Claude parse le CSV et insere les transactions |
| Tu cliques le bouton etoile | `POST /api/calls?action=finance_recategorize` | Claude re-categorise toutes les transactions |
| Tu vides les transactions | `DELETE /api/calls?action=finance_clear` | Supprime tout dans la table finance |
| Tu ajoutes une piece jointe | `POST /api/calls?action=upload-attachment` | Upload vers Vercel Blob + enregistrement en base |
| Tu supprimes une piece jointe | `DELETE /api/calls?action=attachment` | Supprime du Blob + de la base |

**Point important :** Le tout debut du fichier appelle `requireSession()` — si tu n'es pas connecte, RIEN ne fonctionne.

#### `api/ingest.js` (~9 KB)
Le point d'entree pour creer une note. Accepte 4 formats :
1. **Texte** (depuis le dashboard) → cree une note directement
2. **Audio** (depuis /record ou iOS) → upload le fichier son, cree une note
3. **Document** (PDF, TXT) → extrait le texte, cree une note
4. **Audio brut** (iOS Shortcuts) → detecte le format, upload, cree une note

Apres creation, il lance un **job Trigger.dev** (`process-call`) qui fait le vrai travail : transcription + analyse par Claude.

#### `api/auth.js` (~1.6 KB)
Le login. Quand tu entres ton mot de passe :
1. Il compare avec `DASHBOARD_SECRET` (dans les variables Vercel)
2. Si correct → cree un token (chiffre avec HMAC-SHA256)
3. Met le token dans un cookie (`eolys_session`)
4. Le cookie dure 7 jours, apres il faut se reconnecter

Si `DASHBOARD_SECRET` n'est pas defini → acces libre (pas de mot de passe).

#### Les autres fichiers api/
| Fichier | Ce qu'il fait |
|---------|---|
| `claude.js` | Proxy pour que le frontend parle a Claude directement |
| `actions.js` | CRUD des taches (items) |
| `export.js` | Exporter tes donnees |
| `projects.js` | CRUD des projets |
| `today.js` | Generer le resume du jour avec Claude |
| `weekly-review.js` | Generer la revue hebdomadaire |
| `google-calendar.js` | Synchro Google Calendar (OAuth) |
| `microsoft-oauth.js` | Connexion Microsoft |
| `retry.js` | Utilitaire pour re-essayer une action qui echoue |

---

### Utils backend (lib/)

#### `lib/auth.js` (~4 KB)
Les fonctions de securite :
- **`requireSession(req, res)`** : verifie que le cookie de session est valide. Utilise par TOUTES les routes.
- **`requireBearer(req, res)`** : verifie le token Bearer (pour les appels iOS Shortcuts).
- **`cors(req, res)`** : verifie que la requete vient bien de ton app (pas d'un site random).

#### `lib/db.js` (~200 octets)
Juste une ligne : cree la connexion a la base de donnees Neon.
Toutes les requetes SQL du projet passent par `sql\`SELECT ...\``.

#### `lib/prompts.js` (~17 KB)
Tous les textes qu'on envoie a Claude pour lui dire quoi faire :
- **SYSTEM_PROMPT** : "Analyse cette note et retourne du JSON structure"
- **MODE_PROMPTS** : variantes (rapide, reunion, idee, reflexion, email)
- **PATTERNS_PROMPT** : "Analyse les habitudes de l'utilisateur"
- **RADAR_PROMPT** : "Detecte les signaux faibles"
- **WEEKLY_REVIEW_PROMPT** : "Fais le bilan de la semaine"
- etc.

---

### Jobs (jobs/) — les taches en arriere-plan

#### `jobs/process-call.js` (~12 KB)
Le job le plus important. Quand tu crees une note :
1. Recoit l'ID de la note
2. Si c'est de l'audio → transcrit avec l'API OpenAI (Whisper)
3. Envoie le texte a Claude avec le prompt adapte
4. Claude retourne du JSON : titre, resume, categorie, taches, tags
5. Met a jour la note en base avec toutes ces infos
6. Passe le status de "processing" a "done"

#### `jobs/weekly-review.js` (~3 KB)
Lance automatiquement chaque semaine :
1. Recupere toutes les notes de la semaine
2. Les envoie a Claude avec le prompt de revue hebdo
3. Stocke le resultat dans la table `weekly_reviews`

---

### Base de donnees (db/schema.sql)

Les tables principales :

| Table | C'est quoi | Analogie |
|-------|-----------|----------|
| `entries` | Tes notes | Un carnet avec des pages |
| `items` | Les taches extraites des notes | La to-do list sur chaque page |
| `finance` | Tes transactions bancaires | Ton releve de compte |
| `attachments` | Les fichiers joints aux notes | Les post-it colles sur les pages |
| `context_entities` | Tes contacts, lieux, ambitions | Ton carnet d'adresses |
| `projects` | Tes projets | Les classeurs |
| `spaces` | Les espaces de travail | Les etageres |
| `config` | Les parametres cle/valeur | Les reglages de l'app |
| `weekly_reviews` | Les bilans hebdo | Le journal de bord |

---

## Le parcours d'une note (de A a Z)

Voici ce qui se passe quand tu tapes "Acheter du pain et rappeler Paul" dans le dashboard :

```
TON TELEPHONE                    SERVEUR VERCEL                    BASE DE DONNEES
     |                                |                                  |
     |-- POST /api/ingest ----------->|                                  |
     |   (texte: "Acheter du...")     |                                  |
     |                                |-- INSERT INTO entries ---------->|
     |                                |   (status: 'processing')         |
     |                                |                                  |
     |                                |-- Lance job Trigger.dev -------->|
     |<-- 200 OK (id: abc123) --------|                                  |
     |                                                                   |
     |   (tu vois la note en "traitement")                               |
     |                                                                   |
     |                          TRIGGER.DEV (en arriere-plan)            |
     |                                |                                  |
     |                                |-- Envoie le texte a Claude       |
     |                                |                                  |
     |                          CLAUDE repond :                          |
     |                          {                                        |
     |                            "title": "Courses et rappel Paul",     |
     |                            "category": "personal",                |
     |                            "summary": "- Acheter du pain\n...",   |
     |                            "items": [                             |
     |                              {"type":"task", "text":"Acheter..."},|
     |                              {"type":"reminder", "text":"Rappeler"|
     |                            ]                                      |
     |                          }                                        |
     |                                |                                  |
     |                                |-- UPDATE entries SET ... ------->|
     |                                |   (status: 'done')               |
     |                                |-- INSERT INTO items ------------>|
     |                                |                                  |
     |   (tu vois la note terminee avec titre + resume + taches)         |
```

---

## Le parcours d'un import CSV finance

```
TON TELEPHONE                    SERVEUR VERCEL                    BASE DE DONNEES
     |                                |                                  |
     |-- Tu selectionnes le CSV       |                                  |
     |                                |                                  |
     |-- POST /api/calls ------------>|                                  |
     |   ?action=finance_csv_upload   |                                  |
     |   (fichier CSV en piece jointe)|                                  |
     |                                |                                  |
     |                                |-- formidable parse le fichier    |
     |                                |-- Lit le contenu CSV             |
     |                                |                                  |
     |                                |-- Envoie le CSV a Claude ------->|
     |                                |   "Detecte le separateur,        |
     |                                |    categorise chaque ligne"      |
     |                                |                                  |
     |                          CLAUDE repond :                          |
     |                          [                                        |
     |                            {"date":"2026-03-01",                  |
     |                             "label":"BAR TABAC GOMBERT",          |
     |                             "amount":-13.50,                      |
     |                             "category":"tabac"},                  |
     |                            {"date":"2026-03-02",                  |
     |                             "label":"ANTHROPIC",                  |
     |                             "amount":-20.00,                      |
     |                             "category":"abonnement"},             |
     |                            ...                                    |
     |                          ]                                        |
     |                                |                                  |
     |                                |-- Pour chaque transaction :      |
     |                                |   INSERT INTO finance            |
     |                                |   ON CONFLICT DO NOTHING ------->|
     |                                |   (ignore les doublons)          |
     |                                |                                  |
     |<-- 200 OK (insere: 105) -------|                                  |
     |                                                                   |
     |-- loadFinance() appelle ------>|                                  |
     |   GET ?action=finance          |                                  |
     |                                |-- SELECT FROM finance ---------->|
     |                                |-- Calcul Pareto 80/20           |
     |<-- Transactions + Pareto ------|                                  |
     |                                                                   |
     |   (tu vois le bloc 80/20 avec les categories groupees)            |
```

---

## Glossaire

| Terme | C'est quoi |
|-------|-----------|
| **API** | Le "guichet" du serveur — ton telephone lui envoie des requetes et recoit des reponses |
| **Route** | Une adresse precise sur le serveur (ex: `GET /api/calls?action=finance`) |
| **GET / POST / PATCH / DELETE** | Les 4 types de requetes : lire / creer / modifier / supprimer |
| **SQL** | Le langage pour parler a la base de donnees ("donne-moi toutes les notes") |
| **Cookie** | Un petit fichier sur ton telephone qui prouve que tu es connecte |
| **HMAC-SHA256** | Un algorithme de chiffrement — transforme ton mot de passe en code illisible |
| **Service Worker** | Un programme invisible qui fait du cache et du mode offline |
| **PWA** | Progressive Web App — un site web qui se comporte comme une app native |
| **Vercel** | L'hebergeur — c'est la que le serveur tourne |
| **Neon** | L'hebergeur de la base de donnees PostgreSQL |
| **Trigger.dev** | Un service qui lance des taches en arriere-plan (transcription, analyse) |
| **Vercel Blob** | Le stockage de fichiers (audio, documents, pieces jointes) |
| **Claude / Haiku** | L'IA d'Anthropic qui analyse tes notes et categorise tes transactions |
| **Pareto 80/20** | Principe : 20% de tes categories representent 80% de tes depenses |
| **Dedup** | Deduplication — evite d'inserer deux fois la meme transaction |
| **CORS** | Securite qui empeche un site externe d'utiliser ton API |
| **Token Bearer** | Un mot de passe special pour les appels depuis iOS Shortcuts |
