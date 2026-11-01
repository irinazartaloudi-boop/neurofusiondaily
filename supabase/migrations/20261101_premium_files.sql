-- Run once in the Supabase SQL editor before deploying the private file endpoint.
CREATE TABLE IF NOT EXISTS public.nf_premium_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  section text NOT NULL CHECK (section IN ('academy','kitchen','journal','calm','studio','reset','seasons')),
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nf_premium_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nf_premium_files FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nf_premium_files TO service_role;
-- The bucket must remain private. Never add SELECT policies on storage.objects for anon/authenticated.
UPDATE storage.buckets SET public = false WHERE id = 'neurofusion-premium';
