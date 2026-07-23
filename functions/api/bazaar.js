const HYPIXEL_BAZAAR_URL = "https://api.hypixel.net/v2/skyblock/bazaar";

export async function onRequestGet() {
  try {
    const response = await fetch(HYPIXEL_BAZAAR_URL, {
      headers: {
        "User-Agent": "ShardScope/1.0 (Hypixel SkyBlock Bazaar viewer)"
      },
      cf: {
        cacheTtl: 20,
        cacheEverything: true
      }
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
        "cache-control": "public, max-age=20",
        "access-control-allow-origin": "*"
      }
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        cause: "Unable to reach the Hypixel Bazaar API.",
        detail: error instanceof Error ? error.message : String(error)
      },
      { status: 502 }
    );
  }
}
