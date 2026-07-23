const HYPIXEL_BAZAAR_URL =
  "https://api.hypixel.net/v2/skyblock/bazaar";

export async function onRequestGet() {
  try {
    const response = await fetch(HYPIXEL_BAZAAR_URL, {
      headers: {
        Accept: "application/json"
      }
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          cause: `Hypixel returned status ${response.status}`
        },
        { status: 502 }
      );
    }

    if (!contentType.includes("application/json")) {
      return Response.json(
        {
          success: false,
          cause: "Hypixel did not return JSON."
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    return Response.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60"
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
      { status: 502 }
    );
  }
}