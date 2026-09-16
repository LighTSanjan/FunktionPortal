'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ERROR_FACES, type ErrorFace, type ErrorKind } from './error-faces'

/**
 * The club's error pages: one photo, one joke, one way out.
 *
 * An error is the moment somebody is most likely to decide the portal is
 * broken and go back to spreadsheets. So it should feel like the club rather
 * than like a server, say plainly what happened, and put the next click in
 * reach. The joke never replaces the explanation.
 */
const COPY: Record<ErrorKind, { code: string; title: string; body: string }> = {
  'not-found': {
    code: '404',
    title: 'This page missed its cue',
    body: 'Nothing lives at this address. The link may be old, or mistyped, or from a portal that has since moved things around.',
  },
  crash: {
    code: '500',
    title: 'Somebody tripped over a cable',
    body: 'This page broke on our side, not yours. Trying again often works. If it keeps happening, tell the treasurer what you were doing.',
  },
  'no-access': {
    code: 'EXCO',
    title: 'Backstage is for the exco',
    body: 'This part of the portal holds the club’s accounts, coaches’ details and other members’ payments.',
  },
  offline: {
    code: '⏸',
    title: 'The music stopped',
    body: 'The portal could not be reached. Check your connection and try again.',
  },
  stale: {
    code: '↻',
    title: 'This page is out of step',
    body: 'This tab can no longer load what it needs — usually because the portal was updated while it sat open. Reload the page to get a fresh copy. Anything already saved is safe.',
  },
}

function pickFace(kind: ErrorKind, seed: string): ErrorFace | null {
  const pool = ERROR_FACES.filter((face) => !face.for || face.for.includes(kind))
  if (pool.length === 0) return null
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return pool[hash % pool.length]
}

export interface ErrorSceneProps {
  kind: ErrorKind
  /** Replaces the default paragraph when the page knows more. */
  body?: React.ReactNode
  /** Shown small, for quoting to whoever fixes it. */
  reference?: string
  actions?: React.ReactNode
}

export function ErrorScene({ kind, body, reference, actions }: ErrorSceneProps) {
  const copy = COPY[kind]
  // Seeded by the address, so the server and the browser pick the same person
  // and a different broken page can turn up somebody else.
  const face = pickFace(kind, `${kind}${usePathname() ?? ''}`)
  const [photoFailed, setPhotoFailed] = useState(false)

  return (
    <div className="mx-auto grid max-w-[880px] items-center gap-10 px-2 py-10 sm:py-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <figure
        className="error-polaroid mx-auto w-full max-w-[300px] rotate-[-3deg] border border-brand-ink bg-white p-3 pb-4 lapis-plate"
        aria-hidden={!face || photoFailed}
      >
        <div className="relative aspect-square overflow-hidden bg-[linear-gradient(330deg,#F05B23_0%,#FBAE3A_34%,#5BC5EF_68%,#344D90_100%)]">
          {face && !photoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- error pages must not depend on the image optimiser
            <img
              src={face.src}
              alt={face.alt}
              onError={() => setPhotoFailed(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <Dancer />
          )}
          <span className="absolute left-2 top-2 rounded-[3px] border border-brand-ink bg-white px-1.5 py-0.5 font-mono text-[12px] font-semibold tracking-wide text-brand-ink">
            {copy.code}
          </span>
        </div>
        <figcaption className="mt-3 text-center font-[cursive] text-[17px] leading-tight text-text-muted">
          {face && !photoFailed ? face.caption : 'caught mid-move'}
        </figcaption>
      </figure>

      <div className="text-center md:text-left">
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] text-text sm:text-[36px]">
          {copy.title}
        </h1>
        <div className="mt-3 text-[15px] leading-relaxed text-text-muted">{body ?? <p>{copy.body}</p>}</div>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 md:justify-start">
          {actions ?? (
            <Link
              href="/"
              className="lapis-stack inline-flex h-11 items-center rounded-[var(--radius-md)] bg-accent-500 px-5 text-[14px] font-medium text-white hover:bg-accent-400"
            >
              Back to the home screen
            </Link>
          )}
        </div>
        {reference && (
          <p className="mt-6 font-mono text-[12px] text-text-subtle">
            Reference: <span className="select-all">{reference}</span>
          </p>
        )}
      </div>

      <style>{`
        @keyframes polaroid-sway { from { transform: rotate(-3deg); } to { transform: rotate(-1deg) translateY(-3px); } }
        .error-polaroid { animation: polaroid-sway 3.2s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) { .error-polaroid { animation: none; } }
      `}</style>
    </div>
  )
}

/** Until the club sends photos: a dancer frozen mid-freeze, in the brand's colours. */
function Dancer() {
  return (
    <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label="A drawing of a dancer">
      <circle cx="104" cy="46" r="15" fill="#111114" />
      <path
        d="M100 62 C 92 86, 88 104, 96 124 L 70 150 M96 124 L 132 138 L 150 118 M98 78 L 62 64 L 44 78 M98 80 L 132 70 L 150 44"
        stroke="#111114"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M30 170 H170" stroke="#111114" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
      <g fill="#fff" opacity="0.9">
        <circle cx="160" cy="30" r="3" />
        <circle cx="36" cy="40" r="2" />
        <circle cx="172" cy="84" r="2.5" />
      </g>
    </svg>
  )
}
