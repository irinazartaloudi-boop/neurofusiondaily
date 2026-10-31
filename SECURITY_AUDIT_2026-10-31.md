# Security review — 31 October 2026

## Implemented in this update
- Member content publishing POST now rejects cross-origin requests, requires JSON, validates the actual request body size (not just the client-supplied Content-Length header), and reports malformed JSON with a 400 response.
- Authenticated member page responses now add `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: strict-origin-when-cross-origin` in addition to the existing private/no-store and noindex protections.

## Code findings (not live verification)
- `/members/*` middleware checks a verified Supabase account and either an exact owner ID or active/trialing Stripe entitlement tied to the user. Errors fail closed.
- Content writes are owner-only; reads are restricted to published items for non-owners, and are under the protected `/members/` route.
- Checkout is gated by `NF_CHECKOUT_ENABLED=true` and validates the Origin. This must remain disabled until live testing is completed.
- Billing portal validates identity and Stripe customer ownership.

## Still requires live verification / configuration
1. Cloudflare Pages middleware is active on all `/members/*` routes, including `/members/content` and static premium assets.
2. Cloudflare Access is configured for the intended prelaunch owner-only state; it must not accidentally bypass application authentication or block paying users at launch.
3. Supabase RLS policies and privileges for `nf_content`, `nf_memberships`, and future private member data, including direct REST attempts using the public key.
4. Cloudflare environment secrets, Stripe webhook signature and event handling, Supabase auth redirect allowlist, email verification and password reset.
5. Test unpaid user, expired token, cancelled subscriber, active subscriber, direct URL to protected assets, owner publishing, and cross-site publishing attempts in deployed environment.

No production security guarantee is possible from static repository inspection alone.
