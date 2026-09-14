'use server'

import { revalidatePath } from 'next/cache'
import { alert } from '@/core/alerts'
import { dbAs } from '@/core/db'
import { getOrgContext, verifySession } from '@/core/auth/dal'
import { writeAudit } from '@/core/audit'
import { validateSignature, SignatureRejected, MAX_BYTES } from './validate'
import { putSignature } from './store'

export interface SignatureState {
  error: string | null
  ok?: boolean
}

/**
 * Store the signed-in user's own signature specimen.
 *
 * Nobody uploads a signature for anybody else: the key comes from the session
 * and there is no parameter that could name another user. Uploading and
 * replacing are both audited, because the specimen is what makes a stamped
 * document mean anything.
 */
export async function uploadSignature(
  orgSlug: string,
  _prev: SignatureState,
  formData: FormData
): Promise<SignatureState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const file = formData.get('signature')
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an image of your signature.' }
  }
  if (file.size > MAX_BYTES) {
    // Checked before reading it into memory as well as after decoding, so a
    // large upload is refused rather than buffered.
    return { error: `That image is over ${MAX_BYTES / 1_000_000} MB.` }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  let format
  try {
    format = validateSignature(bytes).format
  } catch (error) {
    if (error instanceof SignatureRejected) return { error: error.message }
    throw error
  }

  const key = await putSignature(userId, bytes, format)

  await dbAs(userId, async (tx) => {
    const before = await tx.user.findUnique({
      where: { id: userId },
      select: { signatureImagePath: true },
    })
    await tx.user.update({
      where: { id: userId },
      data: { signatureImagePath: key, signatureUpdatedAt: new Date() },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: before?.signatureImagePath ? 'signature.replace' : 'signature.upload',
        targetType: 'User',
        targetId: userId,
        // The key, never the image. An audit log is read by more people than
        // the bucket is.
        before: before?.signatureImagePath ? { had: true } : { had: false },
        after: { key },
      },
      tx
    )
    return before?.signatureImagePath ?? null
  })

  // A signature is what stamps a document as authorised. A replacement
  // nobody expected is the first sign somebody else is signing as you.
  await alert('signature_replaced', { club: orgSlug })
  revalidatePath(`/${orgSlug}/settings/signature`)
  return { error: null, ok: true }
}

/**
 * Remove it. Documents then print with an empty rule, to be signed by hand.
 *
 * The stored object is not deleted, here or on replacement. Counting which
 * documents still reference it and deleting the unreferenced ones was tried,
 * and it is wrong twice over: the count races a concurrent signing, and it is
 * evaluated under row-level security, so references in an organisation this
 * user has since left are invisible to it. Either way the deletion lands on a
 * specimen a signed document depends on. A signature specimen is small, it is
 * already inside every document it was stamped on, and keeping it is what
 * makes a document downloaded next year the one that was signed this year.
 */
export async function removeSignature(orgSlug: string): Promise<SignatureState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  await dbAs(userId, async (tx) => {
    const before = await tx.user.findUnique({
      where: { id: userId },
      select: { signatureImagePath: true },
    })
    if (!before?.signatureImagePath) return null


    await tx.user.update({
      where: { id: userId },
      data: { signatureImagePath: null, signatureUpdatedAt: new Date() },
    })
    await writeAudit(
      {
        orgId: org.id,
        actorId: userId,
        action: 'signature.remove',
        targetType: 'User',
        targetId: userId,
        before: { key: before.signatureImagePath },
      },
      tx
    )
    return before.signatureImagePath
  })

  revalidatePath(`/${orgSlug}/settings/signature`)
  return { error: null, ok: true }
}
