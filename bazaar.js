function titleFromProductId(id) {
  return id
    .replace(/^SHARD_/, "")
    .toLowerCase()
    .split("_")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function firstPrice(summary) {
  return Array.isArray(summary) && summary.length
    ? Number(summary[0].pricePerUnit) || 0
    : 0;
}
function normalizeProducts(products) {
  return Object.entries(products)
    .filter(([id]) => id.startsWith("SHARD_"))
    .map(([id, product]) => {
      const instantBuy = firstPrice(product.sell_summary);
      const instantSell = firstPrice(product.buy_summary);
      const spreadCoins = instantBuy - instantSell;
      const spreadPercent = instantSell > 0 ? (spreadCoins / instantSell) * 100 : 0;

      return {
        id,
        name: titleFromProductId(id),
        instantBuy,
        instantSell,
        spreadCoins,
        spreadPercent,
        buyVolume: Number(product.quick_status?.buyVolume) || 0,
        sellVolume: Number(product.quick_status?.sellVolume) || 0,
        buyOrders: Number(product.quick_status?.buyOrders) || 0,
        sellOrders: Number(product.quick_status?.sellOrders) || 0
      };
    });
}