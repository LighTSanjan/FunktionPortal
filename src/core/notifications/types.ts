export type PortalNotificationTone = 'urgent' | 'attention' | 'info'

/** An unresolved piece of work shown in the shell notification menu. */
export interface PortalNotification {
  id: string
  title: string
  detail: string
  href: string
  tone: PortalNotificationTone
}
