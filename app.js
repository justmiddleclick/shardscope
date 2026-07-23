const state = {
  shards: [],
  lastUpdated: null
};

const els = {
  status: document.querySelector("#status"),
  updated: document.querySelector("#updated"),
  search: document.querySelector("#search"),
  sort: document.querySelector("#sort"),
  minVolume: document.querySelector("#minVolume"),
  tax: document.querySelector("#tax"),
  refresh: document.querySelector("#refresh"),
  tracked: document.querySelector("#tracked"),
  highestSell: document.querySelector("#highestSell"),
  bestSpread: document.querySelector("#bestSpread"),
  resultCount: document.querySelector("#resultCount"),
  rows: document.querySelector("#rows"),
  empty: document.querySelector("#empty"),
  huntingShards: document.querySelector("#huntingShards")
};

const money = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2
});

const integer = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0
});

function formatCoins(value) {
  if (!Number.isFinite(value)) return "—";
  return `${money.format(value)} coins`;
}

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

async function loadData() {
  els.refresh.disabled = true;
  els.status.className = "status";
  els.status.textContent = "Loading Bazaar data…";

  try {
    const response = await fetch(
  "https://api.hypixel.net/v2/skyblock/bazaar",
  { cache: "no-store" }
);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Request failed (${response.status}): ${detail.slice(0, 120)}`);
    }

    const payload = await response.json();
    if (!payload.success || !payload.products) {
      throw new Error(payload.cause || "Hypixel returned an invalid response.");
    }

    state.shards = normalizeProducts(payload.products);
    state.lastUpdated = Number(payload.lastUpdated) || Date.now();

    els.status.className = "status success";
    els.status.textContent = "Live Bazaar data loaded";
    els.updated.textContent = `Updated ${new Date(state.lastUpdated).toLocaleString()}`;

    render();
  } catch (error) {
    console.error(error);
    els.status.className = "status error";
    els.status.textContent = "Could not load prices";
    els.updated.textContent = error.message;
    els.rows.innerHTML = "";
    els.empty.classList.remove("hidden");
    els.empty.textContent = "The Bazaar feed is unavailable right now. Try refreshing in a moment.";
  } finally {
    els.refresh.disabled = false;
  }
}

function filteredShards() {
  const query = els.search.value.trim().toLowerCase();
  const minVolume = Math.max(0, Number(els.minVolume.value) || 0);
  const sortKey = els.sort.value;

  return state.shards
    .filter(shard => {
      const matchesSearch = !query ||
        shard.name.toLowerCase().includes(query) ||
        shard.id.toLowerCase().includes(query);
      const totalVolume = shard.buyVolume + shard.sellVolume;
      return matchesSearch && totalVolume >= minVolume;
    })
    .sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
}

function render() {
  const taxRate = Math.max(0, Number(els.tax.value) || 0) / 100;
  const shards = filteredShards();

  els.tracked.textContent = integer.format(state.shards.length);

  const highestSell = [...state.shards].sort((a, b) => b.instantSell - a.instantSell)[0];
  els.highestSell.textContent = highestSell
    ? `${highestSell.name} · ${formatCoins(highestSell.instantSell)}`
    : "—";

  const spreads = state.shards.map(shard => ({
    ...shard,
    afterTaxSpread: shard.instantBuy * (1 - taxRate) - shard.instantSell
  })).sort((a, b) => b.afterTaxSpread - a.afterTaxSpread);

  els.bestSpread.textContent = spreads[0]
    ? `${spreads[0].name} · ${formatCoins(spreads[0].afterTaxSpread)}`
    : "—";

  els.resultCount.textContent = `${integer.format(shards.length)} results`;
  els.empty.classList.toggle("hidden", shards.length > 0);

  els.rows.innerHTML = shards.map(shard => {
    const afterTaxSpread = shard.instantBuy * (1 - taxRate) - shard.instantSell;
    const spreadClass = afterTaxSpread >= 0 ? "positive" : "negative";

    return `
      <tr>
        <td>
          <span class="shard-name">${escapeHtml(shard.name)}</span>
          <span class="product-id">${escapeHtml(shard.id)}</span>
        </td>
        <td>${formatCoins(shard.instantBuy)}</td>
        <td>${formatCoins(shard.instantSell)}</td>
        <td>${formatCoins(shard.spreadCoins)} (${shard.spreadPercent.toFixed(2)}%)</td>
        <td class="${spreadClass}">${formatCoins(afterTaxSpread)}</td>
        <td>${integer.format(shard.buyVolume)}</td>
        <td>${integer.format(shard.sellVolume)}</td>
      </tr>`;
  }).join("");
    renderHuntingShards();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

["input", "change"].forEach(eventName => {
  els.search.addEventListener(eventName, render);
  els.minVolume.addEventListener(eventName, render);
  els.tax.addEventListener(eventName, render);
  els.sort.addEventListener(eventName, render);
});

els.refresh.addEventListener("click", loadData);
function renderHuntingShards() {
  if (!els.huntingShards || !Array.isArray(shardData)) {
    return;
  }

  els.huntingShards.innerHTML = shardData
    .filter(shard => shard.hunting?.huntable)
    .map(shard => {
      const product = state.shards.find(
        bazaarShard => bazaarShard.id === shard.bazaarId
      );

      const currentValue = product
        ? formatCoins(product.instantSell)
        : "Price unavailable";

      return `
  <article class="hunting-shard">
    <h3>${escapeHtml(shard.name)}</h3>

    <p>
      <strong>Current Bazaar value:</strong>
      ${currentValue}
    </p>

    <p>
      <strong>Location:</strong>
      <span class="badge badge-location">
        ${escapeHtml(shard.hunting.location)}
      </span>
    </p>

    <p>
      <strong>Method:</strong>
      ${escapeHtml(shard.hunting.method)}
    </p>

    <p>
      <strong>Tool:</strong>
      <span class="badge badge-tool">
        ${escapeHtml(shard.hunting.tool)}
      </span>
    </p>

    <p>
      <strong>Difficulty:</strong>
      <span class="badge badge-${shard.hunting.difficulty.toLowerCase()}">
        ${escapeHtml(shard.hunting.difficulty)}
      </span>
    </p>
  </article>
      `;
    })
    .join("");
}
loadData();
