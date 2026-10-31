import Stripe from 'stripe';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const noCache=response=>{const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store, max-age=0');headers.set('X-Robots-Tag','noindex, nofollow');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});};
const redirect=(url)=>new Response(null,{status:302,headers:{Location:url,'Cache-Control':'no-store'}});
const readCookie=(header,name)=>header.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
export async function onRequest(context){
  const {request,env}=context;
  const raw=readCookie(request.headers.get('Cookie')||'','nf_member_access');
  if(!raw)return redirect('/member-login.html');
  let token;
  try{token=decodeURIComponent(raw);}catch{return redirect('/member-login.html');}
  if(![env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,env.SUPABASE_SECRET_KEY,env.STRIPE_SECRET_KEY,env.STRIPE_MONTHLY_PRICE_ID,env.STRIPE_YEARLY_PRICE_ID].every(Boolean))return json({error:'Membership service unavailable'},503);
  try{
    const root=env.SUPABASE_URL.replace(/\/$/,'');
    const auth=await fetch(`${root}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`}});
    if(!auth.ok)return redirect('/member-login.html');
    const user=await auth.json();
    if(!user.id||!user.email_confirmed_at)return redirect('/member-login.html');
    // Optional explicit owner-preview account; set NF_OWNER_USER_ID only if owner access is needed.
    if(env.NF_OWNER_USER_ID && user.id===env.NF_OWNER_USER_ID)return noCache(await context.next());
    const result=await fetch(`${root}/rest/v1/nf_memberships?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,stripe_subscription_id`,{headers:{apikey:env.SUPABASE_SECRET_KEY,Authorization:`Bearer ${env.SUPABASE_SECRET_KEY}`}});
    if(!result.ok)throw new Error('Membership query failed');
    const record=(await result.json())[0];
    if(!record?.stripe_customer_id||!record?.stripe_subscription_id)return redirect('/living.html?membership=required');
    const stripe=new Stripe(env.STRIPE_SECRET_KEY,{httpClient:Stripe.createFetchHttpClient()});
    const [customer,sub]=await Promise.all([stripe.customers.retrieve(record.stripe_customer_id),stripe.subscriptions.retrieve(record.stripe_subscription_id)]);
    const prices=sub.items.data.map(item=>item.price.id);
    const entitled=!customer.deleted&&customer.metadata?.supabase_user_id===user.id&&sub.metadata?.supabase_user_id===user.id&&sub.customer===record.stripe_customer_id&&prices.length===1&&[env.STRIPE_MONTHLY_PRICE_ID,env.STRIPE_YEARLY_PRICE_ID].includes(prices[0])&&['active','trialing'].includes(sub.status);
    if(!entitled)return redirect('/living.html?membership=required');
    return noCache(await context.next());
  }catch(error){console.error('Protected page error:',error.message);return json({error:'Membership verification unavailable'},503);}
}
