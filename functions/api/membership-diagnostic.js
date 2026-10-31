import { adminHeaders } from './_supabase-admin.js';
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
// Diagnostic is owner-only, requires a fresh Supabase access token, and never returns secret material.
export async function onRequestGet({request,env}) {
  if(!env.NF_OWNER_USER_ID||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY||!env.SUPABASE_SECRET_KEY) return respond({error:'Not available'},404);
  const auth=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9._~-]+$/.test(auth)) return respond({error:'Not found'},404);
  try {
    const root=env.SUPABASE_URL.replace(/\/$/,'');
    const u=await fetch(`${root}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:auth},cache:'no-store'});
    if(!u.ok) return respond({error:'Not found'},404);
    const user=await u.json();
    if(user.id!==env.NF_OWNER_USER_ID||!user.email_confirmed_at) return respond({error:'Not found'},404);
    const r=await fetch(`${root}/rest/v1/nf_memberships?select=user_id&limit=1`,{headers:adminHeaders(env),cache:'no-store'});
    const body=await r.text();
    let code='unknown';
    try {code=JSON.parse(body).code||'none';} catch {code=r.ok?'ok':'non_json';}
    return respond({membership_query_http_status:r.status,database_error_code:code,credential_type:env.SUPABASE_SECRET_KEY.startsWith('sb_secret_')?'modern_secret':'legacy_or_other'});
  }catch(e){console.error('Membership diagnostic failure',e.message);return respond({error:'Diagnostic unavailable'},503);}
}
