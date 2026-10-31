import { adminHeaders } from './_supabase-admin.js';
import Stripe from 'stripe';

const respond = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
const base = env => env.SUPABASE_URL.replace(/\/$/, '');
const admin = env => adminHeaders(env, {'Content-Type':'application/json'});
async function rpc(env,name,args) {
  const r=await fetch(`${base(env)}/rest/v1/rpc/${name}`,{method:'POST',headers:admin(env),body:JSON.stringify(args)});
  if(!r.ok) throw new Error(`RPC ${name}: ${r.status}`);
  return r.json();
}
async function membership(env,userId) {
  const r=await fetch(`${base(env)}/rest/v1/nf_memberships?user_id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id,stripe_subscription_id,subscription_status`,{headers:admin(env)});
  if(!r.ok) throw new Error('Membership lookup failed');
  return (await r.json())[0]??null;
}
const blocking=new Set(['active','trialing','past_due','unpaid','paused','incomplete']);
async function verifyUser(request,env) {
  const auth=request.headers.get('Authorization')??'';
  if(!auth.startsWith('Bearer ')) return null;
  const r=await fetch(`${base(env)}/auth/v1/user`,{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:auth}});
  if(!r.ok) return null;
  const user=await r.json();
  return user.id&&user.email&&user.email_confirmed_at?user:null;
}
function sameSite(request) {
  return new URL(request.url).hostname==='www.neurofusiondaily.com' && request.headers.get('Origin')==='https://www.neurofusiondaily.com';
}
async function checkCustomer(stripe,id,userId) {
  const c=await stripe.customers.retrieve(id);
  if(c.deleted||c.metadata?.supabase_user_id!==userId) throw new Error('Customer identity conflict');
  return c;
}
async function checkSubscriptions(stripe,customerId) {
  // Fail closed if pagination would make the duplicate-subscription check incomplete.
  const subs=await stripe.subscriptions.list({customer:customerId,status:'all',limit:100});
  if(subs.has_more||subs.data.some(s=>blocking.has(s.status))) return false;
  return true;
}
export async function onRequestPost({request,env}) {
  // This flag is absent until the complete access-control and billing journey is verified.
  if(env.NF_CHECKOUT_ENABLED!=='true') return respond({error:'Checkout is closed'},403);
  if(![env.STRIPE_SECRET_KEY,env.STRIPE_MONTHLY_PRICE_ID,env.STRIPE_YEARLY_PRICE_ID,env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,env.SUPABASE_SECRET_KEY].every(Boolean)) return respond({error:'Configuration missing'},503);
  if(!sameSite(request)) return respond({error:'Origin denied'},403);
  let input;
  try { input=await request.json(); } catch {return respond({error:'Invalid JSON'},400);}
  if(!['monthly','yearly'].includes(input?.plan)) return respond({error:'Invalid plan'},400);
  try {
    const user=await verifyUser(request,env);
    if(!user) return respond({error:'Verified login required'},401);
    const stripe=new Stripe(env.STRIPE_SECRET_KEY,{httpClient:Stripe.createFetchHttpClient()});
    const m=await membership(env,user.id);
    if(m?.stripe_subscription_id) {
      const existing=await stripe.subscriptions.retrieve(m.stripe_subscription_id);
      if(blocking.has(existing.status)) return respond({error:'Existing subscription: use Billing'},409);
    }
    let [state]=await rpc(env,'nf_checkout_begin',{p_user_id:user.id,p_plan:input.plan});
    if(!state?.operation_id) throw new Error('Reservation unavailable');
    if(state.checkout_state==='open') {
      if(!state.session_id) throw new Error('Open session missing');
      const session=await stripe.checkout.sessions.retrieve(state.session_id);
      if(session.status==='open') {
        if(state.reserved_plan!==input.plan) return respond({error:'Finish or cancel your existing Checkout first'},409);
        return session.url?respond({url:session.url}):respond({error:'Session URL unavailable'},503);
      }
      if(session.status==='complete') return respond({error:'Payment is being reconciled; please check your account'},409);
      if(session.status!=='expired') throw new Error('Unknown Checkout status');
      // Reconcile Stripe subscriptions before clearing a terminal session.
      if(state.customer_id && !(await checkSubscriptions(stripe,state.customer_id))) return respond({error:'Existing subscription: use Billing'},409);
      const cleared=await rpc(env,'nf_checkout_clear_terminal',{p_user_id:user.id,p_operation_id:state.operation_id,p_session_id:state.session_id});
      if(!cleared) return respond({error:'Checkout changed; retry'},409);
      [state]=await rpc(env,'nf_checkout_begin',{p_user_id:user.id,p_plan:input.plan});
    }
    if(state.reserved_plan!==input.plan) return respond({error:'An existing Checkout attempt uses a different plan'},409);
    const age=Date.now()-Date.parse(state.operation_started_at);
    if(!Number.isFinite(age)||age<0) throw new Error('Invalid reservation timestamp');
    if(age>20*60*60*1000) {
      // Never reuse an old idempotency key. Reconcile the customer first.
      let recoveryCustomer=m?.stripe_customer_id??state.customer_id;
      if(!recoveryCustomer) {
        const found=await stripe.customers.search({query:`metadata['supabase_user_id']:'${user.id}'`,limit:10});
        // If no customer is discoverable, fail closed: an orphan might exist.
        if(found.has_more||found.data.length!==1)
          return respond({error:'Checkout recovery requires support'},409);
        recoveryCustomer=found.data[0].id;
      }
      await checkCustomer(stripe,recoveryCustomer,user.id);
      if(!(await checkSubscriptions(stripe,recoveryCustomer)))
        return respond({error:'Existing subscription: use Billing'},409);
      const sessions=await stripe.checkout.sessions.list({customer:recoveryCustomer,limit:100});
      if(sessions.has_more||sessions.data.some(s=>s.status!=='expired'))
        return respond({error:'Checkout recovery requires support'},409);
      const reset=await rpc(env,'nf_checkout_reset_stale',{
        p_user_id:user.id,p_operation_id:state.operation_id,p_customer_id:recoveryCustomer
      });
      if(!reset) return respond({error:'Checkout changed; retry'},409);
      [state]=await rpc(env,'nf_checkout_begin',{p_user_id:user.id,p_plan:input.plan});
      if(!state?.operation_id||state.reserved_plan!==input.plan)
        return respond({error:'Checkout recovery changed; retry'},409);
    }
    let customerId=m?.stripe_customer_id??state.customer_id;
    if(m?.stripe_customer_id&&state.customer_id&&m.stripe_customer_id!==state.customer_id) throw new Error('Customer mismatch');
    if(customerId) await checkCustomer(stripe,customerId,user.id);
    else {
      // Search is a recovery aid, not a concurrency lock; the DB reservation is the lock.
      const matches=await stripe.customers.search({query:`metadata['supabase_user_id']:'${user.id}'`,limit:10});
      if(matches.has_more||matches.data.length>1) return respond({error:'Customer recovery requires support'},409);
      if(matches.data.length) customerId=matches.data[0].id;
      else {
        const customer=await stripe.customers.create({email:user.email,metadata:{supabase_user_id:user.id}},
          {idempotencyKey:`nf-customer-${state.operation_id}`});
        customerId=customer.id;
      }
      await checkCustomer(stripe,customerId,user.id);
    }
    const bound=await rpc(env,'nf_checkout_bind_customer',{p_user_id:user.id,p_operation_id:state.operation_id,p_customer_id:customerId});
    if(!bound) return respond({error:'Checkout changed; retry'},409);
    if(!(await checkSubscriptions(stripe,customerId))) return respond({error:'Existing subscription: use Billing'},409);
    const price=input.plan==='monthly'?env.STRIPE_MONTHLY_PRICE_ID:env.STRIPE_YEARLY_PRICE_ID;
    const session=await stripe.checkout.sessions.create({
      mode:'subscription',customer:customerId,client_reference_id:user.id,
      line_items:[{price,quantity:1}],
      metadata:{supabase_user_id:user.id,neurofusion_plan:input.plan},
      subscription_data:{metadata:{supabase_user_id:user.id,neurofusion_plan:input.plan}},
      success_url:'https://www.neurofusiondaily.com/living.html?checkout=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:'https://www.neurofusiondaily.com/living.html?checkout=cancelled'
    },{idempotencyKey:`nf-checkout-${state.operation_id}`});
    if(!session.url||!session.expires_at) throw new Error('Stripe session incomplete');
    const saved=await rpc(env,'nf_checkout_record',{p_user_id:user.id,p_operation_id:state.operation_id,p_customer_id:customerId,p_session_id:session.id,p_expires_at:new Date(session.expires_at*1000).toISOString()});
    if(!saved) throw new Error('Reservation changed after session creation');
    return respond({url:session.url});
  } catch(error) {
    console.error('Checkout failure',error.message);
    return respond({error:'Checkout temporarily unavailable'},503);
  }
}
export function onRequestGet(){return respond({error:'Method not allowed'},405);}
