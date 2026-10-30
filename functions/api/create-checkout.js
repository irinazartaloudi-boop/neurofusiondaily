
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

export async function onRequestPost({ request, env }) {
  try {
    const {
      STRIPE_SECRET_KEY,
      STRIPE_MONTHLY_PRICE_ID,
      STRIPE_YEARLY_PRICE_ID,
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    } = env;

    if (
      !STRIPE_SECRET_KEY ||
      !STRIPE_MONTHLY_PRICE_ID ||
      !STRIPE_YEARLY_PRICE_ID ||
      !SUPABASE_URL ||
      !SUPABASE_PUBLISHABLE_KEY
    ) {
      return json({ error: "Server configuration missing" }, 503);
    }

    // Checkout must only be requested from our own website.
    const siteUrl = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (!origin || origin !== siteUrl.origin) {
      return json({ error: "Origin not allowed" }, 403);
    }

    // Require a real Supabase access token.
    const authorization = request.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Authentication required" }, 401);
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return json({ error: "Authentication required" }, 401);
    }

    // Verify the token with Supabase, not with browser-supplied IDs.
    const authResponse = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`,
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

    // Accept only the two plans configured by us.
    let body;

    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }

    const plan = body?.plan;

    const prices = {
      monthly: STRIPE_MONTHLY_PRICE_ID,
      yearly: STRIPE_YEARLY_PRICE_ID
    };

    if (
      !Object.prototype.hasOwnProperty.call(prices, plan)
    ) {
      return json({ error: "Invalid subscription plan" }, 400);
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      httpClient: Stripe.createFetchHttpClient()
    });

    // A Stripe customer is explicitly linked to the verified user.
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        supabase_user_id: user.id
      }
    });

    // All return URLs are fixed by the server.
    const baseUrl = siteUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
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
        `${baseUrl}/living.html?checkout=success` +
        `&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/living.html?checkout=cancelled`
    });

    if (!session.url) {
      return json({ error: "Checkout unavailable" }, 502);
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
