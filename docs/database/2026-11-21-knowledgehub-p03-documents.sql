-- Target Database: knowledgehub
-- Target Schema: public
-- Feature: KnowledgeHub P03 Documents
-- Status: PROPOSED - Review only. Do not apply without explicit owner authorization.
-- Privilege Impact: runtime role needs SELECT, INSERT, UPDATE. No DELETE.

CREATE OR REPLACE FUNCTION public.set_documents_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY,
    collection_id UUID NOT NULL,
    upload_session_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_extension VARCHAR(10) NOT NULL,
    content_type VARCHAR(127) NOT NULL,
    declared_size_bytes BIGINT NOT NULL,
    file_id UUID NULL,
    storage_key TEXT NULL,
    size_bytes BIGINT NULL,
    source_sha256 CHAR(64) NULL,
    registration_status VARCHAR(40) NOT NULL DEFAULT 'AWAITING_UPLOAD',
    cleanup_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUESTED',
    registration_attempt_id UUID NULL,
    registration_lease_until TIMESTAMPTZ NULL,
    last_error_code VARCHAR(64) NULL,
    last_error_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registered_at TIMESTAMPTZ NULL,
    deleted_at TIMESTAMPTZ NULL,

    CONSTRAINT fk_documents_collection 
        FOREIGN KEY (collection_id) 
        REFERENCES public.collections (id) 
        ON DELETE RESTRICT,

    CONSTRAINT ck_documents_id_nonzero
        CHECK (id <> '00000000-0000-0000-0000-000000000000'::UUID),

    CONSTRAINT ck_documents_collection_id_nonzero
        CHECK (collection_id <> '00000000-0000-0000-0000-000000000000'::UUID),
    
     CONSTRAINT ck_documents_upload_session_nonzero
        CHECK (upload_session_id <> '00000000-0000-0000-0000-000000000000'::UUID),

    CONSTRAINT ck_documents_file_id_nonzero
        CHECK (
            file_id IS NULL OR
            file_id <> '00000000-0000-0000-0000-000000000000'::UUID
        ),

    CONSTRAINT ck_documents_attempt_id_nonzero
        CHECK (
            registration_attempt_id IS NULL OR
            registration_attempt_id <> '00000000-0000-0000-0000-000000000000'::UUID
        ),

    CONSTRAINT ck_documents_title_nonblank
        CHECK (length(btrim(title)) > 0),

    CONSTRAINT ck_documents_original_filename_nonblank
        CHECK (length(btrim(original_filename)) > 0),

    CONSTRAINT ck_documents_declared_size
        CHECK (declared_size_bytes > 0 AND declared_size_bytes <= 52428800),

    CONSTRAINT ck_documents_actual_size
        CHECK (
            size_bytes IS NULL OR
            (size_bytes > 0 AND size_bytes <= 52428800)
        ),

    CONSTRAINT ck_documents_extension
        CHECK (file_extension IN ('.pdf', '.md', '.txt')),

    CONSTRAINT ck_documents_sha256
        CHECK (
            source_sha256 IS NULL OR
            source_sha256 ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT ck_documents_registration_status
        CHECK (
            registration_status IN (
                'AWAITING_UPLOAD',
                'REGISTERING',
                'REGISTRATION_FAILED',
                'REGISTERED',
                'BLOCKED_PARENT_DELETED',
                'PARENT_DELETED_RETAINED'
            )
        ),

    CONSTRAINT ck_documents_cleanup_status
        CHECK (
            cleanup_status IN (
                'NOT_REQUESTED',
                'PENDING',
                'COMPLETED',
                'FAILED'
            )
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_upload_session
    ON public.documents(upload_session_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_file_id
    ON public.documents(file_id)
    WHERE file_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_storage_key
    ON public.documents(storage_key)
    WHERE storage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_collection_active_created
    ON public.documents(collection_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_registration_recovery
    ON public.documents(registration_lease_until, updated_at)
    WHERE registration_status IN ('REGISTERING', 'REGISTRATION_FAILED');

CREATE INDEX IF NOT EXISTS idx_documents_cleanup_pending
    ON public.documents(updated_at)
    WHERE deleted_at IS NOT NULL
      AND cleanup_status IN ('PENDING', 'FAILED');

DROP TRIGGER IF EXISTS trg_documents_updated_at ON public.documents;

CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_documents_updated_at();

-- Rollback comments only. Do not execute automatically.
-- DROP TRIGGER IF EXISTS trg_documents_updated_at ON public.documents;
-- DROP INDEX IF EXISTS idx_documents_cleanup_pending;
-- DROP INDEX IF EXISTS idx_documents_registration_recovery;
-- DROP INDEX IF EXISTS idx_documents_collection_active_created;
-- DROP INDEX IF EXISTS uq_documents_storage_key;
-- DROP INDEX IF EXISTS uq_documents_file_id;
-- DROP INDEX IF EXISTS uq_documents_upload_session;
-- DROP TABLE IF EXISTS public.documents;
-- DROP FUNCTION IF EXISTS public.set_documents_updated_at();