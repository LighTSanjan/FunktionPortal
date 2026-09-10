import Link from 'next/link'
import { formatSgd } from '@/modules/coach-claim/money'

// Mix high bits before the small modulus so real rosters distribute evenly.
function inkIndex(value: string, buckets: number): number {
  let h = 5381
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  h = Math.imul(h, 3266489909)
  h = (h ^ (h >>> 16)) >>> 0
  return h % buckets
}

export function InstructorCard({
  href,
  fullName,
  danceStyle,
  shortCode,
  rateCents,
  engagement,
  isActive,
  missing,
  photoUrl,
  delayMs = 0,
}: {
  href: string
  fullName: string
  danceStyle: string
  shortCode: string
  rateCents: number | null
  engagement: 'CONTRACTED' | 'GUEST'
  isActive: boolean
  missing: string[]
  photoUrl?: string | null
  delayMs?: number
}) {
  const initials = fullName
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const inks = ['vermilion', 'marigold', 'sky', 'indigo'] as const
  // djb2 over the name, not a sum of the code points: a plain sum gave "ET"
  // and "JW" the same colour, and two identically-coloured plates side by
  // side is exactly the thing the colour is here to prevent. Keyed on the
  // name so a coach keeps their colour when the list is reordered.
  const ink = inks[inkIndex(fullName, inks.length)]

  return (
    <Link
      href={href}
      className="rise-in lapis-lift group block overflow-hidden rounded-[var(--radius-lg)] border border-brand-ink bg-surface"
      style={{ '--delay': `${delayMs}ms` } as React.CSSProperties}
    >
      <div
        className="relative aspect-[16/11] overflow-hidden"
        style={{ background: `var(--brand-${ink})` }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, not a static asset
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-[34px] font-bold leading-none tracking-[-0.04em] text-white/90"
            >
              {initials}
            </span>
            {/* The stack again, as a corner motif, so an empty plate still
                looks designed rather than unfinished. */}
            <span
              aria-hidden="true"
              className="absolute -bottom-5 -right-5 h-20 w-20 rotate-45 opacity-25"
              style={{
                background:
                  'repeating-linear-gradient(90deg, #fff 0 6px, transparent 6px 16px)',
              }}
            />
          </>
        )}

        {/* The short code, because it is what the coach's invoice file is
            named after and the treasurer looks it up more often than they
            look up anything else on this card. */}
        <span className="absolute bottom-2 left-2.5 rounded bg-brand-ink/45 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-white">
          {shortCode}
        </span>

        {!isActive && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-brand-ink/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Inactive
          </span>
        )}
        {engagement === 'GUEST' && isActive && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text">
            Guest
          </span>
        )}
      </div>

      <div className="border-t border-brand-ink p-3">
        <p className="truncate text-[13px] font-semibold text-text">{fullName}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-text-muted">
          {danceStyle}
          {rateCents !== null && ` · ${formatSgd(rateCents)}/hr`}
        </p>

        <p
          className={`mt-2 text-[11px] font-medium ${
            missing.length > 0 ? 'text-danger' : 'text-success'
          }`}
        >
          {missing.length > 0 ? `No ${missing.join(', ')}` : 'Ready to invoice'}
        </p>
      </div>
    </Link>
  )
}
