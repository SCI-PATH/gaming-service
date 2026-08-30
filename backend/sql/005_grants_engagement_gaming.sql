-- If the app role cannot read engagement_gaming, run this as the schema owner in Neon SQL Editor.
CREATE SCHEMA IF NOT EXISTS engagement_gaming;
GRANT USAGE, CREATE ON SCHEMA engagement_gaming TO PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA engagement_gaming TO PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA engagement_gaming
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO PUBLIC;
