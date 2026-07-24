/*
  ShardScope acquisition calculator

  This file calculates the cheapest known way to obtain each shard.

  Supported acquisition methods:
  - Buy directly from the Bazaar
  - Obtain ingredients through their cheapest methods and fuse them

  Hunting will be added later when reliable hunting rates are available.
*/

class ShardAcquisitionCalculator {
  constructor({
    shards,
    bazaarProducts,
    priceMode = "instantBuy"
  }) {
    this.shards = Array.isArray(shards)
      ? shards
      : [];

    this.bazaarProducts = Array.isArray(bazaarProducts)
      ? bazaarProducts
      : [];

    this.priceMode =
      priceMode === "buyOrder"
        ? "buyOrder"
        : "instantBuy";

    this.shardById = new Map(
      this.shards.map(shard => [
        shard.id,
        shard
      ])
    );

    this.bazaarById = new Map(
      this.bazaarProducts.map(product => [
        product.id,
        product
      ])
    );

    /*
      Stores the cheapest calculated result for each shard.
    */
    this.bestResults = new Map();

    /*
      Stores all ranked direct acquisition choices for each shard.
    */
    this.rankedResults = new Map();

    /*
      Shards that appear to participate in a continually improving
      fusion cycle are recorded here.
    */
    this.unstableShardIds = new Set();

    this.calculate();
  }

  /*
    Change between:

    instantBuy:
      Buy immediately from existing sell offers.

    buyOrder:
      Estimate the cost of placing a competitive buy order.
  */
  setPriceMode(priceMode) {
    this.priceMode =
      priceMode === "buyOrder"
        ? "buyOrder"
        : "instantBuy";

    this.calculate();
  }

  /*
    Return the Bazaar product associated with a shard.
  */
  getBazaarProduct(shard) {
    if (!shard || !shard.bazaarId) {
      return null;
    }

    return (
      this.bazaarById.get(shard.bazaarId) ||
      null
    );
  }

  /*
    Return the selected Bazaar acquisition price.

    Your current Bazaar structure uses:

    instantBuy:
      Cheapest sell offer, used when buying immediately.

    instantSell:
      Highest buy order, used as the estimated competitive
      buy-order price.
  */
  getBazaarUnitPrice(shard) {
    const product = this.getBazaarProduct(shard);

    if (!product) {
      return null;
    }

    const price =
      this.priceMode === "buyOrder"
        ? Number(product.instantSell)
        : Number(product.instantBuy);

    if (!Number.isFinite(price) || price <= 0) {
      return null;
    }

    return price;
  }

  /*
    Create the direct Bazaar purchase option for one shard.
  */
  createBuyOption(shard) {
    const unitCost =
      this.getBazaarUnitPrice(shard);

    if (!Number.isFinite(unitCost)) {
      return null;
    }

    return {
      type: "buy",
      shardId: shard.id,
      shardName: shard.name,

      priceMode: this.priceMode,

      totalCost: unitCost,
      unitCost,

      outputAmount: 1,

      ingredients: [],

      label:
        this.priceMode === "buyOrder"
          ? "Buy Order"
          : "Instant Buy"
    };
  }

