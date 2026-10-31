import { adminHeaders } from './_supabase-admin.js';
import Stripe from 'stripe';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function onRequestPost({request,env}) {
  const publicCheckout = env.NF_CHECKOUT_ENABLED === 'true';
  if (!publicCheckout && !env.NF_CHECKOUT_TEST_USER_ID) return json({error:'Billing is not open'},403);
  if(![env.STRIPE_SECRET_KEY,env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,env.SUPABASE_SECRET_KEY].every(Boolean)) return json({error:'Configuration missing'},503);
  if(new URL(request.url).hostname!=='www.neurofusiondaily.com'||request.headers.get('Origin')!=='https://www.neurofusiondaily.com') return json({error:'Origin denied'},403);
  const auth=request.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer ')) return json({error:'Login required'},401);
  try {
    const root=env.SUPABASE_URL.replace(/\/$/,'');
    const u=await fetch(`${root}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:auth}});
    if(!u.ok) return json({error:'Session expired'},401);
    const user=await u.json();
    if(!user.id||!user.email_confirmed_at) return json({error:'Verified account required'},403);
    if (!publicCheckout && user.id !== env.NF_CHECKOUT_TEST_USER_ID)
      return json({error:'Billing is not open'},403);
    const r=await fetch(`${root}/rest/v1/nf_memberships?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`,{headers:adminHeaders(env)});
    if(!r.ok) throw new Error('Membership lookup failed');
    const customerId=(await r.json())[0]?.stripe_customer_id;
    if(!customerId) return json({error:'No billing account found'},404);
    const stripe=new Stripe(env.STRIPE_SECRET_KEY,{httpClient:Stripe.createFetchHttpClient()});
    const customer=await stripe.customers.retrieve(customerId);
    if(customer.deleted||customer.metadata?.supabase_user_id!==user.id) return json({error:'Customer association mismatch'},409);
    const portal=await stripe.billingPortal.sessions.create({customer:customerId,return_url:'https://www.neurofusiondaily.com/members/'});
    return json({url:portal.url});
  } catch(e) {console.error('Billing portal error',e.message);return json({error:'Billing temporarily unavailable'},503);}
}
export function onRequestGet(){return json({error:'Method not allowed'},405);}
