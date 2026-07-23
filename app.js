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
  "/api/bazaar",
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
/*
  Find one shard from shardData.js using its permanent shard ID.
*/
function getShardById(shardId) {
  return shardData.find(shard => shard.id === shardId) || null;
}

/*
  Find live Bazaar information for one shard.
*/
function getBazaarProductForShard(shard) {
  if (!shard || !shard.bazaarId) {
    return null;
  }

  return (
    state.shards.find(
      bazaarShard => bazaarShard.id === shard.bazaarId
    ) || null
  );
}

/*
  Determine whether a shard has at least one known fusion recipe.
*/
function shardHasFusionRecipes(shard) {
  return Boolean(
    shard &&
      shard.fusion &&
      Array.isArray(shard.fusion.recipes) &&
      shard.fusion.recipes.length
  );
}

/*
  Compare classification values without worrying about capitalization.
*/
function classificationMatches(value, requiredValue) {
  if (!value || !requiredValue) {
    return false;
  }

  return (
    String(value).trim().toLowerCase() ===
    String(requiredValue).trim().toLowerCase()
  );
}

/*
  Return every shard belonging to a particular family.
*/
function getShardsByFamily(family) {
  return shardData.filter(shard =>
    classificationMatches(
      shard.classification && shard.classification.family,
      family
    )
  );
}

/*
  Return every shard with a particular rarity.
*/
function getShardsByRarity(rarity) {
  return shardData.filter(shard =>
    classificationMatches(
      shard.classification && shard.classification.rarity,
      rarity
    )
  );
}

/*
  Create the small Huntable, Fusion, or Unresolved status badges
  displayed beside shards inside the fusion tree.
*/
function renderAcquisitionBadges(shard) {
  const badges = [];

  if (shard.hunting && shard.hunting.huntable) {
    badges.push(
      `<span class="acquisition-badge acquisition-huntable">Huntable</span>`
    );
  }

  if (shardHasFusionRecipes(shard)) {
    badges.push(
      `<span class="acquisition-badge acquisition-fusion">Fusion</span>`
    );
  }

  if (
    (!shard.hunting || !shard.hunting.huntable) &&
    !shardHasFusionRecipes(shard)
  ) {
    badges.push(
      `<span class="acquisition-badge acquisition-unresolved">No known route</span>`
    );
  }

  return badges.join("");
}

/*
  Render a compact Bazaar price box for a shard inside the fusion tree.
*/
function renderTreeBazaarInformation(shard) {
  const product = getBazaarProductForShard(shard);

  if (!product) {
    return `
      <div class="fusion-tree-price unavailable">
        Bazaar information unavailable
      </div>
    `;
  }

  return `
    <div class="fusion-tree-price">
      <span>
        <strong>Instant Buy:</strong>
        ${formatCoins(product.instantBuy)}
      </span>

      <span>
        <strong>Instant Sell:</strong>
        ${formatCoins(product.instantSell)}
      </span>
    </div>
  `;
}

/*
  Render hunting instructions inside an ingredient branch.
*/
function renderTreeHuntingInformation(shard) {
  if (!shard.hunting || !shard.hunting.huntable) {
    return `
      <div class="fusion-tree-hunting not-huntable">
        This shard cannot be hunted directly.
      </div>
    `;
  }

  const location = shard.hunting.location
    ? escapeHtml(shard.hunting.location)
    : "Unknown";

  const method = shard.hunting.method
    ? escapeHtml(shard.hunting.method)
    : "No hunting instructions have been added yet.";

  const tool = shard.hunting.tool
    ? escapeHtml(shard.hunting.tool)
    : "None listed";

  const difficulty = shard.hunting.difficulty
    ? escapeHtml(shard.hunting.difficulty)
    : "Unknown";

  return `
    <div class="fusion-tree-hunting">
      <p>
        <strong>Location:</strong>
        ${location}
      </p>

      <p>
        <strong>Method:</strong>
        ${method}
      </p>

      <p>
        <strong>Tool:</strong>
        ${tool}
      </p>

      <p>
        <strong>Difficulty:</strong>
        ${difficulty}
      </p>
    </div>
  `;
}

