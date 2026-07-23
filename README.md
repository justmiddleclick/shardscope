# ShardScope

A free, deployable Hypixel SkyBlock shard Bazaar ranking website.

## What it does

- Pulls live Bazaar data from Hypixel
- Automatically finds every Bazaar product whose ID begins with `SHARD_`
- Ranks shards by:
  - instant-buy price
  - instant-sell price
  - coin spread
  - percentage spread
  - buy volume
  - sell volume
- Includes search, minimum-volume filtering, tax adjustment, and responsive mobile styling
- Uses a Cloudflare Pages Function as a small proxy so the browser does not need to call Hypixel directly

## Disclaimer

Not affiliated with Hypixel. Bazaar prices and product availability can change at any time.
