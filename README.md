# CID — Clubistes in Deutschland

Plateforme numérique de l'association Clubistes in Deutschland (supporters
du Club Africain de Tunis résidant en Allemagne) : membres, cotisations,
offres d'adhésion, événements, boutique, votes en temps réel, communauté,
statistiques. Stack 100% open source : Django + React.

Voir `CLAUDE.md` pour le contrat de développement complet et l'ordre des
phases, et `docs/RAILWAY.md` pour le déploiement.

## Démarrage rapide (développement)

Prérequis : Docker Desktop 24+, Git.

```bash
git clone https://github.com/<votre-compte>/clubistes-deutschland.git
cd clubistes-deutschland
cp .env.example .env          # remplir les valeurs (voir commentaires dans le fichier)
docker-compose up --build -d
docker-compose ps              # attendre que les 9 services soient "healthy"
```

- Frontend : http://localhost
- API : http://localhost/api/v1/
- Admin Django : http://localhost/admin/
- MailHog (emails capturés en dev) : http://localhost:8025
- Console MinIO : http://localhost:9001

Créer le compte Administrateur App initial :

```bash
docker-compose exec backend python manage.py create_initial_data \
  --email admin@clubistes.de --password "<mot de passe fort>"
```

## Développement sans Docker

```bash
# Backend (nécessite Postgres + Redis accessibles, voir .env)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements/dev.txt
python manage.py migrate
python manage.py runserver

# Frontend
cd frontend
npm install
npm run dev
```

## Tests

```bash
# Backend
cd backend && python -m pytest

# Frontend
cd frontend && npm test && npm run lint
```

## Statut du projet

Suivi détaillé dans `CLAUDE.md` §7 (ordre des modules) — reflète le
Release Plan v1.1 (`CID-RPL-001`) et le Timeline v1.2 (`CID-PTL-001`).

- ✅ Phase 0 — Infrastructure, Docker, CI/CD
- ✅ Phase 1A — Authentification (2FA TOTP/email, JWT, RBAC 5 rôles)
- ⬜ Phase 1B — Membres, Cotisations, Offres d'Adhésion
- ⬜ Phase 2A/2B — Événements, Boutique, Stats, Notifications
- ⬜ Phase 3 — Votes & Élections en temps réel (WebSocket)
- ⬜ Phase 4/5 (Release 2) — Communauté, i18n arabe RTL, tests de charge

## Licence

Usage interne — Clubistes in Deutschland. Confidentiel.
