-- Target Database: knowledgehub
-- Target Schema: public
-- Feature: KnowledgeHub P02 Collections
-- Status: PROPOSED - Review only. Do not apply yet
-- Privilege Impact: Runtime needs CONNECT, USAGE, SELECT/INSERT/UPDATE. No DELETE.

-- 1. Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.set_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Table definition
CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    name VARCHAR(200) NOT NULL,
    description VARCHAR(2000) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ NULL,

    CONSTRAINT ck_collections_id_nonzero 
        CHECK (id <> '00000000-0000-0000-0000-000000000000'::UUID),
    CONSTRAINT ck_collections_owner_id_nonzero 
        CHECK (owner_id <> '00000000-0000-0000-0000-000000000000'::UUID),
    CONSTRAINT ck_collections_name_nonblank 
        CHECK (length(btrim(name)) > 0)
);

-- 3. Trigger
DROP TRIGGER IF EXISTS trg_collections_updated_at ON public.collections;
CREATE TRIGGER trg_collections_updated_at
    BEFORE UPDATE ON public.collections
    FOR EACH ROW
    EXECUTE FUNCTION public.set_collections_updated_at();

-- 4. Partial index for active owner listing
CREATE INDEX IF NOT EXISTS idx_collections_owner_active_created 
    ON public.collections(owner_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

-- 5. Rollback comments
-- DROP TRIGGER IF EXISTS trg_collections_updated_at ON public.collections;
-- DROP INDEX IF EXISTS idx_collections_owner_active_created;
-- DROP TABLE IF EXISTS public.collections;
-- DROP FUNCTION IF EXISTS public.set_collections_updated_at();

