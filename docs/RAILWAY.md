# Déploiement sur Railway — Guide pas à pas

Ce document décrit comment déployer l'application CID sur Railway à partir
de ce repository GitHub. Railway est utilisé comme solution de déploiement
initiale ("erstmal") ; l'architecture Hetzner/Docker Compose autonome décrite
dans le SDD (CID-SDD-001 §6) reste l'option de repli en production si besoin.

## 1. Prérequis

- Le repository `clubistes-deutschland` doit être sur GitHub (privé) — voir
  README.md §"Pousser vers GitHub".
- Un compte Railway (railway.app) connecté à ce compte GitHub.

## 2. Créer le projet Railway

1. railway.app → **New Project** → **Deploy from GitHub repo** → sélectionner
   `clubistes-deutschland`.
2. Railway propose de créer un premier service à partir du repo — annuler
   cette proposition automatique, nous allons créer les services manuellement
   (ce repo est un monorepo avec 4 services applicatifs + 2 plugins).

## 3. Ajouter les plugins de données

Dans le projet Railway :

- **+ New → Database → PostgreSQL** — Railway injecte automatiquement
  `DATABASE_URL` dans les services qui y sont reliés (référencé par
  `config/settings/base.py`).
- **+ New → Database → Redis** — idem avec `REDIS_URL`.

## 4. Service `backend` (API Django + ASGI/WebSocket)

**+ New → GitHub Repo** → `clubistes-deutschland`.

| Réglage (Settings) | Valeur |
| --- | --- |
| Root Directory | `backend` |
| Dockerfile Path | `Dockerfile.prod` (déjà référencé par `backend/railway.toml`) |
| Healthcheck Path | `/health/` |

**Variables** (Settings → Variables) — voir `.env.example` pour la liste
complète. Au minimum :

```
DJANGO_SETTINGS_MODULE=config.settings.prod
SECRET_KEY=<générer, voir PPS §3.3>
SECRET_FIELD_KEY=<générer 32 bytes base64, voir PPS §3.3>
ALLOWED_HOSTS=<domaine Railway généré ou domaine custom>
CORS_ALLOWED_ORIGINS=https://<domaine-frontend>
FRONTEND_URL=https://<domaine-frontend>
DATABASE_URL=${{Postgres.DATABASE_URL}}        # référence au plugin Postgres
REDIS_URL=${{Redis.REDIS_URL}}                  # référence au plugin Redis
CELERY_BROKER_URL=${{Redis.REDIS_URL}}
CELERY_RESULT_BACKEND=${{Redis.REDIS_URL}}
EMAIL_HOST=<smtp>
EMAIL_HOST_USER=<...>
EMAIL_HOST_PASSWORD=<...>
EMAIL_USE_TLS=True
```

Railway fournit automatiquement `PORT` — le `CMD` de `Dockerfile.prod` s'y
adapte déjà (`daphne -p ${PORT:-8000}`).

Après le premier déploiement réussi, générer le compte Administrateur App
initial (Railway → service backend → onglet **Shell**, ou via `railway run`
en local avec la CLI) :

```
python manage.py create_initial_data --email admin@clubistes.de --password "<mot de passe fort>"
```

## 5. Services `celery_worker` et `celery_beat`

Créer 2 services supplémentaires **depuis le même repo GitHub** :

| Service | Root Directory | Dockerfile Path | Start Command (override) |
| --- | --- | --- | --- |
| `celery_worker` | `backend` | `Dockerfile.prod` | `celery -A config worker -l info --concurrency=2` |
| `celery_beat` | `backend` | `Dockerfile.prod` | `celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler` |

Les deux réutilisent **exactement les mêmes variables d'environnement** que
`backend` (copier depuis le service `backend`, ou utiliser les références
`${{backend.VARIABLE}}` de Railway). Elles n'ont pas besoin d'un domaine public.

## 6. Service `frontend` (SPA React)

**+ New → GitHub Repo** → même repo.

| Réglage | Valeur |
| --- | --- |
| Root Directory | `frontend` |
| Dockerfile Path | `Dockerfile.prod` |

**Variables** (utilisées comme build args par `Dockerfile.prod`) :

```
VITE_API_BASE_URL=https://<domaine-backend>/api/v1
VITE_WS_BASE_URL=wss://<domaine-backend>/ws
```

Activer **Generate Domain** (ou brancher un domaine custom, ex.
`app.clubistes.de`) pour `backend` et `frontend`.

## 7. Stockage fichiers (MinIO) — solution initiale

Railway n'a pas d'add-on S3 natif. Pour rester 100% open source et cohérent
avec le TDD (§1, MinIO), déployer MinIO comme **5ᵉ service** depuis l'image
Docker officielle :

1. **+ New → Docker Image** → `minio/minio:latest`
2. Start Command : `server /data --console-address ":9001"`
3. Ajouter un **Volume** monté sur `/data` (persistance)
4. Variables : `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
5. Exposer le port 9000 en interne (pas de domaine public nécessaire — accès
   uniquement depuis `backend` via l'URL interne Railway)
6. Sur le service `backend`, définir `MINIO_ENDPOINT=<minio-service>.railway.internal:9000`

> Alternative plus simple à court terme : commencer sans MinIO et stocker les
> fichiers (justificatifs, photos produits) sur un volume Railway attaché
> directement au service `backend` (`FileSystemStorage` Django standard).
> À basculer vers MinIO/S3 dès que la Phase 1B (module Adhésions, justificatifs)
> est prête pour la production — pre-signed URLs nécessitent un vrai backend S3.

## 8. CI/CD — comportement avec GitHub Actions

Le pipeline `.github/workflows/ci.yml` fait le lint/test/build sur chaque
push et pull request. Railway a son propre système de build-on-push
indépendant de GitHub Actions : dès qu'un push arrive sur la branche
connectée (`main` par défaut), Railway rebuild et redéploie automatiquement
chaque service concerné. Recommandation :

- Développer sur `develop` / `feature/*`, ouvrir une PR vers `main`.
- Le CI GitHub Actions valide la PR (lint, tests, build Docker).
- Merge sur `main` → Railway redéploie automatiquement `backend`,
  `celery_worker`, `celery_beat` et `frontend`.

## 9. Checklist avant d'ouvrir l'accès aux premiers membres

Reprendre la checklist sécurité complète du Security Concept Document
(CID-SCD-001 §10.2, SC-01 à SC-15) avant toute mise en production réelle,
en particulier :

- `DEBUG=False` (déjà forcé par `config/settings/prod.py`)
- `SECRET_KEY` / `SECRET_FIELD_KEY` générés spécifiquement pour la prod,
  différents des valeurs de `.env.example`
- 2FA activé sur le compte Administrateur App
- Backup PostgreSQL configuré (Railway propose des backups automatiques sur
  les plans payants — vérifier la rétention et tester une restauration)
