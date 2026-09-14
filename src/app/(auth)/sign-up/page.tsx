import { redirect } from 'next/navigation'

/** Accounts are made on first sign-in now. Old links land somewhere useful. */
export default function SignUpPage() {
  redirect('/sign-in')
}
