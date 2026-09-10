/** Private, org-prefixed Supabase storage accessed through signed URLs. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/core/auth/supabase-server'

export interface StorageAdapter {
  upload(key: string, file: Buffer | Uint8Array, contentType: string): Promise<void>
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}

export const BUCKET = 'private-documents'
const DEFAULT_SIGNED_URL_EXPIRY = 60 // seconds

export class SupabaseStorageAdapter implements StorageAdapter {
  constructor(private readonly client: SupabaseClient) {}

  async upload(
    key: string,
    file: Buffer | Uint8Array,
    contentType: string
  ): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(key, file, { contentType, upsert: false })

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`)
    }
  }

  async getSignedUrl(
    key: string,
    expiresInSeconds: number = DEFAULT_SIGNED_URL_EXPIRY
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(key, expiresInSeconds)

    if (error || !data?.signedUrl) {
      throw new Error(`Storage signed URL failed: ${error?.message}`)
    }
    return data.signedUrl
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).remove([key])
    if (error) {
      throw new Error(`Storage delete failed: ${error.message}`)
    }
  }

  async exists(key: string): Promise<boolean> {
    const parts = key.split('/')
    const fileName = parts.pop()!
    const folder = parts.join('/')

    const { data, error } = await this.client.storage
      .from(BUCKET)
      .list(folder, { search: fileName, limit: 1 })

    if (error) return false
    return data.some((f) => f.name === fileName)
  }
}

/** Request-scoped storage with RLS enforced. */
export async function getStorage(): Promise<StorageAdapter> {
  const client = await createSupabaseServer()
  return new SupabaseStorageAdapter(client)
}

/** Service-role storage for background work outside a user request. */
export function getStorageUnscoped(): StorageAdapter {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) {
    throw new Error(
      'SUPABASE_SECRET_KEY is not configured. It is only needed for background ' +
        'jobs; request-path code should use getStorage() instead.'
    )
  }
  return new SupabaseStorageAdapter(
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret)
  )
}
