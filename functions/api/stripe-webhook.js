import Stripe from 'stripe';

const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
}});
const supported=new Set(['checkout.session.completed','customer.subscription.created',
  'customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed']);
const supa=env=>env.SUPABASE_URL.replace(/\/$/,'');
async function rpc(env,name,args){
  const r=await fetch(`${supa(env)}/rest/v1/rpc/${name}`,{method:'POST',headers:{
    apikey:env.SUPABASE_SECRET_KEY,Authorization:`Bearer ${env.SUPABASE_SECRET_KEY}`,
    'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!r.ok) throw new Error(`Database ${name} error ${r.status}: ${(await r.text()).slice(0,300)}`);
  return r.json();
}
function idOf(v){return typeof v==='string'?v:v?.id??null;}
function subscriptionFromInvoice(invoice){
  return idOf(invoice.subscription) || idOf(invoice.parent?.subscription_details?.subscription) || null;
}
function periodEnd(sub){
  // Stripe API versions may put billing period on the subscription item.
  const ends=[sub.current_period_end,...(sub.items?.data||[]).map(i=>i.current_period_end)]
    .filter(n=>typeof n==='number' && Number.isFinite(n));
  return ends.length?new Date(Math.max(...ends)*1000).toISOString():null;
}
function validUuid(s){return typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);}
export async function onRequestPost({request,env}){
  if(![env.STRIPE_SECRET_KEY,env.STRIPE_WEBHOOK_SECRET,env.SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,env.STRIPE_MONTHLY_PRICE_ID,env.STRIPE_YEARLY_PRICE_ID].every(Boolean))
    return reply({error:'Server configuration missing'},503);
  const signature=request.headers.get('stripe-signature');
  if(!signature) return reply({error:'Missing Stripe signature'},400);
  const stripe=new Stripe(env.STRIPE_SECRET_KEY,{httpClient:Stripe.createFetchHttpClient()});
  let event;
  try {
    event=await stripe.webhooks.constructEventAsync(await request.text(),signature,env.STRIPE_WEBHOOK_SECRET);
  } catch(e){console.error('Stripe signature invalid',e.message);return reply({error:'Invalid signature'},400);}
  if(!supported.has(event.type)) return reply({received:true});
  try {
    let subId=null;
    if(event.type==='checkout.session.completed'){
      const session=event.data.object;
      if(session.mode!=='subscription'){
        await rpc(env,'nf_record_stripe_event',{p_event_id:event.id,p_event_type:event.type});
        return reply({received:true});
      }
      subId=idOf(session.subscription);
    } else if(event.type.startsWith('customer.subscription.')) {
      subId=event.data.object.id;
    } else {
      subId=subscriptionFromInvoice(event.data.object);
      if(!subId && event.data.object.id){
        const invoice=await stripe.invoices.retrieve(event.data.object.id);
        subId=subscriptionFromInvoice(invoice);
      }
    }
    if(!subId){
      // A completed subscription Checkout must not be silently acknowledged.
      if(event.type==='checkout.session.completed' && event.data.object.mode==='subscription')
        throw new Error('Subscription Checkout event missing subscription ID');
      // Invoice events for subscriptions must not be silently discarded.
      // Stripe may deliver them before related objects are fully retrievable.
      if (event.type.startsWith('invoice.') &&
          (event.data.object.billing_reason?.startsWith('subscription') ||
           event.data.object.parent?.type === 'subscription_details')) {
        throw new Error('Subscription invoice missing subscription reference');
      }
      await rpc(env,'nf_record_stripe_event',{p_event_id:event.id,p_event_type:event.type});
      return reply({received:true,ignored:'no subscription'});
    }
    // Always reconcile the latest Stripe state, never the potentially old event snapshot.
    const sub=await stripe.subscriptions.retrieve(subId,{expand:['items.data.price']});
    const customerId=idOf(sub.customer);
    const customer=await stripe.customers.retrieve(customerId);
    const userId=sub.metadata?.supabase_user_id;
    const approved=new Set([env.STRIPE_MONTHLY_PRICE_ID,env.STRIPE_YEARLY_PRICE_ID]);
    const prices=sub.items?.data?.map(item=>idOf(item.price)) || [];
    // Old Podia subscriptions and unrelated products must never grant Living access.
    if(customer.deleted || !validUuid(userId) || customer.metadata?.supabase_user_id!==userId ||
       prices.length!==1 || !approved.has(prices[0])){
      await rpc(env,'nf_record_stripe_event',{p_event_id:event.id,p_event_type:event.type});
      return reply({received:true,ignored:'unrelated subscription'});
    }
    const result=await rpc(env,'nf_apply_stripe_event',{
      p_event_id:event.id,p_event_type:event.type,p_user_id:userId,
      p_customer_id:customerId,p_subscription_id:sub.id,
      p_status:sub.status,p_period_end:periodEnd(sub)
    });
    return reply({received:true,result});
  } catch(e){
    // Non-2xx means Stripe retries. Never acknowledge a failed database update.
    console.error('Stripe webhook processing failed',event.id,event.type,e.message);
    return reply({error:'Webhook processing failed'},500);
  }
}
export function onRequestGet(){return reply({error:'Method not allowed'},405);}
