// Member identity is read server-side; never expose tokens or server credentials.
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({request, env}) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('nf_member_access='));
  if (!cookie || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({error:'Not signed in'},401);
  let token;
  try {token = decodeURIComponent(cookie.slice('nf_member_access='.length));} catch {return json({error:'Not signed in'},401);}
  try {
    const r = await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/auth/v1/user`, {headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY, Authorization:`Bearer ${token}`},cache:'no-store'});
    if (!r.ok) return json({error:'Not signed in'},401);
    const user = await r.json();
    if (!user.id || !user.email_confirmed_at) return json({error:'Not signed in'},401);
    return json({email:user.email || '', owner: Boolean(env.NF_OWNER_USER_ID && user.id === env.NF_OWNER_USER_ID)});
  } catch {return json({error:'Account information unavailable'},503);}
}
