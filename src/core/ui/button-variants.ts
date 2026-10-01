import { cva } from 'class-variance-authority'

/**
 * The button's look, apart from the button, so a server-rendered link can
 * wear it too. It cannot live in button.tsx: that is a client module, and a
 * server component cannot call a function exported from one.
 */
export const buttonVariants = cva(
  'lapis-press inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'lapis-stack bg-accent-500 text-white hover:bg-accent-400',
        secondary:
          'lapis-tap border border-border-strong bg-surface text-text hover:bg-surface-hover',
        ghost:
          'text-text-muted hover:bg-surface-hover hover:text-text',
        danger:
          'lapis-tap bg-danger text-white hover:bg-danger/90',
      },
      size: {
        sm: 'h-8 rounded-[var(--radius-sm)] px-3 text-[12px]',
        md: 'h-9 rounded-[var(--radius-sm)] px-4 text-[13px]',
        lg: 'h-11 rounded-[var(--radius-md)] px-5 text-[14px]',
        icon: 'h-9 w-9 rounded-[var(--radius-sm)]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)
