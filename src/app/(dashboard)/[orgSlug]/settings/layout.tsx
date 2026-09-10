import { SettingsNav } from './_components/settings-nav'

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  return (
    <div className="space-y-6">
      <SettingsNav orgSlug={orgSlug} />
      {children}
    </div>
  )
}
