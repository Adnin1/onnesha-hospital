#!/bin/sh
set -e

echo "=========================================================="
echo "  ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS) DOCKER INIT  "
echo "=========================================================="

# 1. Run initialization shims (e.g. 00_supabase_shim.sql)
if [ -d "/docker-init-scripts" ]; then
    echo "[OHMS INIT] Applying initialization shims from /docker-init-scripts..."
    for f in /docker-init-scripts/*.sql; do
        if [ -f "$f" ]; then
            echo "[OHMS INIT] Executing shim: $f"
            psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
        fi
    done
fi

# 2. Run migrations in strict alphanumeric order
if [ -d "/docker-migrations" ]; then
    echo "[OHMS INIT] Applying migrations from /docker-migrations..."
    for f in $(find /docker-migrations -maxdepth 1 -name '*.sql' | sort); do
        if [ -f "$f" ]; then
            echo "[OHMS INIT] Executing migration: $f"
            psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
        fi
    done
fi

echo "[OHMS INIT] Database bootstrap complete. All migrations applied."
echo "=========================================================="
