'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  fallback: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-[12px]',
  lg: 'h-10 w-10 text-[14px]',
}

function Avatar({ fallback, size = 'md', className, ...props }: AvatarProps) {
  const initials = fallback
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center rounded-full bg-accent-50 font-medium text-accent-700',
        sizeClasses[size],
        className
      )}
      role="img"
      aria-label={fallback}
      {...props}
    >
      <span aria-hidden="true">{initials}</span>
    </div>
  )
}

export { Avatar }
