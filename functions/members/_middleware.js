import Stripe from 'stripe';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
});
const redirect = location => new Response(null, {
  status: 302,
  headers: { Location: location, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
});
const protectedResponse = response => {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
function readCookie(header, name) {
  const entry = header.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : null;
}

export async function onRequest(context) {
  const { request, env } = context;
  const rawToken = readCookie(request.headers.get('Cookie') || '', 'nf_member_access');
  if (!rawToken) return redirect('/member-login.html');

  let token;
  try { token = decodeURIComponent(rawToken); }
  catch { return redirect('/member-login.html'); }

  if (![env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_SECRET_KEY,
        env.STRIPE_SECRET_KEY, env.STRIPE_MONTHLY_PRICE_ID, env.STRIPE_YEARLY_PRICE_ID].every(Boolean)) {
    return json({ error: 'Membership service unavailable' }, 503);
  }

  try {
    const root = env.SUPABASE_URL.replace(/\/$/, '');
    const authResponse = await fetch(`${root}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!authResponse.ok) return redirect('/member-login.html');
    const user = await authResponse.json();
    if (!user.id || !user.email_confirmed_at) return redirect('/member-login.html');

    // Owner preview access is limited to this exact verified Supabase user ID.
    if (env.NF_OWNER_USER_ID && user.id === env.NF_OWNER_USER_ID) {
      return protectedResponse(await context.next());
    }

    // Modern Supabase sb_secret_* keys are API keys, not JWTs. Never send one
    // as Authorization: Bearer; the gateway grants service-role access via apikey.
    const membershipsResponse = await fetch(
      `${root}/rest/v1/nf_memberships?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,stripe_subscription_id`,
      { headers: { apikey: env.SUPABASE_SECRET_KEY, Accept: 'application/json' }, cache: 'no-store' }
    );
    if (!membershipsResponse.ok) {
      console.error('Protected page membership query failed', membershipsResponse.status);
      return json({ error: 'Membership verification unavailable' }, 503);
    }
    const records = await membershipsResponse.json();
    if (!Array.isArray(records)) throw new Error('Unexpected membership response');
    const record = records[0];
    if (!record?.stripe_customer_id || !record?.stripe_subscription_id) {
      return redirect('/living.html?membership=required');
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
    const [customer, subscription] = await Promise.all([
      stripe.customers.retrieve(record.stripe_customer_id),
      stripe.subscriptions.retrieve(record.stripe_subscription_id)
    ]);
    const priceIds = subscription.items.data.map(item => item.price.id);
    const entitled = !customer.deleted &&
      customer.metadata?.supabase_user_id === user.id &&
      subscription.metadata?.supabase_user_id === user.id &&
      subscription.customer === record.stripe_customer_id &&
      priceIds.length === 1 &&
      [env.STRIPE_MONTHLY_PRICE_ID, env.STRIPE_YEARLY_PRICE_ID].includes(priceIds[0]) &&
      ['active', 'trialing'].includes(subscription.status);
    if (!entitled) return redirect('/living.html?membership=required');

    return protectedResponse(await context.next());
  } catch (error) {
    console.error('Protected page error:', error?.message || 'Unknown error');
    return json({ error: 'Membership verification unavailable' }, 503);
  }
}
