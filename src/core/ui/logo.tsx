import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LogoProps {
  size?: number
  className?: string
  showText?: boolean
}

function Logo({ size = 16, className, showText = true }: LogoProps) {
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
    </div>
  )
}

function Wordmark({
  className,
  priority,
}: {
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src="/funktion-logo.svg"
      alt="FUNKtion"
      width={1000}
      height={677}
      unoptimized
      priority={priority}
      className={cn('h-auto w-auto', className)}
    />
  )
}

export { Logo, Wordmark }
