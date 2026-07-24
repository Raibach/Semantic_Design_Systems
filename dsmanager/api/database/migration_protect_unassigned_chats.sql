-- ============================================
-- PROTECT "Archived Unassigned Chats" FROM DELETION
-- Database-level protection to prevent deletion of required system project
-- ============================================

-- Create trigger function to prevent deletion
CREATE OR REPLACE FUNCTION prevent_delete_unassigned_chats()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.name = 'Archived Unassigned Chats' THEN
        RAISE EXCEPTION 'Cannot delete "Archived Unassigned Chats". This is a required system project that cannot be removed.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create it
DROP TRIGGER IF EXISTS prevent_delete_unassigned_chats_trigger ON projects;

CREATE TRIGGER prevent_delete_unassigned_chats_trigger
BEFORE DELETE ON projects
FOR EACH ROW
EXECUTE FUNCTION prevent_delete_unassigned_chats();

-- Verify trigger was created
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'prevent_delete_unassigned_chats_trigger'
    ) THEN
        RAISE NOTICE '✅ Trigger created successfully - "Archived Unassigned Chats" is now protected from deletion';
    ELSE
        RAISE WARNING '⚠️ Trigger was not created';
    END IF;
END $$;

