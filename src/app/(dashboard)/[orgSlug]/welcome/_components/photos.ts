/**
 * The club's own photographs on the welcome screens.
 *
 * To put a picture in a slot: drop the file into `public/welcome/` under the
 * name given here, then set `ready: true`. Until then the slot shows a frame
 * saying what belongs in it. `focus` is the CSS object-position, for when the
 * faces aren't in the middle.
 */
export interface PhotoSlot {
  file: string
  ready: boolean
  /** What to put here — shown in the empty frame. */
  want: string
  alt: string
  focus?: string
}

export const PHOTOS = {
  /** First screen, the big one. Portrait, roughly 4:5. */
  crew: {
    file: 'crew.jpg',
    ready: false,
    want: 'Everyone in one frame. A group shot after a showcase or a jam.',
    alt: 'The FUNKtion crew together after a performance',
  },
  /** First screen, the small one tucked under the big one. Square. */
  candid: {
    file: 'candid.jpg',
    ready: false,
    want: 'A candid mid-move. Popping or locking, not posing.',
    alt: 'A FUNKtion dancer mid-move',
  },
  /** On the "first time" card. Landscape, roughly 16:10. */
  newcomer: {
    file: 'newcomer.jpg',
    ready: false,
    want: 'A beginner class or a freshie workshop, people learning.',
    alt: 'A FUNKtion beginner class',
  },
  /** On the "coming back" card. Landscape, roughly 16:10. */
  returning: {
    file: 'returning.jpg',
    ready: false,
    want: 'Last term: a battle, a showcase, the practice room at 11pm.',
    alt: 'FUNKtion members at last term’s showcase',
  },
  /** The last screen, a print that develops as they finish. Square. */
  done: {
    file: 'done.jpg',
    ready: false,
    want: 'The practice room, or the crew cheering somebody on.',
    alt: 'The FUNKtion practice room',
  },
} satisfies Record<string, PhotoSlot>
