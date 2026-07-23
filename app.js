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
  huntingShards: document.querySelector("#huntingShards"),
  shardDetailsSection: document.querySelector("#shardDetailsSection")
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

  if (!query) {
    return [];
  }

  return state.shards
    .filter(shard => {
      const matchesSearch =
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
  els.empty.textContent = els.search.value.trim()
  ? "No shards match your search."
  : "Start typing a shard name to view its Bazaar information.";

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
  if (
    !els.huntingShards ||
    !els.shardDetailsSection ||
    !Array.isArray(shardData)
  ) {
    return;
  }

  const searchTerm = els.search.value.trim().toLowerCase();

  if (!searchTerm) {
    els.huntingShards.innerHTML = "";
    els.shardDetailsSection.hidden = true;
    return;
  }

  const matchingShards = shardData.filter(shard =>
    shard.name.toLowerCase().includes(searchTerm)
  );

  els.huntingShards.innerHTML = matchingShards
    .map(shard => {
      const product = state.shards.find(
        bazaarShard => bazaarShard.id === shard.bazaarId
      );

      const taxRate = Number(els.tax.value) / 100;

      const spreadCoins = product
        ? product.instantBuy - product.instantSell
        : null;

      const spreadPercent =
        product && product.instantBuy > 0
          ? (spreadCoins / product.instantBuy) * 100
          : null;

      const afterTaxSpread = product
        ? product.instantBuy * (1 - taxRate) - product.instantSell
        : null;

      const spreadClass =
        spreadCoins !== null && spreadCoins > 0
          ? "positive"
          : "negative";

      const afterTaxClass =
        afterTaxSpread !== null && afterTaxSpread > 0
          ? "positive"
          : "negative";

      const bazaarHtml = product
        ? `
          <section class="detail-section">
            <h4>Bazaar</h4>

            <div class="bazaar-detail-grid">
              <div class="bazaar-detail">
                <span>Instant Buy</span>
                <strong>${formatCoins(product.instantBuy)}</strong>
              </div>

              <div class="bazaar-detail">
                <span>Instant Sell</span>
                <strong>${formatCoins(product.instantSell)}</strong>
              </div>

              <div class="bazaar-detail">
                <span>Spread</span>
                <strong class="${spreadClass}">
                  ${formatCoins(spreadCoins)}
                  ${
                    spreadPercent !== null
                      ? `(${spreadPercent.toFixed(2)}%)`
                      : ""
                  }
                </strong>
              </div>

              <div class="bazaar-detail">
                <span>After-Tax Spread</span>
                <strong class="${afterTaxClass}">
                  ${formatCoins(afterTaxSpread)}
                </strong>
              </div>

              <div class="bazaar-detail">
                <span>Buy Volume</span>
                <strong>${integer.format(product.buyVolume)}</strong>
              </div>

              <div class="bazaar-detail">
                <span>Sell Volume</span>
                <strong>${integer.format(product.sellVolume)}</strong>
              </div>
            </div>
          </section>
        `
        : `
          <section class="detail-section">
            <h4>Bazaar</h4>
            <p>Price information is unavailable.</p>
          </section>
        `;

      const huntingHtml = shard.hunting.huntable
        ? `
          <section class="detail-section">
            <h4>Hunting</h4>

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
          </section>
        `
        : `
          <section class="detail-section">
            <h4>Hunting</h4>
            <p>Cannot be hunted directly.</p>
          </section>
        `;

      const usedInHtml = `
        <section class="detail-section">
          <h4>Used in Fusions</h4>

          <ul>
            ${
              shard.fusion.usedIn.length
                ? shard.fusion.usedIn
                    .map(
                      id =>
                        `<li>${escapeHtml(titleFromProductId(id))}</li>`
                    )
                    .join("")
                : "<li>None yet</li>"
            }
          </ul>
        </section>
      `;

      const recipeHtml = shard.fusion.canBeCreatedByFusion
        ? `
          <section class="detail-section fusion-recipe">
            <h4>Fusion Recipe</h4>

            <ul>
              ${shard.fusion.ingredients
                .map(
                  ingredient => `
                    <li>
                      ${integer.format(ingredient.amount)} ×
                      ${escapeHtml(ingredient.requirement)}
                    </li>
                  `
                )
                .join("")}
            </ul>

            <p>
              <strong>Produces:</strong>
              ${integer.format(shard.fusion.outputAmount)} ×
              ${escapeHtml(shard.name)}
            </p>
          </section>
        `
        : "";

      return `
        <article class="hunting-shard">
          <h3>${escapeHtml(shard.name)}</h3>

          ${bazaarHtml}
          ${huntingHtml}
          ${usedInHtml}
          ${recipeHtml}
        </article>
      `;
    })
    .join("");

  els.shardDetailsSection.hidden = matchingShards.length === 0;
}

loadData();