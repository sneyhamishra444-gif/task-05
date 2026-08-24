-- Bonus: PostgreSQL full-text search on tasks.title + tasks.description.
--
-- search_vector was added as a plain (nullable) tsvector column in
-- 0000_init.sql. Drizzle can read/write generic column types but can't
-- express "GENERATED ALWAYS AS ... STORED" or triggers, so that part is
-- hand-written here as a normal, checked-in migration file (per the
-- assignment's "no manually maintained schema.sql, use migrations"
-- requirement - this IS a migration, just not one drizzle-kit can diff).

-- Keep search_vector in sync on INSERT/UPDATE. setweight() gives the title
-- more relevance than the description in ranked results.
CREATE OR REPLACE FUNCTION tasks_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;
--> statement-breakpoint

DROP TRIGGER IF EXISTS tasks_search_vector_trigger ON "tasks";
--> statement-breakpoint

CREATE TRIGGER tasks_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description ON "tasks"
  FOR EACH ROW
  EXECUTE FUNCTION tasks_search_vector_update();
--> statement-breakpoint

-- Backfill existing rows (no-op on a fresh DB, safe on a populated one).
UPDATE "tasks" SET title = title;
--> statement-breakpoint

-- GIN index is what makes `search_vector @@ websearch_to_tsquery(...)` fast.
CREATE INDEX IF NOT EXISTS tasks_search_vector_gin_idx
  ON "tasks" USING GIN ("search_vector");
