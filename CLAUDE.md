# CLAUDE.md — Contrat de développement, application CID

Ce fichier est le contrat entre l'équipe et Claude Code pour la suite du
développement de l'application **Clubistes in Deutschland (CID)**. À lire
avant toute nouvelle phase de travail. Source de vérité : les documents
projet (`CID-FDD-001 v1.3`, `CID-SDD-001`, `CID-TDD-001 v1.2`,
`CID-SCD-001`, `CID-RFC-001`, `CID-PPS-001`, `CID-PTL-001 v1.2`,
`CID-RPL-001 v1.1`).

## 1. Contexte et objectif

CID est la plateforme numérique de l'association Clubistes in Deutschland
(supporters du Club Africain de Tunis résidant en Allemagne) : gestion des
membres, cotisations, offres d'adhésion, événements, boutique, votes
temps réel, communauté, statistiques. Construite intégralement en Django +
React, 100% open source.

## 2. Stack technique (versions exactes — voir TDD §1)

- **Backend** : Django 4.2 LTS + DRF 3.15, PostgreSQL 15, Redis 7,
  Django Channels 4 + Daphne (WebSocket/ASGI), Celery 5 + Celery Beat,
  MinIO (S3-compatible), WeasyPrint/ReportLab (PDF), openpyxl (Excel).
- **Frontend** : React 18 + Vite 5, TypeScript, Tailwind CSS 3,
  Zustand 4, React Router 6, Axios + React Query 5, react-i18next 15,
  React Hook Form + Zod, Recharts, Socket.IO client.
- **Infra** : Docker + Docker Compose (dev), GitHub Actions (CI/CD),
  **Railway** (déploiement — voir `docs/RAILWAY.md`).

## 3. Structure des dossiers

```
clubistes-deutschland/
  backend/
    config/               # settings (base/dev/prod), ASGI, urls, celery
    apps/
      accounts/            # ✅ Phase 1A — User 5 rôles, 2FA, JWT, RBAC
      membres/              # Phase 1B — CRUD membres, chiffrement AES-256
      cotisations/          # Phase 1B — paiements, reçus PDF, relances
      adhesions/            # Phase 1B — campagnes, offres, justificatifs
      evenements/           # Phase 2A — CRUD, inscriptions, covoiturage
      boutique/             # Phase 2A/2B — catalogue, panier, commandes
      vote/                 # Phase 3 — sessions RT, WebSocket, anonymat HMAC
      communaute/           # Phase 4 (R2) — forum, messagerie, fil, live
      stats/                # Phase 2B/5 — KPIs, exports
      notifications/        # Phase 1B+ — modèle + tâches Celery email
    requirements/{base,dev,prod}.txt
    Dockerfile.{dev,prod}
  frontend/
    src/{api,components,pages,hooks,store,utils}/
    public/locales/{fr,de,ar}/
    Dockerfile.{dev,prod}
  nginx/conf.d/             # dev.conf (proxy local) — prod géré par Railway
  .github/workflows/ci.yml
  docker-compose.yml        # stack dev complète (9 services)
  docs/RAILWAY.md           # guide de déploiement Railway
  CLAUDE.md                 # ce fichier
```

## 4. Conventions de nommage

- **Backend** : `snake_case` partout (modèles, champs, endpoints URL,
  variables). Noms de domaine en français dans le modèle de données
  (`campagne_adhesion`, `souscription`, `membre`) conformément au FDD/TDD.
- **Frontend** : `camelCase` pour variables/fonctions JS/TS, `PascalCase`
  pour composants React, fichiers de composants en `PascalCase.tsx`.
- **API REST** : `/api/v1/<module>/...`, JSON exclusivement, erreurs au
  format `{ "code": "...", "message": "...", "details": {} }` (voir
  `apps.accounts.exceptions.cid_exception_handler`).
- **Git** : branches `main` (prod), `develop` (intégration),
  `feature/<module>-<description>` pour le travail en cours.

## 5. Variables d'environnement

Voir `.env.example` — copier en `.env` pour le développement local. En
production (Railway), les variables sont définies par service dans les
Settings Railway, jamais committées. Ne jamais commiter de vraie valeur de
`SECRET_KEY`, `SECRET_FIELD_KEY`, mots de passe ou tokens.

## 6. Commandes de développement

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

Frontend seul (hors Docker) : `cd frontend && npm install && npm run dev`.
Backend seul (hors Docker) : nécessite Postgres + Redis locaux ou distants ;
voir `backend/requirements/dev.txt`.

## 7. Ordre des modules à construire (priorités P0 → P2)

Suivre strictement l'ordre du Release Plan v1.1 (`CID-RPL-001`) et du
Timeline v1.2 (`CID-PTL-001`) :

| Phase | Contenu | Statut |
| --- | --- | --- |
| Phase 0 (S1-2) | Infrastructure, Docker, CI/CD, Railway | ✅ fait |
| Phase 1A (S3-4) | `apps.accounts` — User 5 rôles, 2FA, JWT, RBAC | ✅ fait |
| Phase 1B (S5-6) | `apps.membres`, `apps.cotisations`, `apps.adhesions` | ✅ fait |
| Phase 2A (S7-8) | `apps.evenements`, `apps.boutique` (modèles + API) | ✅ fait |
| Phase 2B (S9-10) | Boutique admin React, adhésions React, `apps.stats` (3 onglets), `apps.notifications` (11 types) | ✅ fait |
| Phase 3 — Vote (S11-12) | `apps.vote` — Django Channels, WebSocket, anonymat HMAC (backend fait ; frontend React à suivre) | 🟡 backend fait |
| Go-Live R1 (fin S12) | Smoke tests R1, déploiement Railway production | à faire |
| Phase 4A/4B (S13-15, R2) | `apps.communaute` — forum, messagerie, live, albums, quiz | à faire |
| Phase 5 (S16-17) | i18n arabe RTL complet, tests E2E, Locust 1000 users, OWASP ZAP | à faire |
| Go-Live R2 (S18) | Application complète en production | à faire |

Priorité fonctionnelle **au sein** de chaque phase : toujours P0 avant P1
avant P2 (voir la colonne Priorité du FDD §1.3 et du RICEFW).

## 8. Règles de sécurité obligatoires (violation = à corriger avant merge)

Voir CID-SCD-001 §12.2 pour la liste complète. Rappels critiques :

- Aucun secret en dur dans le code ou les commentaires.
- ORM Django exclusivement — jamais de SQL brut sans paramètres préparés.
- Toute nouvelle API a sa classe de permission DRF + ses tests d'IDOR.
- Toute donnée personnelle nouvelle est documentée (durée de conservation).
- Uploads : validation MIME (`python-magic`) + whitelist d'extensions.
- Le prix/montant final est **toujours** recalculé côté serveur, jamais
  fait confiance au frontend (cotisations, boutique, adhésions).

## 9. Tests

- Backend : `pytest` (>80% coverage visé), voir `backend/pytest.ini`.
  `backend/conftest.py` vide le cache Redis avant chaque test (throttling).
- Frontend : `vitest` + Testing Library.
- E2E (à partir de Phase 2) : Cypress — pas encore configuré.
- Charge (à partir de Phase 3) : Locust — pas encore configuré.

## 10. Référence UI

Le mockup HTML `clubistes_deutschland_mockup_v2.html` (32 écrans, dans le
Projet Claude "MyCID") est la référence visuelle contraignante. Charte
graphique : rouge `#CC0000` (`ca`), rouge foncé `#8B0000` (`cad`), sidebar
`#1A0000` (`sb`) — déjà repris dans `frontend/tailwind.config.js`.
