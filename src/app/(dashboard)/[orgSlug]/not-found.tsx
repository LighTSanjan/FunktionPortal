import { ErrorScene } from '@/core/ui/error-scene'

/** Inside the portal: a record that does not exist, or belongs to another club. */
export default function OrgNotFound() {
  return (
    <ErrorScene
      kind="not-found"
      body={
        <p>
          That record does not exist, or it is not one you can see. If somebody sent you the link,
          it may be for a different club or an account with more access.
        </p>
      }
    />
  )
}
