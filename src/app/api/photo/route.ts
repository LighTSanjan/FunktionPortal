import { verifySession } from '@/core/auth/dal'
import { dbAs } from '@/core/db'
import { PHOTO_CONTENT_TYPE, readPhoto } from '@/modules/photos'

export const runtime = 'nodejs'

/**
 * The signed-in person's own photo. Only ever their own: the key comes from
 * their row, never from the request. The `v` in the address changes with the
 * photo, so the browser may keep this one for good.
 */
export async function GET() {
  const { userId } = await verifySession()
  const user = await dbAs(userId, (tx) => tx.user.findUnique({ where: { id: userId }, select: { photoPath: true } }))
  const bytes = user?.photoPath ? await readPhoto(user.photoPath) : null
  if (!user?.photoPath || !bytes) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': PHOTO_CONTENT_TYPE[user.photoPath.endsWith('.png') ? 'png' : 'jpg'],
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
}
