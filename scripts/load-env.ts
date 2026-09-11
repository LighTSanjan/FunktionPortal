/**
 * Environment for the command-line scripts, loaded the way Next.js loads it.
 *
 * `dotenv/config` reads .env alone, so a script picked up the committed
 * placeholder while the running app used the real value from .env.local — and
 * the failure looked like a missing key rather than a file precedence
 * problem. Earlier paths win, which is Next's order.
 */
import { config } from 'dotenv'

config({ path: ['.env.local', '.env'], quiet: true })
