import { revalidatePath } from 'next/cache'

export interface FormActionState {
  error: string | null
  ok?: boolean
  message?: string
  /** Keyed by field: `fullName`, `studentId`, `payment`, or a question id. */
  fieldErrors?: Record<string, string>
}

/** Every screen that shows the form, its responses, or what they add up to. */
export function revalidateForm(orgSlug: string) {
  revalidatePath(`/${orgSlug}/fees`)
  revalidatePath(`/${orgSlug}/fees/collection`)
  revalidatePath(`/${orgSlug}/dashboard`)
}