/*
  Render one specific shard ingredient.

  This function calls itself indirectly through renderFusionRecipesForTree().
  That is what allows the website to continue through multiple fusion levels.
*/
function renderShardIngredientNode(
  shardId,
  amount,
  currentPath = []
) {
  const ingredientShard = getShardById(shardId);

  if (!ingredientShard) {
    return `
      <div class="fusion-tree-node fusion-tree-missing">
        <div class="fusion-tree-node-heading">
          <strong>
            ${integer.format(amount)} ×
            ${escapeHtml(titleFromProductId(shardId))}
          </strong>

          <span class="acquisition-badge acquisition-unresolved">
            Missing data
          </span>
        </div>

        <p>
          This shard is referenced by a recipe, but it has not been added
          to shardData.js yet.
        </p>
      </div>
    `;
  }

  /*
    Stop the recursion if this shard already appears in the current branch.

    This protects the page if two recipes accidentally point back to
    each other.
  */
  if (currentPath.includes(shardId)) {
    return `
      <div class="fusion-tree-node fusion-tree-cycle">
        <div class="fusion-tree-node-heading">
          <strong>
            ${integer.format(amount)} ×
            ${escapeHtml(ingredientShard.name)}
          </strong>

          <span class="acquisition-badge acquisition-unresolved">
            Fusion loop stopped
          </span>
        </div>

        <p>
          This branch points back to a shard that already appeared above it.
        </p>
      </div>
    `;
  }

  const nextPath = [...currentPath, shardId];
  const hasRecipes = shardHasFusionRecipes(ingredientShard);

  const nestedFusionHtml = hasRecipes
    ? `
      <div class="nested-fusion-section">
        <h6>Ways to obtain this ingredient through fusion</h6>

        ${renderFusionRecipesForTree(
          ingredientShard,
          nextPath
        )}
      </div>
    `
    : "";

  const deadEndHtml =
    !ingredientShard.hunting.huntable && !hasRecipes
      ? `
        <p class="fusion-tree-warning">
          No direct hunting method or fusion recipe has been entered
          for this shard yet.
        </p>
      `
      : "";

  return `
    <details class="fusion-tree-node" open>
      <summary>
        <span class="fusion-tree-summary-name">
          ${integer.format(amount)} ×
          ${escapeHtml(ingredientShard.name)}
        </span>

        <span class="fusion-tree-summary-badges">
          ${renderAcquisitionBadges(ingredientShard)}
        </span>
      </summary>

      <div class="fusion-tree-node-content">
        ${renderTreeBazaarInformation(ingredientShard)}
        ${renderTreeHuntingInformation(ingredientShard)}
        ${nestedFusionHtml}
        ${deadEndHtml}
      </div>
    </details>
  `;
}

