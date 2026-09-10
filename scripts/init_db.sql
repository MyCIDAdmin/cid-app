-- Exécuté automatiquement par le conteneur postgres au premier démarrage
-- (docker-entrypoint-initdb.d). Réservé aux extensions PostgreSQL requises.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
