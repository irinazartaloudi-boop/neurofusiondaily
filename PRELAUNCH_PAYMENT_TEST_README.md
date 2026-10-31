# Prelaunch real-payment test — restricted to one Supabase user

Public checkout stays disabled (`NF_CHECKOUT_ENABLED=false`). This change allows only the exact confirmed Supabase user ID in `NF_CHECKOUT_TEST_USER_ID` to create a **monthly** checkout session and access their own billing portal. All other users receive 403. The test account must authenticate normally, and existing membership, Stripe customer binding, subscription duplication checks and webhook processing remain in place.

## Owner setup (after deploying this repository)
1. In Supabase Authentication > Users, create or identify a separate test member account and verify its email. Copy its **User UID** (not email). Do not use the owner UID.
2. In Cloudflare Pages project environment variables, leave `NF_CHECKOUT_ENABLED=false`. Add `NF_CHECKOUT_TEST_USER_ID` with that exact test UID to the **production** environment; deploy the change. Never use an email address or secret key as the value.
3. Sign in as the test member and start the **monthly** checkout from the existing Living flow. Confirm the £12/month price on Stripe before paying. If the public page hides checkout entirely while the public flag is false, the test must use an authenticated, owner-controlled test UI (not a public link); do not enable the public flag to work around that.
4. After payment, verify the webhook delivery, subscription linkage and dashboard access. Cancel via the billing portal, verify cancellation behavior, then remove `NF_CHECKOUT_TEST_USER_ID` after testing.

## Important limits
This exception gates **checkout and billing-portal API endpoints**, not Supabase's public sign-up endpoint. Public account registration must be separately disabled or invitation-only in Supabase before claiming that visitors cannot create accounts. The current checkout entry UI was not modified in this patch. This is a source-code change, not a live deployment or a completed payment test.
