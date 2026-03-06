# ROADMAP — Eolys Assistant

## Phase actuelle : MVP (v1.0)

**Statut** : Deploye et fonctionnel sur Vercel + Trigger.dev + Neon.

### Fonctionnalites livrees
- [x] Upload audio via iOS Shortcut (raw body) et curl (multipart)
- [x] Stockage audio sur Vercel Blob
- [x] Transcription automatique (Whisper)
- [x] Analyse structuree (Claude Haiku 4.5) : titre, resume, actions, email
- [x] Creation automatique de carte Trello
- [x] Creation automatique de brouillon Outlook (via OAuth Microsoft) — pret, non active
- [x] Dashboard web avec liste des appels, stats, suppression unitaire et groupee
- [x] Polling automatique pour affichage des resultats
- [x] Page d'accueil avec saisie manuelle de transcription

### Limites connues
- Aucune authentification (endpoints publics)
- Aucun test automatise
- Prompt systeme duplique dans 3 fichiers
- Code mort (`api/transcribe.js`)
- Fichiers audio publiquement accessibles
- Pas de nettoyage des blobs a la suppression
- Proxy Claude ouvert (`/api/claude`) exploitable

---

## Phase V1.1 — Quick wins (1-2 semaines)

Objectif : **securiser le MVP et nettoyer la dette technique**.

| Tache | Effort | Priorite |
|---|---|---|
| Ajouter une authentification par API key sur `/api/ingest` et `/api/claude` | 2h | CRITIQUE |
| Supprimer le message d'erreur qui expose la cle API dans `api/claude.js` | 15min | CRITIQUE |
| Restreindre CORS a l'origine du domaine Vercel | 1h | CRITIQUE |
| Supprimer le fichier `api/transcribe.js` (code mort) | 15min | Haute |
| Centraliser le SYSTEM_PROMPT dans un fichier unique (`lib/prompts.js`) | 1h | Haute |
| Utiliser `lib/db.js` dans tous les endpoints au lieu de `neon()` inline | 1h | Haute |
| Echapper les parametres HTML dans `auth-microsoft-callback.js` | 30min | Haute |
| Ajouter une validation UUID centralisee (`lib/validators.js`) | 30min | Moyenne |
| Retirer le prompt systeme du code client (`index.html`) | 1h | Moyenne |
| Persister les resultats du flux B (transcription collee) en base | 2h | Moyenne |

**Effort total estime : ~10h**

---

## Phase V1.2 — Robustesse (2-4 semaines)

Objectif : **fiabiliser le produit pour un usage quotidien**.

| Tache | Effort | Priorite |
|---|---|---|
| Validation du JSON Claude avec Zod + retry en cas d'echec de parsing | 3h | Haute |
| Rate limiting sur les endpoints (upstash/ratelimit ou Vercel KV) | 3h | Haute |
| Passer les blobs Vercel en acces prive + URL signees | 2h | Haute |
| Supprimer le blob Vercel quand un appel est supprime (DELETE) | 2h | Haute |
| Ajouter une authentification dashboard (session cookie ou SSO Microsoft) | 4h | Haute |
| Ajouter Sentry pour le monitoring des erreurs | 2h | Moyenne |
| Ecrire des tests unitaires pour les handlers API (vitest) | 6h | Moyenne |
| Ecrire des tests d'integration pour le job process-call | 4h | Moyenne |
| Ajouter un healthcheck endpoint (`/api/health`) | 30min | Moyenne |
| Valider le type de fichier audio avant upload (magic bytes) | 2h | Faible |
| Ajouter des logs structures (JSON) pour faciliter le debug | 2h | Faible |
| Creer un middleware partage pour CORS + auth + error handling | 3h | Faible |

**Effort total estime : ~34h**

---

## Phase V2.0 — Fonctionnalites avancees (1-2 mois)

Objectif : **transformer le MVP en outil de pilotage business**.

| Tache | Effort | Priorite |
|---|---|---|
| Carnet de contacts en base + detection automatique du destinataire email | 1 semaine | Haute |
| Pre-remplissage du champ `To:` dans les brouillons Outlook | 2 jours | Haute |
| Actions cochables dans le dashboard (suivi des taches) | 3 jours | Haute |
| Vue "Actions ouvertes" avec filtres (projet, type, date) | 2 jours | Haute |
| Relance automatique par email si action non traitee apres N jours | 2 jours | Moyenne |
| Statistiques d'usage (appels/semaine, repartition par type, tendances) | 3 jours | Moyenne |
| Export CSV/Excel des comptes rendus et actions | 1 jour | Moyenne |
| Architecture event-driven : decoupler les integrations du job principal | 3 jours | Moyenne |
| Plugin Slack : notification a la fin du traitement | 2 jours | Faible |
| Plugin Notion : sauvegarde du compte rendu dans une database Notion | 2 jours | Faible |
| Mode multi-utilisateur (plusieurs comptes Eolys) | 1 semaine | Faible |
| Transcription live (streaming audio depuis iOS) | 2 semaines | Faible |

**Effort total estime : 6-8 semaines**

---

## Notes techniques

- **Stack** : Vercel Serverless (Node.js ESM), Trigger.dev v4, Neon Postgres, Vercel Blob
- **APIs externes** : OpenAI (Whisper), Anthropic (Claude Haiku 4.5), Trello REST, Microsoft Graph
- **Deploiement** : `git push` → Vercel auto-deploy + `npx trigger.dev deploy` pour les jobs
- **Base de donnees** : Schema dans `schema.sql`, migrations via Neon SQL Editor
