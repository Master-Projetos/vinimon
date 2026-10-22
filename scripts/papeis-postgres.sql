-- scripts/papeis-postgres.sql (rodar como superusuário, uma vez)
CREATE ROLE vinimon_migrator LOGIN PASSWORD :'senha_migrator';
CREATE ROLE vinimon_app LOGIN PASSWORD :'senha_app';
CREATE DATABASE vinimon OWNER vinimon_migrator;
\c vinimon
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO vinimon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vinimon_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vinimon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vinimon_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO vinimon_app;
CREATE SCHEMA pgboss AUTHORIZATION vinimon_app; -- pg-boss cria e migra as próprias tabelas