/*
  Render an ingredient that represents a category or family.

  Every ID in ingredient.options is shown as a separate possible route.
*/
function renderGroupIngredientNode(
  ingredient,
  currentPath
) {
  const options = Array.isArray(ingredient.options)
    ? ingredient.options
    : [];

  const optionHtml = options.length
    ? options
        .map(optionShardId =>
          renderShardIngredientNode(
            optionShardId,
            ingredient.amount,
            currentPath
          )
        )
        .join("")
    : `
      <div class="fusion-group-empty">
        <p>
          No eligible shards have been entered for this category yet.
        </p>

        <p>
          Add their shard IDs to this ingredient's
          <code>options</code> array in shardData.js.
        </p>
      </div>
    `;

  return `
    <details class="fusion-group-node" open>
      <summary>
        <span>
          ${integer.format(ingredient.amount)} ×
          ${escapeHtml(ingredient.label)}
        </span>

        <span class="fusion-choice-label">
          Choose one eligible shard
        </span>
      </summary>

      <div class="fusion-group-options">
        ${optionHtml}
      </div>
    </details>
  `;
}
/*
  Render a family-based or rarity-based ingredient.

  The list of eligible shards is generated automatically from
  each shard's classification information.
*/
function renderClassificationIngredientNode(
  ingredient,
  currentPath
) {
  let matchingShards = [];
  let label = "Eligible shards";
  let classificationDescription = "";

  if (ingredient.type === "family") {
    matchingShards = getShardsByFamily(ingredient.family);

    label = `Any ${ingredient.family}-family shard`;

    classificationDescription =
      `family: "${ingredient.family}"`;
  }

  if (ingredient.type === "rarity") {
    matchingShards = getShardsByRarity(ingredient.rarity);

    label = `Any ${String(ingredient.rarity).toUpperCase()} shard`;

    classificationDescription =
      `rarity: "${String(ingredient.rarity).toUpperCase()}"`;
  }

  /*
    Sort the automatically generated choices alphabetically.
  */
  matchingShards.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const matchingShardHtml = matchingShards.length
    ? matchingShards
        .map(shard =>
          renderShardIngredientNode(
            shard.id,
            ingredient.amount,
            currentPath
          )
        )
        .join("")
    : `
      <div class="fusion-group-empty">
        <p>
          No eligible shards were found for this category.
        </p>

        <p>
          Add shards to shardData.js with
          <code>${escapeHtml(classificationDescription)}</code>
          inside their classification object.
        </p>
      </div>
    `;

  return `
    <details class="fusion-group-node" open>
      <summary>
        <span>
          ${integer.format(ingredient.amount)} ×
          ${escapeHtml(label)}
        </span>

        <span class="fusion-choice-label">
          ${integer.format(matchingShards.length)}
          ${
            matchingShards.length === 1
              ? "eligible shard"
              : "eligible shards"
          }
        </span>
      </summary>

      <div class="fusion-group-options">
        ${matchingShardHtml}
      </div>
    </details>
  `;
}
/*
  Decide which renderer should handle one recipe ingredient.
*/
function renderFusionIngredient(
  ingredient,
  currentPath
) {
  if (ingredient.type === "shard") {
    return renderShardIngredientNode(
      ingredient.shardId,
      ingredient.amount,
      currentPath
    );
  }

  /*
    Keep support for manually entered groups in case a recipe
    has unusual choices that cannot be generated from classification.
  */
  if (ingredient.type === "group") {
    return renderGroupIngredientNode(
      ingredient,
      currentPath
    );
  }

  /*
    Automatically generate all shards in a family.
  */
  if (ingredient.type === "family") {
    return renderClassificationIngredientNode(
      ingredient,
      currentPath
    );
  }

  /*
    Automatically generate all shards of a rarity.
  */
  if (ingredient.type === "rarity") {
    return renderClassificationIngredientNode(
      ingredient,
      currentPath
    );
  }

  return `
    <div class="fusion-tree-node fusion-tree-missing">
      <p>
        Unknown ingredient type:
        ${escapeHtml(ingredient.type || "not provided")}
      </p>
    </div>
  `;
}

/*
  Render every fusion recipe for one shard.

  Because recipes is an array, the target shard can have any number
  of different possible recipes.
*/
function renderFusionRecipesForTree(
  shard,
  currentPath = []
) {
  if (!shardHasFusionRecipes(shard)) {
    return `
      <p class="fusion-tree-empty">
        No fusion recipes have been entered for this shard.
      </p>
    `;
  }

  return shard.fusion.recipes
    .map((recipe, recipeIndex) => {
      const recipeName =
        recipe.name ||
        `Fusion Recipe ${recipeIndex + 1}`;

      const ingredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients
        : [];

      const ingredientsHtml = ingredients.length
        ? ingredients
            .map(ingredient =>
              renderFusionIngredient(
                ingredient,
                currentPath
              )
            )
            .join("")
        : `
          <p class="fusion-tree-warning">
            This recipe does not have any ingredients entered.
          </p>
        `;

      return `
        <article class="fusion-path">
          <div class="fusion-path-heading">
            <div>
              <span class="fusion-path-label">
                Recipe ${recipeIndex + 1}
              </span>

              <h5>${escapeHtml(recipeName)}</h5>
            </div>

            <div class="fusion-output">
              Produces
              <strong>
                ${integer.format(recipe.outputAmount || 1)} ×
                ${escapeHtml(shard.name)}
              </strong>
            </div>
          </div>

          <div class="fusion-path-ingredients">
            ${ingredientsHtml}
          </div>
        </article>
      `;
    })
    .join("");
}

