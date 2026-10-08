# CLAUDE.md — Contrat de développement, application CID

Ce fichier est le contrat entre l'équipe et Claude Code pour la suite du
développement de l'application **Clubistes in Deutschland (CID)**. À lire
avant toute nouvelle phase de travail. Source de vérité : les documents
projet (`CID-FDD-001 v1.3`, `CID-SDD-001`, `CID-TDD-001 v1.2`,
`CID-SCD-001`, `CID-RFC-001`, `CID-PPS-001`, `CID-PTL-001 v1.2`,
`CID-RPL-001 v1.1`) et, pour l'exploitation, `docs/RAILWAY.md`.

Dernière mise à jour : 2026-10-08 (release `release-2026.10.08` en PROD).

## 1. Contexte et objectif

CID est la plateforme numérique de l'association Clubistes in Deutschland
(supporters du Club Africain de Tunis résidant en Allemagne) : gestion des
membres, cotisations, offres d'adhésion, événements, boutique, votes
temps réel, communauté, projets, finances, statistiques. Construite
intégralement en Django + React, 100 % open source. Développée
bénévolement ; l'association n'a pas de capacité d'exploitation serveur →
uniquement des services managés (Railway), pas de VPS auto-géré.

Équipe : Abir Mejri (analyse métier, gestion des exigences), Amir Kahouach
et Ghazi Habita (architecture, réalisation, design, tests).

## 2. Environnements DEV / PROD (depuis 2026-10-07)

| | DEV (privé, Ghazi) | PROD (association) |
|---|---|---|
| GitHub | `GhaziHabita/cid-app` — développement, PR, CI | `MyCIDAdmin/cid-app` — uniquement des releases, aucun commit direct |
| Railway | projet privé | workspace de l'association, projet `cid-prod` (plan Hobby) |
| Domaine | my-cid.de / api.my-cid.de | mycid.org / api.mycid.org (bascule DNS encore à faire ; PROD tourne pour l'instant sur les domaines Railway) |
| Données | données de test, Stripe test / PayPal sandbox | données réelles (démarre vide), Stripe/PayPal live plus tard |
| Secrets | propres à DEV | propres à PROD — **jamais copiés d'un environnement à l'autre, jamais dans le chat ni dans git** |

Chaque environnement = 7 services Railway : `backend`, `celery_worker`,
`celery_beat`, `frontend`, `minio`, Postgres, Redis.

**Flux de release** (voir `docs/RAILWAY.md` §11) :

1. Branche de travail → PR → `main` du dépôt privé, CI verte.
2. Tag `release-YYYY.MM.DD[-n]` posé sur un commit de `main` (CI verte).
3. `.github/workflows/promote.yml` pousse ce commit **sans force** vers
   `main` de `MyCIDAdmin/cid-app` (secret `PROD_DEPLOY_KEY`) avec le tag.
4. Railway PROD déploie automatiquement depuis le dépôt de l'association.

Règles : hotfix = corriger et tester dans le dépôt privé puis nouveau tag
(pas de détour par le dépôt PROD). Migrations **uniquement compatibles
vers l'avant** (colonne ajoutée avec défaut, jamais de suppression dans la
même release). Rollback = « Redeploy » d'un déploiement précédent dans
Railway. Dernière release : `release-2026.10.08c` (Django 5.2 LTS, CSP bloquante, tri du
annuaire des membres, logos des clubs dans le Tippspiel).

`promote.yml` ne s'exécute que dans le dépôt DEV (condition `github.repository`,
depuis `release-2026.10.08c`) ; dans le dépôt PROD le job est ignoré.

## 3. Stack technique (versions exactes — voir TDD §1)

- **Backend** : Django 5.2 LTS + DRF 3.17, PostgreSQL 15, Redis 7,
  Django Channels 4 + Daphne (WebSocket/ASGI), Celery 5.4 + Celery Beat,
  MinIO (S3-compatible), WeasyPrint/ReportLab (PDF), openpyxl (Excel),
  django-anymail (Brevo, e-mails transactionnels).
- **Frontend** : React 18 + Vite 5, TypeScript 5, Tailwind CSS 3,
  Zustand 4, React Router 6, Axios + React Query 5, react-i18next 15,
  React Hook Form + Zod, Recharts, Socket.IO client, vitest + Testing
  Library.
- **Services externes** : Stripe et PayPal (paiement), Brevo (e-mail),
  DeepL (aide à la traduction), GOAL API (données football du Fan-Club).
  Clés uniquement via variables d'environnement Railway.
- **Infra** : Docker + Docker Compose (dev local, optionnel), GitHub
  Actions (CI + promotion), **Railway** (DEV et PROD — `docs/RAILWAY.md`).

