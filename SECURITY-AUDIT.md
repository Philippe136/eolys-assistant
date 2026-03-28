# Audit Securite Vox — Mars 2026

## Resume

| Categorie | Niveau | Verdict |
|-----------|--------|---------|
| Authentification | Correct | Mot de passe unique + rate-limit (5 tentatives / 15 min) |
| Autorisation | Correct | Session verifiee sur chaque route API |
| Validation des entrees | Correct | UUID valides, SQL parametre, HTML escape, MIME types verifies |
| Secrets | Correct | Variables .env, pas en dur dans le code |
| CORS | Correct | Restreint au domaine + SameSite=Strict |
| Headers securite | Correct | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Infrastructure | Correct | HTTPS force par Vercel, cookies Secure + HttpOnly |

**Score global : 7/10** — Corrections appliquees le 28 mars 2026. Acceptable pour une app personnelle.

---

## Problemes trouves et corrections

### CRITIQUE — A corriger en priorite

#### 1. Pas de rate-limiting sur le login
**Risque :** Un attaquant peut essayer des milliers de mots de passe par minute.
**Ou :** `api/auth.js`
**Correction :**
```
Ajouter un compteur de tentatives echouees.
Apres 5 echecs → bloquer pendant 15 minutes.
Stocker le compteur dans la table `config` par IP.
```

#### 2. Pas de validation des entrees utilisateur
**Risque :** Injection SQL (theoriquement protege par les template literals de Neon, mais pas garanti), XSS dans les notes.
**Ou :** `api/calls.js` — routes PATCH, POST
**Exemples concrets :**
- Le champ `label` dans les transactions finance n'est pas nettoye
- Le champ `title` et `summary` dans les notes peuvent contenir du HTML/JS malveillant
- Les `id` ne sont pas toujours valides (certaines routes verifient UUID, d'autres non)
**Correction :**
```
1. Valider tous les UUID avec un regex avant de les utiliser en SQL
2. Echapper le HTML dans les champs texte (escHtml existe dans lib/auth.js mais n'est pas utilise partout)
3. Limiter la longueur des champs (label: 200 car, title: 200 car, summary: 5000 car)
```

#### 3. Mot de passe unique pour tous les utilisateurs
**Risque :** Si quelqu'un connait le mot de passe, il a acces a TOUT (notes, finances, emails).
**Ou :** `api/auth.js`, `lib/auth.js`
**Correction :**
```
Option simple : garder le mot de passe unique (app personnelle, un seul utilisateur).
Option robuste : ajouter un systeme de comptes (table users, hash bcrypt, sessions par utilisateur).
Pour une app perso, le mot de passe unique est acceptable SI il est fort (20+ caracteres).
```

### IMPORTANT — A corriger ensuite

#### 4. Cookie de session sans protection CSRF
**Risque :** Un site malveillant pourrait envoyer des requetes a ton API en utilisant ton cookie.
**Ou :** Cookie `eolys_session` dans `api/auth.js`
**Ce qui est deja fait :** `SameSite=Strict` (bonne protection de base).
**Ce qui manque :** Un token CSRF pour les actions sensibles (delete, modification).
**Correction :**
```
SameSite=Strict est suffisant pour une app personnelle.
Pour aller plus loin : ajouter un header X-Requested-With verifie cote serveur.
```

#### 5. Pas de Content-Security-Policy (CSP)
**Risque :** Si du JS malveillant est injecte dans une note, il peut s'executer dans le navigateur.
**Ou :** Headers HTTP (pas configure)
**Correction :**
```
Ajouter dans vercel.json :
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.anthropic.com" }
    ]
  }
]
```

#### 6. Les cles API sont accessibles depuis le frontend
**Risque :** `api/claude.js` fait proxy vers Claude, mais si le frontend appelle directement l'API Anthropic, la cle est exposee.
**Ou :** `api/claude.js`
**Ce qui est deja fait :** Le proxy verifie l'origine (`requireWebOrigin`).
**Ce qui manque :** Rate-limiting sur ce proxy.
**Correction :**
```
Ajouter un rate-limit : max 20 appels/minute par session.
```

#### 7. Upload de fichiers sans verification de type
**Risque :** Quelqu'un pourrait uploader un fichier malveillant (exe, script).
**Ou :** `api/calls.js` (upload-attachment), `api/ingest.js`
**Correction :**
```
1. Verifier le MIME type (accepter uniquement image/*, audio/*, application/pdf, text/*)
2. Limiter la taille (deja fait pour ingest: 25MB audio, 20MB doc)
3. Ne jamais executer un fichier uploade
```

### MINEUR — Bonnes pratiques

#### 8. Logs insuffisants
**Risque :** Difficile de detecter une intrusion ou un bug.
**Correction :** Ajouter des `console.log` structures sur les actions sensibles (login, delete, upload).

#### 9. Pas de sauvegarde automatique de la DB
**Risque :** Si la base est corrompue ou supprimee, tout est perdu.
**Correction :** Neon offre le point-in-time recovery sur le plan payant. Sinon, ajouter un export CSV automatique hebdomadaire.

#### 10. Variables d'environnement non documentees
**Risque :** Si tu perds l'acces a Vercel, tu ne sais plus quelles variables sont necessaires.
**Correction :** Deja corrige dans le CLAUDE.md (table des variables).

---

## Ce qui est BIEN fait (a garder)

| Point | Detail |
|-------|--------|
| Cookie HttpOnly | Le cookie de session n'est pas lisible par JavaScript → protege contre le vol de session via XSS |
| Cookie Secure | Le cookie n'est envoye que sur HTTPS |
| SameSite=Strict | Empeche les requetes cross-site → bonne protection CSRF de base |
| HMAC-SHA256 | Le token de session est signe → impossible a falsifier sans connaitre le secret |
| Expiration 7 jours | La session expire automatiquement |
| CORS restrictif | Seul le domaine de l'app est autorise |
| Template literals SQL | Les requetes SQL utilisent des template literals (`sql\`...\``) → protection contre l'injection SQL de base |
| HTTPS force | Vercel force HTTPS sur tout le trafic |
| Fichiers .env ignores | `.env.local` est dans `.gitignore` → les secrets ne sont pas dans le code source |

---

## Plan d'action recommande

### Etape 1 — Immediat (30 min)
- [ ] Verifier que `DASHBOARD_SECRET` est defini et fort (20+ caracteres, aleatoire)
- [ ] Ajouter la validation UUID sur TOUTES les routes qui recoivent un `id`
- [ ] Ajouter `escHtml()` sur les champs affiches dans le HTML (label, title, summary)

### Etape 2 — Court terme (2h)
- [ ] Ajouter le rate-limiting sur `/api/auth` (5 tentatives max / 15 min)
- [ ] Ajouter les headers CSP dans `vercel.json`
- [ ] Verifier les MIME types sur les uploads

### Etape 3 — Moyen terme (optionnel, app perso)
- [ ] Ajouter un header `X-Requested-With` pour renforcer la protection CSRF
- [ ] Ajouter des logs structures (login, delete, upload)
- [ ] Mettre en place un export/backup automatique de la DB

---

## Conclusion

Pour une **app personnelle** utilisee par une seule personne, le niveau de securite actuel est **acceptable** si :
1. Le mot de passe (`DASHBOARD_SECRET`) est fort et unique
2. L'URL de l'app n'est pas partagee publiquement
3. Tu ne stockes pas de donnees ultra-sensibles (numeros de carte, mots de passe)

Les transactions bancaires importees sont des **donnees sensibles**. L'etape 1 (validation + escaping) devrait etre faite rapidement pour eviter les risques les plus evidents.
