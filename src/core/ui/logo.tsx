import { cn } from '@/lib/utils'

interface LogoProps {
  size?: number
  className?: string
  showText?: boolean
  version?: string
}

/**
 * FUNKtion mark — the kueh lapis stack from /public/funktion-mark.svg.
 *
 * This is the product's own mark, not the club logo an organisation uploads.
 * The uploaded one renders from signed storage in the sidebar header; this
 * one sits in the footer and in the auth card, and is the same in every
 * organisation.
 */
function Logo({ size = 16, className, showText = true, version }: LogoProps) {
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- plain img matches sidebar pattern; sizes vary by call site */}
      <img
        src="/funktion-mark.svg"
        width={size}
        height={size}
        alt="FUNKtion"
        aria-hidden="true"
      />
      {showText && (
        <span className="text-[12px] font-semibold text-text-subtle">
          FUNKtion
        </span>
      )}
      {version && (
        <span className="text-[10px] text-text-subtle">
          {version}
        </span>
      )}
    </div>
  )
}

export { Logo }
