/**
 * Copy every file in the private bucket to this computer.
 *
 *   npx tsx scripts/db/backup-storage.ts [folder]
 *
 * Run by scripts/db/backup.sh after the database copy. The database holds
 * only each file's key; the files themselves (signatures, PayNow
 * screenshots, PayNow QR codes, photos, logos, the printed month PDFs) live
 * in Supabase Storage, which no database backup includes.
 *
 * A mirror, not a snapshot: a file already here at the same size is not
 * downloaded again, and a file that has gone from the bucket stays here,
 * because a backup that deletes what the live side deleted is no backup.
 *
 * Reads with the secret key from .env.local, the same one the app uses.
 */
import '../load-env'
import { mkdir, rename, stat, writeFile, chmod } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { BUCKET } from '../../src/core/storage'

const PAGE = 1000

interface Found {
  key: string
  size: number | null
}

async function listAll(bucket: ReturnType<ReturnType<typeof createClient>['storage']['from']>, prefix = ''): Promise<Found[]> {
  const found: Found[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`Listing "${prefix || '/'}" failed: ${error.message}`)
    for (const entry of data) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name
      // Folders come back without an id.
      if (entry.id === null) found.push(...(await listAll(bucket, key)))
      else found.push({ key, size: typeof entry.metadata?.size === 'number' ? entry.metadata.size : null })
    }
    if (data.length < PAGE) return found
  }
}

async function sizeOnDisk(file: string): Promise<number | null> {
  try {
    return (await stat(file)).size
  } catch {
    return null
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!url || !secret) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must both be set.')

  const root = path.resolve(
    process.argv[2] ?? path.join(process.env.FUNKTION_BACKUP_DIR ?? path.join(homedir(), 'Backups', 'FunktionPortal'), 'storage')
  )
  await mkdir(root, { recursive: true, mode: 0o700 })
  await chmod(root, 0o700)

  const bucket = createClient(url, secret, { auth: { persistSession: false } }).storage.from(BUCKET)
  const files = await listAll(bucket)

  let fetched = 0
  let bytes = 0
  const failed: string[] = []
  for (const file of files) {
    const target = path.resolve(root, file.key)
    // A key is a path inside the bucket; it must stay one inside the folder.
    if (!target.startsWith(root + path.sep)) {
      failed.push(`${file.key} (unsafe path)`)
      continue
    }
    if (file.size !== null && (await sizeOnDisk(target)) === file.size) continue

    const { data, error } = await bucket.download(file.key)
    if (error || !data) {
      failed.push(`${file.key} (${error?.message ?? 'empty'})`)
      continue
    }
    const body = Buffer.from(await data.arrayBuffer())
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    const partial = `${target}.partial`
    await writeFile(partial, body, { mode: 0o600 })
    await rename(partial, target)
    fetched++
    bytes += body.length
  }

  console.log(`storage: ${files.length} files in ${BUCKET}, ${fetched} new or changed (${Math.round(bytes / 1024)} KB)`)
  if (failed.length > 0) {
    console.error(`storage: ${failed.length} could not be copied:\n  ${failed.join('\n  ')}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(`storage: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
