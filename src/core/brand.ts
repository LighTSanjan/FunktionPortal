/**
 * The deployment's own identity — the parts of the portal that are visible
 * before anybody has signed in.
 *
 * Everything a *document* says about an organisation comes from
 * OrganisationSettings, because documents belong to the organisation. This is
 * the other half: the sign-in page, the browser tab, the wordmark. There is no
 * organisation in scope there, so it cannot come from the database, and it
 * should not be scattered through a dozen components either.
 *
 * Overridable by environment so that another student organisation can deploy
 * this without editing components. They are NEXT_PUBLIC_ and therefore fixed
 * at build time, which is the right lifetime for them: the sign-in page's
 * wordmark is not something anybody should be able to change at runtime.
 */

/** Where the portal's own assets live, replaceable by dropping in files. */
export interface BrandAssets {
  /** The full wordmark, used large on the sign-in page. */
  wordmark: string
  /** A square mark for the places too small for the wordmark. */
  mark: string
}

export interface Brand {
  /** The organisation this deployment serves. */
  name: string
  /** What the product calls itself in the browser tab. */
  productName: string
  /** One line under the wordmark on the sign-in page. */
  tagline: string
  /** For the tab and for search results. */
  description: string
  /**
   * The email domain members will actually type, shown as a placeholder.
   * Empty renders a generic one rather than somebody else's university.
   */
  emailDomain: string
  assets: BrandAssets
}

const NAME = process.env.NEXT_PUBLIC_BRAND_NAME || 'FUNKtion'
const TAGLINE =
  process.env.NEXT_PUBLIC_BRAND_TAGLINE || "SUTD's Ultimate Popping & Locking Dance Club!"

export const BRAND: Brand = {
  name: NAME,
  productName: process.env.NEXT_PUBLIC_BRAND_PRODUCT_NAME || `${NAME} Treasury`,
  tagline: TAGLINE,
  description: process.env.NEXT_PUBLIC_BRAND_DESCRIPTION || `Treasury portal for ${NAME}. ${TAGLINE}`,
  emailDomain: process.env.NEXT_PUBLIC_BRAND_EMAIL_DOMAIN ?? 'mymail.sutd.edu.sg',
  assets: {
    wordmark: process.env.NEXT_PUBLIC_BRAND_WORDMARK || '/funktion-logo.svg',
    mark: process.env.NEXT_PUBLIC_BRAND_MARK || '/funktion-icon.png',
  },
}

/** "you@mymail.sutd.edu.sg", or a neutral one where no domain is configured. */
export function emailPlaceholder(): string {
  return BRAND.emailDomain ? `you@${BRAND.emailDomain}` : 'you@example.com'
}