  /*
    Calculate the cost of one fusion recipe using the current best
    costs for all of its ingredients.
  */
  createFusionOption(
    outputShard,
    recipe,
    recipeIndex,
    currentCosts
  ) {
    const ingredients = Array.isArray(
      recipe.ingredients
    )
      ? recipe.ingredients
      : [];

    if (!ingredients.length) {
      return null;
    }

    const outputAmount =
      Number(recipe.outputAmount) > 0
        ? Number(recipe.outputAmount)
        : 1;

    let batchCost = 0;

    const calculatedIngredients = [];

    for (const ingredient of ingredients) {
      if (ingredient.type !== "shard") {
        /*
          The generated database currently contains explicit shard
          ingredients. Family, rarity, and group ingredients can be
          supported later if needed.
        */
        return null;
      }

      const ingredientShard =
        this.shardById.get(
          ingredient.shardId
        );

      if (!ingredientShard) {
        return null;
      }

      const ingredientUnitCost =
        currentCosts.get(
          ingredientShard.id
        );

      if (
        !Number.isFinite(
          ingredientUnitCost
        )
      ) {
        return null;
      }

      const amount =
        Number(ingredient.amount) > 0
          ? Number(ingredient.amount)
          : 1;

      const ingredientTotalCost =
        ingredientUnitCost * amount;

      batchCost += ingredientTotalCost;

      calculatedIngredients.push({
        type: "shard",
        shardId: ingredientShard.id,
        shardName: ingredientShard.name,
        amount,
        unitCost: ingredientUnitCost,
        totalCost: ingredientTotalCost
      });
    }

    const unitCost =
      batchCost / outputAmount;

    if (!Number.isFinite(unitCost)) {
      return null;
    }

    return {
      type: "fusion",

      shardId: outputShard.id,
      shardName: outputShard.name,

      recipeId:
        recipe.id ||
        `${outputShard.id}_RECIPE_${recipeIndex + 1}`,

      recipeIndex,

      recipeName:
        recipe.name ||
        `Fusion Recipe ${recipeIndex + 1}`,

      totalCost: batchCost,
      unitCost,

      /*
        batchCost is the cost of performing the whole recipe once.
      */
      batchCost,

      outputAmount,

      ingredients:
        calculatedIngredients,

      label: "Fusion"
    };
  }

  /*
    Generate every currently calculable acquisition option for a shard.
  */
  createOptionsForShard(
    shard,
    currentCosts
  ) {
    const options = [];

    const buyOption =
      this.createBuyOption(shard);

    if (buyOption) {
      options.push(buyOption);
    }

    const recipes =
      shard.fusion &&
      Array.isArray(shard.fusion.recipes)
        ? shard.fusion.recipes
        : [];

    recipes.forEach(
      (recipe, recipeIndex) => {
        const fusionOption =
          this.createFusionOption(
            shard,
            recipe,
            recipeIndex,
            currentCosts
          );

        if (fusionOption) {
          options.push(fusionOption);
        }
      }
    );

    return options.sort(
      (first, second) =>
        first.unitCost -
        second.unitCost
    );
  }

  /*
    Calculate cheapest acquisition costs for the full shard graph.

    This uses repeated cost relaxation instead of unrestricted recursive
    calls. Costs only move downward as cheaper fusion routes are found.

    That avoids stack overflows and handles large recipe networks much
    better than recursively exploring every possible complete path.
  */
  calculate() {
    this.bestResults.clear();
    this.rankedResults.clear();
    this.unstableShardIds.clear();

    const costs = new Map();

    /*
      Begin with direct Bazaar purchase costs.

      Shards without a usable Bazaar price begin at Infinity and may
      become reachable later through fusion.
    */
    for (const shard of this.shards) {
      const buyOption =
        this.createBuyOption(shard);

      costs.set(
        shard.id,
        buyOption
          ? buyOption.unitCost
          : Infinity
      );
    }

    /*
      More than one pass is needed because an ingredient may become
      cheaper during an earlier pass, allowing another shard to become
      cheaper during a later pass.
    */
    const maximumPasses =
      Math.max(
        1,
        this.shards.length * 2
      );

    const improvementTolerance = 0.000001;

    let changedOnFinalPass = false;

    for (
      let passIndex = 0;
      passIndex < maximumPasses;
      passIndex += 1
    ) {
      let changedThisPass = false;

      for (const shard of this.shards) {
        const options =
          this.createOptionsForShard(
            shard,
            costs
          );

        if (!options.length) {
          continue;
        }

        const cheapestOption =
          options[0];

        const previousCost =
          costs.get(shard.id);

        if (
          cheapestOption.unitCost <
          previousCost -
            improvementTolerance
        ) {
          costs.set(
            shard.id,
            cheapestOption.unitCost
          );

          changedThisPass = true;
        }
      }

      if (!changedThisPass) {
        changedOnFinalPass = false;
        break;
      }

      changedOnFinalPass =
        passIndex ===
        maximumPasses - 1;
    }

    /*
      If improvements are still happening after the safety limit,
      detect which shards would improve again.

      That can indicate a productive circular dependency or malformed
      recipe data. Those paths will not be expanded recursively.
    */
    if (changedOnFinalPass) {
      for (const shard of this.shards) {
        const options =
          this.createOptionsForShard(
            shard,
            costs
          );

        if (!options.length) {
          continue;
        }

        const currentCost =
          costs.get(shard.id);

        if (
          options[0].unitCost <
          currentCost -
            improvementTolerance
        ) {
          this.unstableShardIds.add(
            shard.id
          );
        }
      }
    }

    /*
      Build final ranked choices using the settled ingredient costs.
    */
    for (const shard of this.shards) {
      const options =
        this.createOptionsForShard(
          shard,
          costs
        );

      this.rankedResults.set(
        shard.id,
        options
      );

      this.bestResults.set(
        shard.id,
        options[0] || null
      );
    }
  }