/*
  Find every shard whose recipes reference the current shard.

  This replaces the manually maintained usedIn array.
*/
function getRecipesUsingShard(targetShardId) {
  const results = [];

  shardData.forEach(outputShard => {
    const recipes =
      outputShard.fusion &&
      Array.isArray(outputShard.fusion.recipes)
        ? outputShard.fusion.recipes
        : [];

    recipes.forEach((recipe, recipeIndex) => {
      const ingredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients
        : [];

      const usesTargetShard = ingredients.some(ingredient => {
        if (
          ingredient.type === "shard" &&
          ingredient.shardId === targetShardId
        ) {
          return true;
        }

        if (
          ingredient.type === "group" &&
          Array.isArray(ingredient.options) &&
          ingredient.options.includes(targetShardId)
        ) {
          return true;
        }

        return false;
      });

      if (usesTargetShard) {
        results.push({
          outputShard,
          recipe,
          recipeIndex
        });
      }
    });
  });

  return results;
}

/*
  Render the large Bazaar section for the searched target shard.

  This keeps all of your existing Bazaar values.
*/
function renderTargetBazaarSection(shard) {
  const product = getBazaarProductForShard(shard);

  if (!product) {
    return `
      <section class="detail-section">
        <h4>Bazaar</h4>
        <p>Price information is unavailable.</p>
      </section>
    `;
  }

  const taxRate =
    Math.max(0, Number(els.tax.value) || 0) / 100;

  const spreadCoins =
    product.instantBuy - product.instantSell;

  const spreadPercent =
    product.instantBuy > 0
      ? (spreadCoins / product.instantBuy) * 100
      : null;

  const afterTaxSpread =
    product.instantBuy * (1 - taxRate) -
    product.instantSell;

  const spreadClass =
    spreadCoins >= 0 ? "positive" : "negative";

  const afterTaxClass =
    afterTaxSpread >= 0 ? "positive" : "negative";

  return `
    <section class="detail-section">
      <h4>Bazaar</h4>

      <div class="bazaar-detail-grid">
        <div class="bazaar-detail">
          <span>Instant Buy</span>
          <strong>
            ${formatCoins(product.instantBuy)}
          </strong>
        </div>

        <div class="bazaar-detail">
          <span>Instant Sell</span>
          <strong>
            ${formatCoins(product.instantSell)}
          </strong>
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

          <strong>
            ${integer.format(product.buyVolume)}
          </strong>
        </div>

        <div class="bazaar-detail">
          <span>Sell Volume</span>

          <strong>
            ${integer.format(product.sellVolume)}
          </strong>
        </div>
      </div>
    </section>
  `;
}

/*
  Render the main hunting section for the searched target shard.
*/
function renderTargetHuntingSection(shard) {
  if (!shard.hunting || !shard.hunting.huntable) {
    return `
      <section class="detail-section">
        <h4>Direct Hunting</h4>

        <p>
          This shard cannot be hunted directly.
        </p>
      </section>
    `;
  }

  const difficultyClass = shard.hunting.difficulty
    ? shard.hunting.difficulty.toLowerCase()
    : "unknown";

  return `
    <section class="detail-section">
      <h4>Direct Hunting</h4>

      <p>
        <strong>Location:</strong>

        <span class="badge badge-location">
          ${escapeHtml(shard.hunting.location || "Unknown")}
        </span>
      </p>

      <p>
        <strong>Method:</strong>
        ${escapeHtml(
          shard.hunting.method ||
          "No hunting instructions have been added yet."
        )}
      </p>

      <p>
        <strong>Tool:</strong>

        <span class="badge badge-tool">
          ${escapeHtml(shard.hunting.tool || "None listed")}
        </span>
      </p>

      <p>
        <strong>Difficulty:</strong>

        <span class="badge badge-${escapeHtml(difficultyClass)}">
          ${escapeHtml(
            shard.hunting.difficulty || "Unknown"
          )}
        </span>
      </p>
    </section>
  `;
}

