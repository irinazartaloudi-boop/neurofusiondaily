
export async function onRequestGet({ env }) {
  const url = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return Response.json(
      { error: "Authentication configuration unavailable" },
      { status: 503 }
    );
  }

  return Response.json(
    {
      supabaseUrl: url,
      supabasePublishableKey: publishableKey
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
