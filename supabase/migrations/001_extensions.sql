-- =====================================================================================
-- 001_EXTENSIONS_AND_SCHEMAS.sql
-- Enables necessary PostgreSQL extensions for UUID, crypto, and trigram search.
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