## 4. Structure des dossiers

```
clubistes-deutschland/
  backend/
    config/               # settings (base/dev/prod), ASGI, urls, celery
    apps/
      accounts/            # User 5 rôles, 2FA/TOTP, JWT, session unique par appareil
      rbac/                # matrice rôles × modules, droits lecture/écriture
      membres/             # fiche membre (chiffrement AES-256), import avec
                           #   vérification + rapport, historique de statut,
                           #   rapprochement comptes ↔ fiches importées
      cotisations/         # paiements, reçus PDF, relances, exports Excel
      adhesions/           # campagnes, offres, justificatifs, carte numérique
      evenements/          # événements, inscriptions, covoiturage
      boutique/            # catalogue, variantes/stock, panier, commandes, bons
      vote/                # sessions temps réel, WebSocket, anonymat HMAC
      communaute/          # fil, forum, messagerie, Fan-Club (classement, calendrier,
                           #   Tippspiel), albums, quiz
      projets/             # projets & actions, tâches (Kanban), coûts prévus/réels
      finances/            # budget, bilan, validation « quatre yeux »
      partenaires/         # Business Partner, bannières de sponsors
      stats/               # KPIs, rapports, pivot, exports Excel/PDF
      notifications/       # in-app + e-mail (tâches Celery)
      uebersetzung/        # aide à la traduction (DeepL)
    requirements/{base,dev,prod}.txt
    Dockerfile.{dev,prod}
  frontend/
    src/{api,components,pages,hooks,store,types,utils}/
    src/pages/public/      # page d'accueil publique (visiteurs non connectés)
    public/locales/{de,fr,ar}/   # un fichier JSON par module (+ help.json, public.json)
    Dockerfile.{dev,prod}
  nginx/conf.d/             # dev.conf (proxy local) — prod géré par Railway
  .github/workflows/{ci.yml,promote.yml}
  docker-compose.yml        # stack dev complète (9 services)
  docs/RAILWAY.md           # déploiement Railway, DEV/PROD, promotion (§11)
  CLAUDE.md                 # ce fichier
```

## 5. Conventions de nommage

- **Backend** : `snake_case` partout (modèles, champs, endpoints URL,
  variables). Noms de domaine en français dans le modèle de données
  (`campagne_adhesion`, `souscription`, `membre`) conformément au FDD/TDD.
- **Frontend** : `camelCase` pour variables/fonctions JS/TS, `PascalCase`
  pour composants React, fichiers de composants en `PascalCase.tsx`.
- **API REST** : `/api/v1/<module>/...`, JSON exclusivement, erreurs au
  format `{ "code": "...", "message": "...", "details": {} }` (voir
  `apps.accounts.exceptions.cid_exception_handler`).
- **Langues de l'interface** : allemand et français obligatoires pour tout
  nouveau texte (`public/locales/{de,fr}/<module>.json`) ; l'arabe (RTL)
  est en cours. Les rapports et exports sont en allemand.
