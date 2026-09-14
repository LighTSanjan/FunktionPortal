/**
 * The demo club: the browser-journey data, plus an invitation so the member
 * can sign in too. Everything is made up and lives only in the local stack.
 */
import seed, { MEMBER, TREASURER } from '../../e2e/usability/seed'
import { dbAdmin } from '../../src/core/db/admin'

async function main() {
  await seed()
  const org = await dbAdmin.organisation.findUniqueOrThrow({ where: { slug: 'test-club' } })
  await dbAdmin.invitation.create({
    data: {
      orgId: org.id,
      email: MEMBER.email,
      token: `demo-${Date.now()}`,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  })
  console.log(`
  Demo club ready.

    Open         http://localhost:3100
    Treasurer    ${TREASURER.email}   (becomes exco on first sign-in)
    Member       ${MEMBER.email}      (invited)
    Codes        http://localhost:58025   ← every sign-in email lands here

  Once signed in as the treasurer: Settings → All screens.
`)
  await dbAdmin.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
