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
  /** First screen, the big one. Landscape, 4:3. */
  crew: {
    file: 'crew.jpg',
    ready: true,
    want: 'Everyone in one frame. A group shot after a showcase or a jam.',
    alt: 'The FUNKtion crew together on stage after FRESH',
  },
  /** First screen, the small one tucked under the big one. Square. */
  candid: {
    file: 'candid.jpg',
    ready: true,
    want: 'A candid mid-move. Popping or locking, not posing.',
    alt: 'A FUNKtion member on the stairs, pointing at the camera',
  },
  /** On the "first time" card. Landscape, 4:3. */
  newcomer: {
    file: 'newcomer.jpg',
    ready: true,
    want: 'A beginner class or a freshie workshop, people learning.',
    alt: 'A FUNKtion member watching, arms crossed',
    focus: '50% 45%',
  },
  /** On the "coming back" card. Landscape, 4:3. */
  returning: {
    file: 'returning.jpg',
    ready: true,
    want: 'Last term: a battle, a showcase, the practice room at 11pm.',
    alt: 'A FUNKtion member cheering, fists clenched',
    focus: '50% 40%',
  },
  /** The last screen, a big print that develops as they finish. Landscape, 3:2. */
  done: {
    file: 'done.jpg',
    ready: true,
    want: 'The dance floor, everyone joining in.',
    alt: 'FUNKtion members and the crowd dancing together on the floor',
    focus: '50% 55%',
  },
} satisfies Record<string, PhotoSlot>
