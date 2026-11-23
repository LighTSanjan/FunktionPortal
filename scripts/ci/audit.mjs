// Production dependency audit: fail on any high or critical advisory, except
// the ones named below, each with the reason it is safe to carry.
//
// `npm audit` has no allowlist of its own, and loosening the whole gate to
// "critical" would let a new high through unnoticed. An exception here is one
// advisory id, in the open, and it stops applying the moment the advisory is
// listed against anything else.
import { execFileSync } from 'node:child_process'

const ACCEPTED = {
  // effect <=3.22.0: ReDoS in Schema.TemplateLiteral. It arrives only through
  // prisma -> @prisma/config, the CLI's own config loader, which never parses
  // anything a user sends. The only "fix" npm offers is downgrading Prisma to
  // 6.12, which this schema no longer supports. Remove when Prisma bumps effect.
  'GHSA-7589-6fvf-x4pw': 'effect, reached only through the Prisma CLI',
}

let raw
try {
  raw = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch (error) {
  // npm audit exits non-zero when it finds anything; the report is on stdout.
  raw = error.stdout
}

const report = JSON.parse(raw)
const found = []
for (const [name, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
  if (vulnerability.severity !== 'high' && vulnerability.severity !== 'critical') continue
  // Direct advisories only; a package that merely depends on a vulnerable one
  // is reported through the one that is actually vulnerable.
  for (const via of vulnerability.via) {
    if (typeof via === 'string') continue
    const id = via.url?.split('/').pop() ?? via.title
    if (via.severity !== 'high' && via.severity !== 'critical') continue
    found.push({ name, id, title: via.title, severity: via.severity })
  }
}

const blocking = found.filter((f) => !(f.id in ACCEPTED))
for (const f of found.filter((f) => f.id in ACCEPTED)) {
  console.log(`accepted  ${f.severity}  ${f.name}  ${f.id}  (${ACCEPTED[f.id]})`)
}
for (const f of blocking) {
  console.error(`BLOCKING  ${f.severity}  ${f.name}  ${f.id}  ${f.title}`)
}
if (blocking.length > 0) process.exit(1)
console.log('No unaccepted high or critical advisories in production dependencies.')
