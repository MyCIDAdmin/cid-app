# Déploiement sur Railway — Guide pas à pas

Ce document décrit comment déployer l'application CID sur Railway à partir
de ce repository GitHub. Railway est utilisé comme solution de déploiement
initiale ("erstmal") pour lancer rapidement le développement et les tests ;
l'architecture Hetzner/Docker Compose autonome décrite dans le SDD
(CID-SDD-001 §6) reste l'option de repli en production, et **toute
l'architecture de ce repo est conçue pour rendre cette bascule triviale** —
voir §10 "Portabilité & migration" ci-dessous, à lire avant le Go-Live.

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
BREVO_API_KEY=<clé API Brevo>                   # voir note ci-dessous
EMAIL_HOST=<smtp>
EMAIL_HOST_USER=<...>
EMAIL_HOST_PASSWORD=<...>
EMAIL_USE_TLS=True
```

**Email — attention au plan Railway (ajouté le 2026-09-19) :** Railway bloque
intégralement le SMTP sortant (ports 25/465/587/2525) sur les plans
Free/Trial/Hobby — seul le plan **Pro** le débloque. Tant que le service
`backend` tourne sur un plan Free/Trial/Hobby (ex. environnement privé de
test), `EMAIL_HOST`/`EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD` ci-dessus
**ne fonctionneront pas**, quelle que soit leur configuration (la requête
SMTP reste bloquée en amont par Railway).

La solution : définir `BREVO_API_KEY` (Menu Brevo → SMTP & API → API Keys sur
app.brevo.com) — `config/settings/prod.py` bascule alors automatiquement sur
l'API HTTPS de Brevo (via `django-anymail`) au lieu du SMTP, ce qui
fonctionne sur n'importe quel plan Railway (aucun port SMTP requis). Une fois
la migration vers le plan Pro effectuée, `EMAIL_HOST_USER`/SMTP redevient une
alternative valable — il suffit de ne pas définir `BREVO_API_KEY` pour
revenir dessus (priorité : `BREVO_API_KEY` > SMTP > logs du service si
aucun des deux n'est configuré, voir `config/settings/prod.py`).

⚠️ La clé SMTP Brevo actuelle a été brièvement partagée en clair dans une
session de chat précédente — à régénérer sur app.brevo.com avant toute mise
en production (SMTP & API → SMTP → régénérer la clé), que l'on passe par
l'API ou le SMTP.

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
5. Exposer le port 9000 en interne (pas de domaine public nécessaire pour le
   trafic backend → MinIO — accès depuis `backend` via l'URL interne Railway)
6. Sur le service `backend`, définir `MINIO_ENDPOINT=<minio-service>.railway.internal:9000`
7. Les buckets nécessaires (`cid-media`, `justificatifs`, `produits`,
   `projets`, `exports` — voir noms exacts dans `.env.example`) sont créés
   et configurés **automatiquement** à chaque démarrage du backend par
   `python manage.py setup_minio_buckets` (ajouté le 2026-09-23, exécuté
   dans le `CMD` de `Dockerfile.prod` juste après `migrate` — voir sa
   docstring dans `backend/apps/accounts/management/commands/
   setup_minio_buckets.py`) : rien à faire manuellement dans la console
   MinIO (`:9001`) ni via `mc mb`/`mc anonymous set download`, y compris
   en cas d'ajout d'un futur bucket (l'ajouter simplement à la liste
   `BUCKETS_PUBLICS`/`BUCKETS_PRIVES` de ce script).
8. **`cid-media` (fil d'actualité + albums), `produits` et `projets` sont
   configurés en lecture publique** par ce script ; `justificatifs` et
   `exports` restent privés (accès via URL pré-signée à durée limitée).
   Historique : avant le 2026-09-23, seul `produits` était documenté ici
   comme public — `cid-media` et `projets` restaient donc en politique
   privée MinIO par défaut, provoquant un 403 Forbidden (+ Opaque Response
   Blocking côté navigateur, qui masque l'erreur XML MinIO derrière une
   erreur réseau générique sur l'`<img>`) sur les photos d'albums puis sur
   les images du module Projets & Actions — corrigé par ce script plutôt
   qu'en ajoutant encore un bucket à une liste manuelle.
   Si `setup_minio_buckets` échoue (ex. MinIO temporairement injoignable
   au déploiement), il journalise l'erreur sans bloquer le démarrage du
   backend — relancer manuellement au besoin : `python manage.py
   setup_minio_buckets` (ou `docker-compose exec backend python manage.py
   setup_minio_buckets` en local).
9. **Attacher un domaine public Railway au service MinIO** (Settings →
   Networking → Generate Domain, port 9000) et définir sur `backend`
   `MINIO_PUBLIC_ENDPOINT=<ce domaine public>` + `MINIO_PUBLIC_USE_SSL=True`.
   **Sans cette étape, les images produit ne s'afficheront pas** dans le
   navigateur des membres (icône d'image cassée) : `MINIO_ENDPOINT` (étape 6)
   est l'URL interne Railway, jamais routable depuis l'extérieur — voir le
   commentaire dans `.env.example` et la docstring de `ProduitsStorage`.
   Cette même variable `MINIO_PUBLIC_ENDPOINT` est aussi nécessaire pour que
   le bouton « voir le document » des justificatifs de rabais fonctionne
   (bug corrigé le 2026-09-16 : sans elle, le lien pré-signé pointe vers
   `MINIO_ENDPOINT`, l'hôte interne, et le navigateur affiche
   `DNS_PROBE_FINISHED_NXDOMAIN` — voir la docstring de `JustificatifsStorage`,
   `apps/adhesions/storage.py`). Si l'étape 9 est déjà faite (images produit
   déjà visibles), aucune configuration supplémentaire n'est nécessaire.

`STORAGES["default"]` (`backend/config/settings/base.py`) pointe vers ce
service MinIO **exclusivement via les variables d'environnement** `AWS_*` /
`MINIO_*` — aucun code ne référence Railway ou MinIO en dur. C'est ce qui
permet la portabilité décrite en §10 : remplacer MinIO par n'importe quel
stockage S3-compatible (voir §10) ne demande qu'un changement de variables,
jamais une modification de code.

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

**Piège fréquent (retour utilisateur du 2026-09-16 : une fonctionnalité qui
semblait ne "rien faire du tout" après un merge)** : les 4 services
redéploient chacun indépendamment — rien ne garantit qu'ils réussissent
tous ensemble. Un service peut échouer silencieusement (build cassé,
variable d'environnement manquante) pendant que les 3 autres redéploient
sans problème, et rien dans l'app elle-même ne signale ce genre d'échec
partiel : pas d'erreur visible, simplement une fonctionnalité qui ne se
déclenche jamais (ex. une notification envoyée par une tâche Celery, ou
un changement frontend jamais servi). Après chaque merge sur `main` qui
touche `apps.notifications`/tâches Celery ou le frontend, vérifier dans
le dashboard Railway que les 4 services (`backend`, `celery_worker`,
`celery_beat`, `frontend`) affichent bien le même commit le plus récent
et un déploiement réussi (pas seulement `backend`, qui est celui qu'on
vérifie le plus naturellement en testant l'API/l'UI).

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

## 10. Portabilité & migration

Deux exigences explicites du projet, appliquées dans toute l'architecture :
(a) le nom de domaine doit être facilement changeable, (b) l'app doit pouvoir
migrer de Railway vers une autre plateforme sans réécriture de code.

### 10.1 Domaine facilement changeable

Aucun nom de domaine n'est en dur dans le code. Le domaine ne vit que dans
des variables d'environnement, à modifier aux 3 endroits suivants (jamais de
redéploiement de code requis) :

| Variable | Service | Rôle |
| --- | --- | --- |
| `ALLOWED_HOSTS` | backend | domaine(s) autorisés par Django |
| `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL` | backend | origine autorisée / liens dans les emails |
| `VITE_API_BASE_URL`, `VITE_WS_BASE_URL` | frontend (build arg) | où le frontend appelle l'API — **nécessite un rebuild** du service frontend (valeurs injectées à la compilation Vite), pas juste un redémarrage |

`nginx/conf.d/prod.conf.example` (déploiement VPS hors Railway) contient un
exemple de domaine (`app.clubistes.de`) à remplacer — c'est un fichier de
référence, non utilisé par Railway, qui n'a pas d'équivalent nginx (son
routing de domaine est géré dans les Settings de chaque service).

Changer de domaine = mettre à jour ces variables + pointer le DNS (CNAME) sur
la nouvelle URL Railway ou le nouveau serveur — aucune ligne de code à toucher.

### 10.2 Migrer hors de Railway

Rien dans le code applicatif ne dépend de Railway. Ce qui rend la bascule
possible :

- **Conteneurs standard** : `backend/Dockerfile.prod` et
  `frontend/Dockerfile.prod` sont des images Docker ordinaires, sans API
  Railway. Elles tournent identiquement sur Hetzner + Docker Compose (voir
  SDD §6), Render, Fly.io, ou tout hébergeur Docker.
- **Config 12-factor** : toute la configuration (secrets, URLs, ports)
  vient de variables d'environnement (`.env.example` en dev, Settings du
  service en prod) — jamais de valeur en dur dépendant de la plateforme,
  hormis `SECURE_PROXY_SSL_HEADER` qui suppose un proxy TLS-terminating en
  amont (vrai sur Railway, Render, Fly.io ; à adapter avec un nginx/Caddy en
  frontal si self-hosted, déjà prévu par `nginx/conf.d/prod.conf.example`).
- **Base de données** : PostgreSQL standard — `pg_dump` / `pg_restore`
  (ou `railway db` export) fonctionnent vers n'importe quel Postgres 15.
- **Stockage fichiers** : `STORAGES["default"]` utilise
  `storages.backends.s3boto3.S3Boto3Storage`, configuré uniquement via les
  variables `AWS_*`/`MINIO_*` (voir §7). MinIO aujourd'hui, mais n'importe
  quel stockage S3-compatible (Scaleway Object Storage, Hetzner Object
  Storage, OVH, AWS S3 lui-même) fonctionne en changeant uniquement
  `AWS_S3_ENDPOINT_URL` + les clés — **zéro changement de code**.
- **Pas de service Railway-only utilisé** : ni cron Railway propriétaire
  (Celery Beat gère la planification), ni add-on propriétaire (Postgres/Redis
  sont des plugins Railway standards, remplaçables par n'importe quel
  Postgres/Redis managé ou auto-hébergé).

Étapes de bascule (résumé) : provisionner Postgres + Redis + stockage
S3-compatible sur la nouvelle plateforme → `pg_dump`/`pg_restore` la base →
`mc mirror` (ou équivalent) les buckets MinIO → redéployer les 4 images
Docker avec les mêmes variables d'environnement (endpoints mis à jour) →
basculer le DNS. Downtime typique : le temps du dump/restore + propagation
DNS (souvent < 1h pour une base de cette taille).

### 10.3 Railway en production — évaluation (septembre 2026)

Points à connaître avant le Go-Live R1 (voir réponse détaillée dans la
conversation projet) :

- Une seule région EU (Amsterdam) ; pas de garantie de résidence des
  données publiée noir sur blanc au-delà de cette localisation.
- Limite dure de 5 minutes par requête HTTP (non configurable) — sans
  impact pour cette app (pas d'endpoint long-running prévu), à garder en
  tête pour les exports Excel/PDF volumineux (§ Stats).
- Pas d'auto-scaling horizontal natif — scaling manuel.
- Retours d'expérience mitigés sur la fiabilité en usage intensif
  (déploiements bloqués, temps de réponse support variable) — acceptable
  pour la taille et la charge de CID (association, pas de trafic massif),
  à réévaluer si la base de membres croît significativement.

Ces éléments ne remettent pas en cause Railway comme point de départ, mais
justifient l'architecture 100% portable ci-dessus : elle garde la bascule
vers Hetzner/Docker Compose (déjà documentée dans le SDD) ouverte à tout
moment, sans coût de réécriture.

## 11. Umgebungen DEV / PROD und Release-Promotion (ab 2026-10-07)

| | DEV | PROD |
|---|---|---|
| GitHub | `GhaziHabita/cid-app` (Entwicklung, PRs, CI) | `MyCIDAdmin/cid-app` (nur Releases, keine direkten Commits) |
| Railway | privates Projekt | Vereins-Konto, Projekt `cid-prod` |
| Domain | my-cid.de / api.my-cid.de | mycid.org / api.mycid.org |
| Daten/Zahlung | Testdaten, Stripe-Test/PayPal-Sandbox | echte Daten, Stripe/PayPal live |
| Secrets | eigene | eigene, **nie** zwischen den Umgebungen kopieren |

**Promotion:** Feature-Branch → PR → `main` (CI grün) → Tag `release-YYYY.MM.DD[-n]` auf dem main-Commit.
Der Workflow `.github/workflows/promote.yml` prüft (Commit in main, CI grün) und pusht den Commit
ohne Force nach `MyCIDAdmin/cid-app` `main`; Railway-PROD deployt von dort. Voraussetzung: Secret
`PROD_DEPLOY_KEY` (SSH-Deploy-Key mit Schreibrecht im Vereins-Repo). Rollback: älteren Tag erneut
deployen (Railway „Redeploy“); Migrationen nur vorwärtskompatibel schreiben.

**Umgebungsabhängige Frontend-Build-Variablen (Railway → frontend → Variables):**
`VITE_API_BASE_URL`, `VITE_WS_BASE_URL`, `VITE_SITE_URL` (z. B. `https://mycid.org`).
