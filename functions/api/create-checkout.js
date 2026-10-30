
import Stripe from "stripe";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

const ACTIVE_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "paused"
]);

export async function onRequestPost({ request, env }) {
  try {
    const {
      STRIPE_SECRET_KEY,
      STRIPE_MONTHLY_PRICE_ID,
      STRIPE_YEARLY_PRICE_ID,
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      SUPABASE_SECRET_KEY
    } = env;

    if (
      !STRIPE_SECRET_KEY ||
      !STRIPE_MONTHLY_PRICE_ID ||
      !STRIPE_YEARLY_PRICE_ID ||
      !SUPABASE_URL ||
      !SUPABASE_PUBLISHABLE_KEY ||
      !SUPABASE_SECRET_KEY
    ) {
      return json({ error: "Server configuration missing" }, 503);
    }

    const siteUrl = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (!origin || origin !== siteUrl.origin) {
      return json({ error: "Origin not allowed" }, 403);
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return json({ error: "Authentication required" }, 401);
    }

    const baseSupabaseUrl = SUPABASE_URL.replace(/\/$/, "");

    const authResponse = await fetch(
      `${baseSupabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!authResponse.ok) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    const user = await authResponse.json();

    if (!user.id || !user.email || !user.email_confirmed_at) {
      return json({ error: "Verified account required" }, 403);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }

    const prices = {
      monthly: STRIPE_MONTHLY_PRICE_ID,
      yearly: STRIPE_YEARLY_PRICE_ID
    };

    const plan = body?.plan;

    if (!Object.prototype.hasOwnProperty.call(prices, plan)) {
      return json({ error: "Invalid subscription plan" }, 400);
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient()
    });

    const adminHeaders = {
      apikey: SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      Accept: "application/json"
    };

    // Only the server may read the membership/customer association.
    const membershipResponse = await fetch(
      `${baseSupabaseUrl}/rest/v1/nf_memberships` +
      `?user_id=eq.${encodeURIComponent(user.id)}` +
      `&select=user_id,stripe_customer_id,stripe_subscription_id`,
      { headers: adminHeaders }
    );

    if (!membershipResponse.ok) {
      throw new Error("Membership lookup failed");
    }

    const memberships = await membershipResponse.json();
    const membership = memberships[0] ?? null;

    let customerId = membership?.stripe_customer_id ?? null;

    if (customerId) {
      const customer = await stripe.customers.retrieve(customerId);

      if (
        customer.deleted ||
        customer.metadata?.supabase_user_id !== user.id
      ) {
        return json(
          { error: "Customer association requires support" },
          409
        );
      }
    } else {
      // Recover an existing customer linked to this verified user.
      // Never identify ownership using email alone.
      const matches = await stripe.customers.search({
        query: `metadata['supabase_user_id']:'${user.id}'`,
        limit: 10
      });

      if (matches.has_more || matches.data.length > 1) {
        return json(
          { error: "Customer association requires support" },
          409
        );
      }

      if (matches.data.length === 1) {
        customerId = matches.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            supabase_user_id: user.id
          }
        });

        customerId = customer.id;
      }
    }

    // Do not create another subscription while an existing
    // subscription still needs billing or account management.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100
    });

    if (
      subscriptions.has_more ||
      subscriptions.data.some(subscription =>
        ACTIVE_STATUSES.has(subscription.status)
      )
    ) {
      return json(
        {
          error:
            "An existing subscription requires account management"
        },
        409
      );
    }

    // Save the verified customer association before Checkout.
    // The database uniqueness constraints protect ownership.
    const saveResponse = await fetch(
      `${baseSupabaseUrl}/rest/v1/nf_memberships` +
      "?on_conflict=user_id",
      {
        method: "POST",
        headers: {
          ...adminHeaders,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates"
        },
        body: JSON.stringify({
          user_id: user.id,
          stripe_customer_id: customerId
        })
      }
    );

    if (!saveResponse.ok) {
      throw new Error("Customer association could not be saved");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [
        {
          price: prices[plan],
          quantity: 1
        }
      ],
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          neurofusion_plan: plan
        }
      },
      metadata: {
        supabase_user_id: user.id,
        neurofusion_plan: plan
      },
      success_url:
        `${siteUrl.origin}/living.html?checkout=success` +
        "&session_id={CHECKOUT_SESSION_ID}",
      cancel_url:
        `${siteUrl.origin}/living.html?checkout=cancelled`
    });

    if (!session.url) {
      throw new Error("Stripe did not return a Checkout URL");
    }

    return json({ url: session.url });
  } catch (error) {
    console.error("Checkout creation failed:", error.message);

    return json(
      { error: "Unable to create checkout session" },
      500
    );
  }
}

export async function onRequestGet() {
  return json({ error: "Method not allowed" }, 405);
}
