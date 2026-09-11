-- Row-level security for the private-documents bucket.
--
-- RUN THIS FROM THE SUPABASE SQL EDITOR, not from a migration.
--
-- storage.objects belongs to supabase_storage_admin. The migration role is
-- not that role and cannot create policies on it, which is why this is a
-- manual step rather than a file under prisma/migrations.
--
-- Until it is run, RLS is on and the bucket has no policies at all, so the
-- signed-in user's own token can reach nothing in it. Everything the portal
-- stores there therefore goes through the service role with the authorisation
-- done in the application, and keys derived from the session rather than
-- accepted from the caller. That is sound; this is the second layer.
--
-- Safe to re-run.

-- Signature specimens: signatures/<user id>/<uuid>.<ext>
drop policy if exists "own signature read" on storage.objects;
create policy "own signature read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private-documents'
    and (storage.foldername(name))[1] = 'signatures'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "own signature write" on storage.objects;
create policy "own signature write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'private-documents'
    and (storage.foldername(name))[1] = 'signatures'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Payment screenshots: fee-proof/<term id>/<member id>/<uuid>.<ext>
--
-- Read is deliberately not granted to anybody here. A screenshot carries the
-- payer's name and often part of an account number; it is served by a route
-- that checks fee.manage on every request and streams the bytes, so no URL
-- for one ever leaves the server. Members may write their own, and that is
-- all.
drop policy if exists "own fee proof write" on storage.objects;
create policy "own fee proof write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'private-documents'
    and (storage.foldername(name))[1] = 'fee-proof'
    and exists (
      select 1 from public.members m
      where m.id = (storage.foldername(name))[3]
        and m.user_id = auth.uid()::text
    )
  );
