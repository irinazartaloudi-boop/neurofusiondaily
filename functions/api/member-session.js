const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const cookieName='nf_member_access';
function cookie(value,maxAge){return `${cookieName}=${value}; Path=/members; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;}
export async function onRequestPost({request,env}){
  if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)return respond({error:'Authentication unavailable'},503);
  const authorization=request.headers.get('Authorization')||'';
  if(!/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))return respond({error:'Login required'},401);
  const token=authorization.slice(7);
  const url=env.SUPABASE_URL.replace(/\/$/,'');
  try{
    const response=await fetch(`${url}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`}});
    if(!response.ok)return respond({error:'Invalid session'},401);
    const user=await response.json();
    if(!user.id||!user.email_confirmed_at)return respond({error:'Verified account required'},403);
    // The cookie is an authenticated Supabase access token, NOT an entitlement token.
    // /members middleware rechecks both identity and paid subscription on every request.
    const out=respond({ok:true});
    out.headers.append('Set-Cookie',cookie(encodeURIComponent(token),3600));
    return out;
  }catch(e){console.error('Member session error',e.message);return respond({error:'Authentication unavailable'},503);}
}
export async function onRequestDelete(){const out=respond({ok:true});out.headers.append('Set-Cookie',cookie('',0));return out;}
