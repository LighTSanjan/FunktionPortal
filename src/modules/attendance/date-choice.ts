/**
 * The two answers about a class date that are not an instructor id.
 *
 * Spelled rather than left as the empty string, because the empty string is
 * what a browser sends for "nothing chosen" and both of these are deliberate
 * statements about what happened on a date.
 *
 * Their own module because the server action that reads them lives in a
 * `'use server'` file, which may export nothing but async functions, and the
 * form that writes them runs in the browser.
 */
export const SELF_PRACTICE = 'self-practice'
export const SKIP = 'skip'