  /*
    Return the cheapest acquisition choice for a shard.
  */
  getBestOption(shardId) {
    return (
      this.bestResults.get(shardId) ||
      null
    );
  }

  /*
    Return every direct choice ranked from cheapest to most expensive.

    Each fusion option already uses the cheapest calculated methods for
    its ingredient shards.
  */
  getRankedOptions(shardId) {
    return [
      ...(
        this.rankedResults.get(
          shardId
        ) || []
      )
    ];
  }

  /*
    Build the full cheapest path for display.

    The calculation itself is graph-based and cached. This function only
    expands the selected result when the user asks to view it.
  */
  buildPath(
    shardId,
    {
      optionIndex = 0,
      currentPath = [],
      maximumDepth = 50
    } = {}
  ) {
    const shard =
      this.shardById.get(shardId);

    if (!shard) {
      return {
        type: "missing",
        shardId,
        error: "Shard data is missing."
      };
    }

    if (
      currentPath.includes(shardId)
    ) {
      return {
        type: "cycle",
        shardId: shard.id,
        shardName: shard.name,
        error:
          "A circular fusion dependency was stopped."
      };
    }

    if (
      currentPath.length >=
      maximumDepth
    ) {
      return {
        type: "depth-limit",
        shardId: shard.id,
        shardName: shard.name,
        error:
          "The maximum path depth was reached."
      };
    }

    if (
      this.unstableShardIds.has(
        shardId
      )
    ) {
      return {
        type: "unstable-cycle",
        shardId: shard.id,
        shardName: shard.name,
        error:
          "This shard may be involved in a continually improving fusion cycle."
      };
    }

    const options =
      this.getRankedOptions(shardId);

    const selectedOption =
      options[optionIndex] ||
      options[0] ||
      null;

    if (!selectedOption) {
      return {
        type: "unavailable",
        shardId: shard.id,
        shardName: shard.name,
        error:
          "No purchasable or calculable fusion path is available."
      };
    }

    if (
      selectedOption.type === "buy"
    ) {
      return {
        ...selectedOption,
        children: []
      };
    }

    const nextPath = [
      ...currentPath,
      shardId
    ];

    const children =
      selectedOption.ingredients.map(
        ingredient => {
          return {
            ...ingredient,

            acquisition:
              this.buildPath(
                ingredient.shardId,
                {
                  optionIndex: 0,
                  currentPath: nextPath,
                  maximumDepth
                }
              )
          };
        }
      );

    return {
      ...selectedOption,
      children
    };
  }
}

/*
  Expose the calculator globally because this project currently uses
  regular browser scripts rather than JavaScript modules.
*/
window.ShardAcquisitionCalculator =
  ShardAcquisitionCalculator;