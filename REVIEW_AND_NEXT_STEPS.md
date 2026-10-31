# NeuroFusion Living — codebase review and controlled corrections

Reviewed the uploaded GitHub repository snapshot (72 ZIP entries). This package is a proposed **source-code revision**, not a deployment or proof of a successful payment flow.

## Changes made

- Added one shared Supabase server-side authentication helper. It distinguishes modern `sb_secret_*` API keys (sent as `apikey`, never as Bearer) from legacy service-role JWTs (which use both headers). Applied consistently to membership middleware, member-status, checkout, billing portal and Stripe webhook. This removes contradictory credential handling across functions.
- Improved protected-page error logging for failed Supabase queries. Logs contain the database error response (limited to 450 characters); they must remain server-side and may need redaction if the provider ever returns sensitive content.
- Added an owner-only membership diagnostic endpoint for identifying the database HTTP status and PostgREST error code, without revealing credentials or membership records. It requires an authenticated owner Supabase bearer token and is not directly callable from a browser address bar. Remove it after diagnosis if desired.
- Hid the 'Create an account' control while public signups remain disabled; the existing signup implementation is retained for later launch.
- Kept the visual dashboard, owner exception, Stripe entitlement checks, Cloudflare Access configuration and checkout feature flag unchanged.

## Important issues requiring live verification

1. **Unpaid test account still receives HTTP 503 in the deployed site.** The code suggests Supabase membership query failure, but the exact cause is **not proven**. This package addresses inconsistent credential formatting; a database diagnostic is still required if it persists.
2. **Database RPC contract cannot be verified from the repository.** `create-checkout.js` requires `nf_checkout_begin`, `nf_checkout_clear_terminal`, `nf_checkout_reset_stale`, `nf_checkout_bind_customer`, `nf_checkout_record`; `stripe-webhook.js` requires `nf_record_stripe_event`, `nf_apply_stripe_event`. None of their SQL definitions is present in the ZIP. Earlier project notes mention different checkout RPC names. Confirm these exact functions exist, signatures match and permissions are appropriate before opening checkout.
3. **Stripe webhook has not been verified end to end.** A successful Cloudflare deployment does not demonstrate that events write membership records. Verify after test checkout, using actual delivery and database state.
4. **The dashboard is still a static preview.** No premium lessons, per-member trackers or paid content API are implemented. The `dist/members/index.html` build output is public-repository source; do not put premium content into it. Server-side middleware guards HTTP delivery but does not make publicly committed content private.
5. **Cloudflare Access remains owner-only.** It must stay in place until paid-member authorization and content delivery have been tested. It currently prevents real paying customers from entering the protected production URL.
6. **Session cookie expires after one hour** and has no silent renewal flow for the server cookie; members may be asked to sign in again. Consider session-refresh and explicit sign-out before public launch.
7. **Checkout is disabled** unless `NF_CHECKOUT_ENABLED=true` is explicitly set in production. Do not enable until checkout RPCs and webhook have been validated.
8. **The login page is not a subscription purchase journey.** Signup is disabled and the public Living landing page still says enrollment is closed. A coherent purchase, confirmation, billing and cancellation UX is still needed.
9. **Security policy remains external to GitHub.** Supabase RLS, database constraints, Cloudflare Access rules, secrets and Stripe webhook settings cannot be audited from this ZIP alone.

## Deployment and verification

Upload the revised repository files to GitHub `main` preserving directory structure. Keep Cloudflare Access enabled, public signup off and checkout flag disabled. Verify the new production deployment. Re-test the existing unpaid test account and owner account. If 503 persists, use a server-side log or the owner-only diagnostic with an authenticated request; don't disclose the bearer token. Then confirm the required RPCs exist in Supabase before testing payments.

## Files changed

- `functions/api/_supabase-admin.js` (new)
- `functions/api/membership-diagnostic.js` (new)
- `functions/api/member-status.js`
- `functions/api/create-checkout.js`
- `functions/api/billing-portal.js`
- `functions/api/stripe-webhook.js`
- `functions/members/_middleware.js`
- `templates/member-login.html`

No Stripe secrets, Supabase credentials or private member data were added.
