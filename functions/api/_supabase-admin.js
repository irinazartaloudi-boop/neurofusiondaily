// Shared Supabase REST service access. Never expose this module to the browser.
export function adminHeaders(env, extra = {}) {
  const key = env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Missing Supabase server credential');
  const headers = { apikey: key, Accept: 'application/json', ...extra };
  // Legacy service_role JWTs require Authorization; sb_secret_* keys must NOT
  // be used as bearer tokens. Supabase gateway authenticates them via apikey.
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}
