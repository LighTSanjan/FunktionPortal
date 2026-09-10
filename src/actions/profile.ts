'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { verifySession, getOrgContext } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { writeAudit } from '@/core/audit'

export interface ProfileState {
  error: string | null
  ok?: boolean
}

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'A name is required')
    .max(120, 'That name is too long'),
})

// The session-derived id and RLS both restrict this update to the caller.
export async function updateProfile(
  orgSlug: string,
  _prev: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const { org } = await getOrgContext(orgSlug)
  const { userId } = await verifySession()

  const parsed = profileSchema.safeParse({
    name: formData.get('name') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That is not valid' }
  }

  await dbAs(userId, async (tx) => {
    const before = await tx.user.findUnique({
      where: { id: userId },
      select: { name: true },
    })

    await tx.user.update({
      where: { id: userId },
      data: { name: parsed.data.name },
    })

    // Audited because the name is a signature line. A quiet rename between
    // generating a document and submitting it should leave a trail.
    if (before && before.name !== parsed.data.name) {
      await writeAudit(
        {
          orgId: org.id,
          actorId: userId,
          action: 'user.rename',
          targetType: 'User',
          targetId: userId,
          before: { name: before.name },
          after: { name: parsed.data.name },
        },
        tx
      )
    }
  })

  revalidatePath(`/${orgSlug}/settings/profile`, 'layout')
  return { error: null, ok: true }
}
