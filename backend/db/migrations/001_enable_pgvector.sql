-- 001_enable_pgvector.sql
-- Enable the pgvector extension for vector similarity search.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