/*
  Render every recipe that uses the searched shard.
*/
function renderUsedInSection(shard) {
  const usedInResults = getRecipesUsingShard(shard.id);

  const usedInHtml = usedInResults.length
    ? usedInResults
        .map(result => {
          const recipeName =
            result.recipe.name ||
            `Recipe ${result.recipeIndex + 1}`;

          return `
            <li>
              <strong>
                ${escapeHtml(result.outputShard.name)}
              </strong>

              <span class="used-in-recipe-name">
                ${escapeHtml(recipeName)}
              </span>
            </li>
          `;
        })
        .join("")
    : "<li>None currently entered</li>";

  return `
    <section class="detail-section">
      <h4>Used in Fusions</h4>

      <ul class="used-in-list">
        ${usedInHtml}
      </ul>
    </section>
  `;
}
/*
  Render one ingredient as a lightweight summary.

  This intentionally does not recursively render all of the
  ingredient's own fusion recipes.
*/
function renderIngredientSummary(ingredient) {
  const amount = Number(ingredient.amount) || 1;

  if (ingredient.type === "shard") {
    const ingredientShard = getShardById(ingredient.shardId);

    const ingredientName = ingredientShard
      ? ingredientShard.name
      : titleFromProductId(ingredient.shardId);

    return `
      <li class="fusion-ingredient-summary">
        <strong>
          ${integer.format(amount)} ×
          ${escapeHtml(ingredientName)}
        </strong>

        ${
          ingredientShard
            ? renderAcquisitionBadges(ingredientShard)
            : `
              <span class="acquisition-badge acquisition-unresolved">
                Missing data
              </span>
            `
        }
      </li>
    `;
  }

  if (ingredient.type === "family") {
    return `
      <li class="fusion-ingredient-summary">
        <strong>
          ${integer.format(amount)} ×
          Any ${escapeHtml(ingredient.family)}-family shard
        </strong>
      </li>
    `;
  }

  if (ingredient.type === "rarity") {
    return `
      <li class="fusion-ingredient-summary">
        <strong>
          ${integer.format(amount)} ×
          Any ${escapeHtml(
            String(ingredient.rarity).toUpperCase()
          )} shard
        </strong>
      </li>
    `;
  }

  if (ingredient.type === "group") {
    return `
      <li class="fusion-ingredient-summary">
        <strong>
          ${integer.format(amount)} ×
          ${escapeHtml(
            ingredient.label || "Eligible shard"
          )}
        </strong>
      </li>
    `;
  }

  return `
    <li class="fusion-ingredient-summary">
      Unknown ingredient
    </li>
  `;
}
/*
  Render only the target shard's direct recipes.

  This prevents the browser from constructing the entire recursive
  fusion network during a search.
*/
function renderDirectFusionRecipes(shard) {
  const recipes = Array.isArray(shard.fusion?.recipes)
    ? shard.fusion.recipes
    : [];

  const visibleRecipeLimit = 50;
  const visibleRecipes = recipes.slice(0, visibleRecipeLimit);

  const recipeHtml = visibleRecipes
    .map((recipe, recipeIndex) => {
      const ingredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients
        : [];

      const ingredientsHtml = ingredients.length
        ? ingredients
            .map(renderIngredientSummary)
            .join("")
        : `
          <li class="fusion-tree-warning">
            This recipe has no ingredients.
          </li>
        `;

      return `
        <details class="fusion-path">
          <summary class="fusion-path-heading">
            <div>
              <span class="fusion-path-label">
                Recipe ${recipeIndex + 1}
              </span>

              <h5>
                ${escapeHtml(
                  recipe.name ||
                  `Fusion Recipe ${recipeIndex + 1}`
                )}
              </h5>
            </div>

            <div class="fusion-output">
              Produces
              <strong>
                ${integer.format(recipe.outputAmount || 1)} ×
                ${escapeHtml(shard.name)}
              </strong>
            </div>
          </summary>

          <ul class="fusion-path-ingredients">
            ${ingredientsHtml}
          </ul>
        </details>
      `;
    })
    .join("");

  const remainingCount =
    recipes.length - visibleRecipes.length;

  const limitMessage =
    remainingCount > 0
      ? `
        <p class="fusion-tree-warning">
          Showing the first
          ${integer.format(visibleRecipeLimit)}
          recipes.

          ${integer.format(remainingCount)}
          additional recipes are hidden to prevent the browser
          from running out of memory.
        </p>
      `
      : "";

  return `
    ${recipeHtml}
    ${limitMessage}
  `;
}
/*
  Render all possible known acquisition paths for the searched target.
*/
function renderTargetFusionSection(shard) {
  if (!shardHasFusionRecipes(shard)) {
    return `
      <section class="detail-section">
        <h4>Fusion Paths</h4>

        <p>
          No fusion recipe has been entered for this shard.
        </p>
      </section>
    `;
  }

  return `
    <section class="detail-section fusion-tree-section">
      <div class="fusion-tree-title">
        <div>
          <h4>Known Fusion Recipes</h4>

          <p>
            Open a recipe to view its direct ingredients.
          </p>
        </div>

        <span class="fusion-recipe-count">
          ${integer.format(shard.fusion.recipes.length)}
          ${
            shard.fusion.recipes.length === 1
              ? "recipe"
              : "recipes"
          }
        </span>
      </div>

      <div class="fusion-tree">
        ${renderDirectFusionRecipes(shard)}
      </div>
    </section>
  `;
}

