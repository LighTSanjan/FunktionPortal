/**
 * Manual, one-time operational bootstrap. Creates the private
 * documents bucket, which nothing else creates automatically — Supabase's
 * hosted project setup doesn't include it, and the self-hosted stack starts
 * with an empty storage.buckets table. Idempotent, safe to re-run. Requires
 * SUPABASE_SECRET_KEY (service role) and NEXT_PUBLIC_SUPABASE_URL.
 */
import './load-env'
import { createClient } from '@supabase/supabase-js'
import { BUCKET } from '../src/core/storage'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!url || !secret) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must both be set.')
  }

  const client = createClient(url, secret)

  const { data: existing, error: listError } = await client.storage.listBuckets()
  if (listError) {
    throw new Error(`Failed to list buckets: ${listError.message}`)
  }

  const found = existing.find((b) => b.id === BUCKET)
  if (found) {
    // An existing bucket is only fine if it is still private. A public one
    // serves every signature and payment screenshot to anyone with the path.
    if (found.public) {
      const { error } = await client.storage.updateBucket(BUCKET, { public: false })
      if (error) throw new Error(`Bucket "${BUCKET}" is PUBLIC and could not be made private: ${error.message}`)
      console.log(`Bucket "${BUCKET}" was public. It is private now.`)
      return
    }
    console.log(`Bucket "${BUCKET}" already exists and is private.`)
    return
  }

  const { error: createError } = await client.storage.createBucket(BUCKET, { public: false })
  if (createError) {
    throw new Error(`Failed to create bucket "${BUCKET}": ${createError.message}`)
  }

  console.log(`Created private bucket "${BUCKET}".`)
}

main().catch((error) => {
  console.error('Storage bucket bootstrap failed:', error)
  process.exitCode = 1
})
