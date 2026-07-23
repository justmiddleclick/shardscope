const HYPIXEL_BAZAAR_URL =
  "https://api.hypixel.net/v2/skyblock/bazaar";

const CACHE_DURATION = 10 * 60 * 1000;

let cachedData = null;
let cachedAt = 0;

export async function onRequestGet() {
  try {
    const currentTime = Date.now();
    const cacheAge = currentTime - cachedAt;

    if (cachedData && cacheAge < CACHE_DURATION) {
      return Response.json(cachedData, {
        headers: {
          "Cache-Control":
            "public, max-age=0, s-maxage=600, stale-while-revalidate=60",
          "X-ShardScope-Cache": "HIT"
        }
      });
    }

    const response = await fetch(HYPIXEL_BAZAAR_URL, {
      headers: {
        Accept: "application/json"
      }
    });

    const contentType =
      response.headers.get("content-type") || "";

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          cause: `Hypixel returned status ${response.status}`
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    if (!contentType.includes("application/json")) {
      return Response.json(
        {
          success: false,
          cause: "Hypixel did not return JSON."
        },
        {
          status: 502,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const data = await response.json();

    cachedData = data;
    cachedAt = currentTime;

    return Response.json(data, {
      headers: {
        "Cache-Control":
          "public, max-age=0, s-maxage=600, stale-while-revalidate=60",
        "X-ShardScope-Cache": "MISS"
      }
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        cause: "Unable to reach the Hypixel Bazaar API.",
        detail:
          error instanceof Error
            ? error.message
            : String(error)
      },
      {
        status: 502,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}