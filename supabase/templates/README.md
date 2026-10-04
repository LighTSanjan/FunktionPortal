# Email templates

`sign-in-code.html` is the only email the portal sends. Paste the whole file into
Supabase → Authentication → Emails → Templates, into **both** "Magic Link" and
"Confirm signup", with the subject `Your FUNKtion sign-in code`. The local test
stack serves this folder to GoTrue, so the tests read the same email.

It is deliberately plain: no images, no links, no hidden preview text, no styling
beyond the code's size. The earlier branded version loaded two images from the
portal and was sent from a personal Gmail account, which is the shape of a
phishing email, and SUTD's Microsoft 365 filter first quarantined it and then
(October 2026) stopped delivering it at all. Nothing explanatory goes inside the
template either, because filters read HTML comments too.

A code and not a link: Outlook's Safe Links opens every link in an email before
the person does, and a one-time link opened once no longer works.

The branded version is in git history (`git log -- supabase/templates/sign-in-code.html`)
if a proper sending domain ever makes it safe to bring back.
