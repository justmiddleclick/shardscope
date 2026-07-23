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

## Free deployment on Cloudflare Pages

1. Create a GitHub repository.
2. Upload every file and folder in this project.
3. Sign in to Cloudflare.
4. Go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
5. Select your GitHub repository.
6. Use these build settings:
   - Framework preset: `None`
   - Build command: leave blank
   - Build output directory: `/`
7. Deploy.

Your website will receive a free `pages.dev` address.

## Local testing

Because the project uses a Cloudflare Pages Function, the best local test method is Wrangler:

```bash
npm install -g wrangler
wrangler pages dev .
```

Then open the local address Wrangler prints.

Opening `index.html` directly will display the page, but the live `/api/bazaar` endpoint will not work without the Pages Function runtime.

## Notes about the Bazaar fields

Hypixel's naming is from the order-book perspective:

- `sell_summary[0]` = the cheapest sell offer, which a player pays when instant-buying
- `buy_summary[0]` = the highest buy order, which a player receives when instant-selling

## Future upgrade: fusion profit calculator

This version ranks all currently Bazaar-listed shards and their order-book spreads. A true fusion-profit calculator additionally requires a maintained recipe database containing every fusion input, output, quantity, probability, and unlock requirement.

A future recipe object can use this structure:

```js
{
  name: "Example fusion",
  inputs: [
    { productId: "SHARD_A", quantity: 1 },
    { productId: "SHARD_B", quantity: 1 }
  ],
  outputs: [
    { productId: "SHARD_C", quantity: 1, probability: 1 }
  ]
}
```

## Cost

This project can run for $0 using:

- GitHub free repository
- Cloudflare Pages free hosting
- Cloudflare Pages Functions free allowance
- Free `pages.dev` subdomain

## Disclaimer

Not affiliated with Hypixel. Bazaar prices and product availability can change at any time.
