# NeuroFusion Living — private premium files

1. Run `supabase/migrations/20261101_premium_files.sql` in the Supabase SQL editor.
2. Verify `neurofusion-premium` bucket remains PRIVATE, with no anon/authenticated storage policies.
3. Deploy this repository to Cloudflare Pages (existing env variables; no new secrets).
4. Signed-out test: `/members/files?id=00000000-0000-4000-8000-000000000000` must return `session_missing` (401).
5. Signed-in, cancelled test: the same URL must return `membership_required` (403).
6. Owner-only uploads: POST `/members/files?section=academy&title=Example%20Workbook` from the SAME site origin with an authenticated owner cookie, `Content-Type: application/pdf`, `Content-Length`, and raw PDF bytes. File limit: 20 MB. New resources are unpublished.
7. Review the uploaded file in Supabase Storage, then publish with an owner-controlled SQL update of `public.nf_premium_files.published` for that resource ID. An owner-facing upload/publishing UI can be added when content management is implemented.
8. Authenticated members request `/members/files?id=<published-resource-uuid>`; the server checks identity and live Stripe entitlement through middleware, looks up an approved file ID, and returns a 60-second signed URL.

Never store premium files in `dist/`, `images/`, `media/`, or other publicly served directories. Never put a Supabase secret key in client JavaScript. Signed URLs can be copied during their brief lifetime, and paying members can still save/record content; no web protection is absolute.

**Not yet covered:** premium video streaming/DRM, file publishing UI, automated integration tests, broader security penetration testing.
