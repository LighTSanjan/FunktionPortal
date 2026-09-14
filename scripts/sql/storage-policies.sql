-- Row-level security for the private-documents bucket: no direct access at all.
--
-- RUN THIS FROM THE SUPABASE SQL EDITOR, not from a migration. storage.objects
-- belongs to supabase_storage_admin, which the migration role is not.
--
-- The previous version of this file granted a signed-in user direct INSERT on
-- their own signature folder and on payment-screenshot paths, and SELECT on
-- their own signature. None of it was used: every upload and download in the
-- portal goes through the server, which validates the image, checks
-- permissions, and derives the object key from the session. The policies only
-- served somebody calling the Storage API directly with their token — who
-- could then upload unvalidated files of any size, as many as they liked,
-- bypassing every check the portal makes.
--
-- With RLS on and no policies, a signed-in user's own token can reach nothing
-- in the bucket. The server's service-role key is unaffected.
--
-- Safe to re-run.

drop policy if exists "own signature read"  on storage.objects;
drop policy if exists "own signature write" on storage.objects;
drop policy if exists "own fee proof write" on storage.objects;

-- The bucket must stay private. If this returns true, fix that first.
select id, public from storage.buckets where id = 'private-documents';

-- And nothing else should be granting access to it.
select policyname, cmd, roles from pg_policies
 where schemaname = 'storage' and tablename = 'objects';
