import { adminHeaders } from './_supabase-admin.js';
import Stripe from 'stripe';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function onRequestGet({request,env}) {
  if(![env.STRIPE_SECRET_KEY,env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,env.SUPABASE_SECRET_KEY,env.STRIPE_MONTHLY_PRICE_ID,env.STRIPE_YEARLY_PRICE_ID].every(Boolean)) return json({error:'Configuration missing'},503);
  const auth=request.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer ')) return json({error:'Login required'},401);
  try {
    const root=env.SUPABASE_URL.replace(/\/$/,'');
    const r=await fetch(`${root}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:auth}});
    if(!r.ok) return json({error:'Invalid session'},401);
    const user=await r.json();
    if(!user.id||!user.email_confirmed_at) return json({error:'Verified account required'},403);
    const m=await fetch(`${root}/rest/v1/nf_memberships?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,stripe_subscription_id`,{headers:adminHeaders(env)});
    if(!m.ok) throw new Error('Membership query failed');
    const record=(await m.json())[0];
    if(!record?.stripe_customer_id||!record?.stripe_subscription_id) return json({entitled:false,status:'inactive'});
    const stripe=new Stripe(env.STRIPE_SECRET_KEY,{httpClient:Stripe.createFetchHttpClient()});
    const [customer,sub]=await Promise.all([stripe.customers.retrieve(record.stripe_customer_id),stripe.subscriptions.retrieve(record.stripe_subscription_id)]);
    const priceIds=sub.items.data.map(x=>x.price.id);
    const approved=[env.STRIPE_MONTHLY_PRICE_ID,env.STRIPE_YEARLY_PRICE_ID];
    const entitled=!customer.deleted&&customer.metadata?.supabase_user_id===user.id&&sub.metadata?.supabase_user_id===user.id&&sub.customer===record.stripe_customer_id&&priceIds.length===1&&approved.includes(priceIds[0])&&['active','trialing'].includes(sub.status);
    return json({entitled,status:sub.status});
  } catch(e){console.error('Membership status error',e.message);return json({error:'Membership verification unavailable'},503);}
}