- **Aide contextuelle** : toute nouvelle page d'administration importante
  reçoit son entrée dans `locales/{de,fr}/help.json` et dans
  `components/layout/helpRoutes.ts` (bouton « Hilfe » de l'en-tête).
- **Git** : `main` est la seule branche longue (pas de `develop`). Travail
  sur `feature/<sujet>` ou `fix/<sujet>`, jamais directement sur `main` ;
  merge via PR quand la CI est verte. Pas de commit direct dans le dépôt
  PROD.

## 6. Variables d'environnement

Voir `.env.example` — copier en `.env` pour le développement local. Sur
Railway (DEV et PROD), les variables sont définies par service, jamais
committées ; les services Celery utilisent des références `${{backend.VAR}}`.
Variables de build du frontend : `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`,
`VITE_SITE_URL`. Ne jamais commiter de vraie valeur de `SECRET_KEY`,
`SECRET_FIELD_KEY`, mots de passe, clés API, ni de **clé de déploiement
SSH** (garder `cid_prod_deploy_v2*` hors du dossier du dépôt).

## 7. Commandes de développement

```bash
cp .env.example .env
docker-compose up --build -d
docker-compose ps                       # vérifier que les 9 services sont healthy
docker-compose exec backend python manage.py migrate
docker-compose exec backend python manage.py createsuperuser
docker-compose exec backend python -m pytest
docker-compose exec frontend npm run lint
docker-compose logs -f backend
```

Frontend seul : `cd frontend && npm install && npm run dev` ; tests
`npm test`, qualité `npx tsc --noEmit`, `npm run lint`, `npx prettier
--check`. Backend seul : Postgres + Redis nécessaires (la CI utilise
SQLite + Redis) ; voir `backend/requirements/dev.txt`. Avant chaque PR :
pytest, vitest, tsc, eslint et prettier verts.

Créer le premier administrateur en PROD : Railway CLI (`railway link`,
`railway ssh --service backend`), puis
`HOME=/home/django python manage.py create_initial_data --email … --password …`
(jamais de mot de passe dans le chat ou dans git).

## 8. État d'avancement (2026-10-08)

| Bloc | Statut |
| --- | --- |
| Phases 0–4B (infrastructure, comptes/2FA, membres, cotisations, adhésions, événements, boutique, stats, notifications, vote temps réel, communauté, live/Fan-Club, albums, quiz) | ✅ fait |
| Compléments post-R2 : RBAC, projets & actions, finances/bilan, partenaires, page d'accueil publique, traduction DeepL, Tippspiel, carte de membre numérique, import de membres avec vérification et rapport, rapprochement des comptes, aide contextuelle | ✅ fait |
| Séparation DEV / PROD, promotion par tag | ✅ fait (2026-10-07) |
| PROD en ligne sur les domaines Railway (`release-2026.10.07`, `release-2026.10.08`, `-b`, `-c`) ; base PROD : seul le superadmin, aucune campagne d'adhésion publiée | ✅ fait |
| Contrôle de sécurité (07.10.2026) : backend pass 1, XSS (DOMPurify), en-têtes nginx, dépendances ; Django 5.2 LTS ; CSP bloquante | ✅ fait (08.10.2026) |
| Reprise des données dans PROD (membres → historique → cotisations → événements → projets) ; sauvegarde `pg_dump` avant chaque bloc (le plan Hobby n'a pas de backup automatique) | à faire |
| Domaine mycid.org, Brevo (domaine authentifié), Stripe/PayPal live, secrets propres à PROD | à faire |
| Go-Live gate : test de restauration, politique de suppression des buckets, WeasyPrint à mettre à jour (62.3), mentions légales avec les données de l'association | à faire |
| Phase 5 : arabe RTL complet, tests E2E (Cypress), charge (Locust), OWASP ZAP | à faire |

Priorité fonctionnelle **au sein** de chaque bloc : P0 avant P1 avant P2
(FDD §1.3 et RICEFW).

## 9. Règles de sécurité obligatoires (violation = à corriger avant merge)

Voir CID-SCD-001 §12.2 pour la liste complète. Rappels critiques :

- Aucun secret en dur dans le code ou les commentaires.
- ORM Django exclusivement — jamais de SQL brut sans paramètres préparés.
- Toute nouvelle API a sa classe de permission DRF (rôle + RBAC) et ses
  tests d'IDOR.
- Toute donnée personnelle nouvelle est documentée (durée de conservation) ;
  les champs sensibles (CIN, passeport, messages privés) restent chiffrés.
- Uploads : validation MIME (`python-magic`) + whitelist d'extensions.
- Le prix/montant final est **toujours** recalculé côté serveur, jamais
  fait confiance au frontend (cotisations, boutique, adhésions).
- Les imports de données passent par l'étape de vérification et ne
  s'exécutent qu'après confirmation explicite ; chaque import produit un
  rapport (statut et motif par ligne).
- Aucune donnée personnelle réelle dans les tests, captures ou présentations.

## 10. Tests

- Backend : `pytest` (>80 % de couverture visée), voir `backend/pytest.ini`.
  `backend/conftest.py` vide le cache Redis avant chaque test (throttling).
- Frontend : `vitest` + Testing Library.
- Volume au 2026-10-08 : ≈ 2 770 tests automatisés (backend + frontend).
- CI (`.github/workflows/ci.yml`) : lint + tests backend, lint + tests +
  build frontend, sur `main` et sur chaque PR. Une release n'est promue en
  PROD que si la CI du commit tagué est verte.
- E2E : Cypress — pas encore configuré. Charge : Locust — pas encore configuré.

## 11. Référence UI

Le mockup HTML `clubistes_deutschland_mockup_v2.html` (32 écrans, dans le
Projet Claude « MyCID ») reste la référence visuelle. Charte graphique :
rouge `#CC0000` (`ca`), rouge foncé `#8B0000` (`cad`), sidebar `#1A0000`
(`sb`) — déjà repris dans `frontend/tailwind.config.js`. Depuis le merge
avec le site `mycid.org` (septembre 2026), la page d'accueil publique, la
boutique et les projets reprennent la structure de mycid.org ; la
présentation du site existant (Lovable) sert de référence pour ces pages.
