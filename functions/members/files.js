// Private premium resource delivery. All requests first pass /members/_middleware.js.
import { adminHeaders } from '../api/_supabase-admin.js';

const BUCKET = 'neurofusion-premium';
const MAX_UPLOAD = 20 * 1024 * 1024;
const TYPES = new Set(['application/pdf', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'image/png', 'image/jpeg', 'application/zip']);
const reply = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const base = env => env.SUPABASE_URL.replace(/\/$/, '');
const validId = s => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s || '');
async function identity(request, env) {
  const c = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('nf_member_access='));
  if (!c) return null;
  let token; try { token = decodeURIComponent(c.slice('nf_member_access='.length)); } catch { return null; }
  const r = await fetch(`${base(env)}/auth/v1/user`, {headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY, Authorization:`Bearer ${token}`},cache:'no-store'});
  if (!r.ok) return null;
  const user = await r.json();
  return user.id && user.email_confirmed_at ? user : null;
}
async function db(env, path, options = {}) {
  return fetch(`${base(env)}/rest/v1/${path}`, {...options, headers:adminHeaders(env, options.headers || {}),cache:'no-store'});
}
export async function onRequestGet({request,env}) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!validId(id)) return reply({error:'Valid resource ID required'},400);
    const user = await identity(request,env);
    if (!user) return reply({error:'Sign in required'},401);
    const owner = Boolean(env.NF_OWNER_USER_ID && user.id === env.NF_OWNER_USER_ID);
    const r = await db(env,`nf_premium_files?id=eq.${encodeURIComponent(id)}&select=storage_path,published`);
    if (!r.ok) return reply({error:'Resource catalogue unavailable'},503);
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length !== 1 || (!rows[0].published && !owner)) return reply({error:'Resource not found'},404);
    const path = rows[0].storage_path;
    if (typeof path !== 'string' || !/^[a-zA-Z0-9_./-]{1,400}$/.test(path) || path.includes('..') || path.startsWith('/')) return reply({error:'Invalid stored resource'},503);
    const signed = await fetch(`${base(env)}/storage/v1/object/sign/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method:'POST',headers:adminHeaders(env,{'Content-Type':'application/json'}),body:JSON.stringify({expiresIn:60}),cache:'no-store'
    });
    if (!signed.ok) {console.error('File signing failed',signed.status);return reply({error:'Resource unavailable'},503);}
    const result = await signed.json();
    if (typeof result.signedURL !== 'string' || !result.signedURL.startsWith('/')) return reply({error:'Invalid storage response'},503);
    return reply({url:`${base(env)}/storage/v1${result.signedURL}`,expires_in_seconds:60});
  } catch(e) {console.error('Premium file access failed',e?.message);return reply({error:'Resource service unavailable'},503);}
}
export async function onRequestPost({request,env}) {
  try {
    if (request.headers.get('Origin') !== new URL(request.url).origin) return reply({error:'Origin denied'},403);
    const user = await identity(request,env);
    if (!user || !env.NF_OWNER_USER_ID || user.id !== env.NF_OWNER_USER_ID) return reply({error:'Owner access required'},403);
    const url = new URL(request.url);
    const title = url.searchParams.get('title')?.trim();
    const section = url.searchParams.get('section');
    const mime = request.headers.get('Content-Type')?.split(';')[0]?.toLowerCase();
    if (!title || title.length > 160 || !['academy','kitchen','journal','calm','studio','reset','seasons'].includes(section) || !TYPES.has(mime)) return reply({error:'Invalid file metadata or type'},400);
    const declared = Number(request.headers.get('Content-Length'));
    if (!Number.isFinite(declared) || declared < 1 || declared > MAX_UPLOAD) return reply({error:'File must be 1 byte to 20 MB'},413);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_UPLOAD) return reply({error:'File too large'},413);
    const extension = {'application/pdf':'pdf','audio/mpeg':'mp3','audio/mp4':'m4a','audio/wav':'wav','image/png':'png','image/jpeg':'jpg','application/zip':'zip'}[mime];
    const path = `${section}/${crypto.randomUUID()}.${extension}`;
    const upload = await fetch(`${base(env)}/storage/v1/object/${BUCKET}/${path}`, {method:'POST',headers:adminHeaders(env,{'Content-Type':mime,'x-upsert':'false'}),body:bytes,cache:'no-store'});
    if (!upload.ok) {console.error('Premium upload failed',upload.status);return reply({error:'Private storage upload failed'},503);}
    const record = await db(env,'nf_premium_files',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({title,section,storage_path:path,mime_type:mime,published:false})});
    if (!record.ok) {
      await fetch(`${base(env)}/storage/v1/object/${BUCKET}`,{method:'DELETE',headers:adminHeaders(env,{'Content-Type':'application/json'}),body:JSON.stringify({prefixes:[path]})}).catch(()=>{});
      console.error('Premium catalogue insert failed',record.status);
      return reply({error:'File catalogue save failed'},503);
    }
    const rows = await record.json();
    return reply({resource:rows[0],note:'Uploaded as unpublished. Publish only after reviewing the resource.'},201);
  } catch(e) {console.error('Premium upload failed',e?.message);return reply({error:'Upload unavailable'},503);}
}
