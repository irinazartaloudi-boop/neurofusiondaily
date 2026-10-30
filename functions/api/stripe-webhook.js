
import Stripe from "stripe";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });

export async function onRequestPost({ request, env }) {
  const stripeKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = env.SUPABASE_URL;
 const serviceKey = env.SUPABASE_SECRET_KEY;

  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return json({ error: "Server configuration missing" }, 503);
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing Stripe signature" }, 400);
  }

  let event;

  try {
    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient()
    });

    const rawBody = await request.text();

    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret
    );

    const supportedEvents = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed"
    ];

    if (!supportedEvents.includes(event.type)) {
      return json({ received: true });
    }

    /*
      IMPORTANT:
      We do not update membership records until we have
      securely associated the Stripe customer with a
      Supabase user.

      This prevents accidentally granting membership
      access to the wrong account.
    */

    return json({
      received: true,
      eventType: event.type
    });

  } catch (error) {
    console.error("Stripe webhook error:", error.message);

    return json(
      { error: "Webhook processing failed" },
      400
    );
  }
}

export async function onRequestGet() {
  return json({ error: "Method not allowed" }, 405);
}