/*
  Render the searched shard's complete detail card.
*/
function renderHuntingShards() {
  if (
    !els.huntingShards ||
    !els.shardDetailsSection ||
    !Array.isArray(shardData)
  ) {
    return;
  }

  const searchTerm =
    els.search.value.trim().toLowerCase();

  if (!searchTerm) {
    els.huntingShards.innerHTML = "";
    els.shardDetailsSection.hidden = true;
    return;
  }

  /*
  Only open the expensive detail section when the user enters
  an exact shard name or permanent ID.

  Partial searches will still work in the Bazaar results table.
*/
const matchingShards = shardData.filter(shard => {
  const normalizedName =
    shard.name.trim().toLowerCase();

  const normalizedId =
    shard.id.trim().toLowerCase();

  return (
    normalizedName === searchTerm ||
    normalizedId === searchTerm
  );
});

  els.huntingShards.innerHTML = matchingShards
    .map(shard => {
      return `
        <article class="hunting-shard">
          <div class="target-shard-heading">
            <div>
              <span class="target-shard-label">
                Target Shard
              </span>

              <h3>${escapeHtml(shard.name)}</h3>
            </div>

            <div class="target-shard-badges">
              ${renderAcquisitionBadges(shard)}
            </div>
          </div>

          ${renderTargetBazaarSection(shard)}
          ${renderTargetHuntingSection(shard)}
          ${renderUsedInSection(shard)}
          ${renderTargetFusionSection(shard)}
        </article>
      `;
    })
    .join("");

  els.shardDetailsSection.hidden =
    matchingShards.length === 0;
}

 loadData();
window.exportShardTemplate = function () {
    const template = state.shards
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(product => {
            const permanentId = product.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "");

            return {
                id: permanentId,
                name: product.name,
                bazaarId: product.id,

                classification: {
                    family: "",
                    rarity: ""
                },

                hunting: {
                    huntable: false,
                    location: "",
                    method: "",
                    tool: "",
                    difficulty: ""
                },

                fusion: {
                    recipes: []
                }
            };
        });

    console.log(JSON.stringify(template, null, 4));

    return template;
};