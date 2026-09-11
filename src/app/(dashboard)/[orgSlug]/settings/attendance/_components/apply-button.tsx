'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/core/ui/button'
import { applyImport, type ActionState } from '@/modules/attendance/actions'

export function ApplyButton({
  orgSlug,
  importId,
  classes,
  marks,
}: {
  orgSlug: string
  importId: string
  classes: number
  marks: number
}) {
  const action = applyImport.bind(null, orgSlug)
  const [state, formAction] = useActionState<ActionState, FormData>(action, { error: null })

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="importId" value={importId} />
      <Submit classes={classes} marks={marks} />
      {state.error && (
        <span role="alert" className="text-[12.5px] text-danger">
          {state.error}
        </span>
      )}
    </form>
  )
}

function Submit({ classes, marks }: { classes: number; marks: number }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending || classes === 0}>
      {pending
        ? 'Writing…'
        : `Import ${classes} class${classes === 1 ? '' : 'es'} and ${marks} mark${marks === 1 ? '' : 's'}`}
    </Button>
  )
}
