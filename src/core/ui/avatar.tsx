'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  fallback: string
  /** Their photo, when they have one; the initials otherwise. */
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-[12px]',
  lg: 'h-10 w-10 text-[14px]',
  xl: 'h-20 w-20 text-[24px]',
}

function Avatar({ fallback, src, size = 'md', className, ...props }: AvatarProps) {
  const initials = fallback
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-50 font-medium text-accent-700',
        sizeClasses[size],
        className
      )}
      role="img"
      aria-label={fallback}
      {...props}
    >
      {src ? (
        // A small private image streamed by the app; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  )
}

export { Avatar }
