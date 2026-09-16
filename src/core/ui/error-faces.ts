/**
 * Photos for the error pages. Add a file to public/faces/ and a line here.
 *
 * Only with the person's say-so: these show to anybody who hits an error,
 * and a photo in public/ can be fetched by anyone who has the URL.
 * Square-ish, under 300 KB, and funny rather than embarrassing.
 *
 * `for` limits a photo to some pages; leave it out and it can turn up on any.
 */
export type ErrorKind = 'not-found' | 'crash' | 'no-access' | 'offline' | 'stale'

export interface ErrorFace {
  src: string
  /** Written under the photo, polaroid style. Keep it short. */
  caption: string
  alt: string
  for?: ErrorKind[]
}

export const ERROR_FACES: ErrorFace[] = [
  {
    src: '/eu-gene-battle.jpg',
    caption: 'mid-battle, unbothered',
    alt: 'A FUNKtion dancer mid-battle',
  },
]
