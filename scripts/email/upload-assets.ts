/**
 * Legacy helper for putting the sign-in email's images in Supabase Storage.
 *
 * Email can only show images from a public address, so these go in their own
 * PUBLIC bucket, email-assets — never in private-documents. Anything in it
 * can be fetched by anyone with the link: the logo, and a club photo the club
 * chose to share. Nothing else belongs here.
 *
 * The current template uses /api/email-assets/* on the portal instead, so
 * this script is only needed by an older deployed template.
 *
 * usage: npx tsx scripts/email/upload-assets.ts <logo.png> <photo.jpg>
 */
import '../load-env'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'email-assets'

async function main() {
  const [logo, photo] = process.argv.slice(2)
  if (!logo || !photo) throw new Error('usage: upload-assets.ts <logo.png> <photo.jpg>')

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })

  const { data: buckets, error: listError } = await client.storage.listBuckets()
  if (listError) throw listError
  if (!buckets.some((b) => b.id === BUCKET)) {
    const { error } = await client.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg'],
      fileSizeLimit: '1MB',
    })
    if (error) throw error
  }

  for (const [path, file, type] of [
    ['funktion-logo-560.png', logo, 'image/png'],
    ['funktion-crew-1120.jpg', photo, 'image/jpeg'],
  ] as const) {
    const { error } = await client.storage.from(BUCKET).upload(path, readFileSync(file), {
      contentType: type,
      upsert: true,
      cacheControl: '86400',
    })
    if (error) throw error
    console.log(client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
