-- A profile photo somebody chose for themselves, kept in the private bucket
-- and streamed back through the app. A fresh key on every upload, so a
-- replaced photo is never served from a cached copy.
ALTER TABLE "users" ADD COLUMN "photo_path" TEXT;
