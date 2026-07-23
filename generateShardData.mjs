import { writeFile } from "node:fs/promises";
import process from "node:process";

/*
  Public SkyShards source files.

  fusion-data.json is required.
  rates.json and desc.json are optional enrichment sources.
*/
const SOURCE_BASE =
  "https://raw.githubusercontent.com/Campionnn/SkyShards/master";

const URLS = {
  fusionData: `${SOURCE_BASE}/public/fusion-data.json`,
  rates: `${SOURCE_BASE}/public/rates.json`,
  descriptions: `${SOURCE_BASE}/src/desc.json`
};

/*
  Download a required JSON file.

  The generator stops if this download fails.
*/
async function fetchRequiredJson(label, url) {
  console.log(`Downloading ${label}...`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ShardScope generator"
    }
  });

  if (!response.ok) {
    throw new Error(
      `${label} download failed: ` +
      `${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/*
  Download an optional JSON file.

  If it cannot be downloaded, generation continues without it.
*/
async function fetchOptionalJson(label, url) {
  try {
    console.log(`Downloading ${label}...`);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ShardScope generator"
      }
    });

    if (!response.ok) {
      console.warn(
        `${label} unavailable: ` +
        `${response.status} ${response.statusText}`
      );

      return {};
    }

    return await response.json();
  } catch (error) {
    console.warn(
      `${label} could not be downloaded: ${error.message}`
    );

    return {};
  }
}

/*
  Convert a source key such as C10 into the permanent shard ID
  used by ShardScope, such as SHARD_HIDEONLEAF.
*/
function getPermanentShardId(sourceId, sourceShards) {
  const sourceShard = sourceShards[sourceId];

  if (!sourceShard) {
    return null;
  }

  return (
    sourceShard.internal_id ||
    sourceShard.internalId ||
    null
  );
}

/*
  Read a number safely.
*/
function toPositiveNumber(value, fallback = 1) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }

  return number;
}

/*
  Find a value inside the optional acquisition-rate data.

  Different source versions may identify shards by:
  - source key, such as C10
  - Bazaar/internal ID
  - shard name
*/
function findRate(
  rateData,
  sourceId,
  permanentId,
  shardName
) {
  if (!rateData || typeof rateData !== "object") {
    return null;
  }

  const possibleKeys = [
    sourceId,
    permanentId,
    shardName,
    String(shardName || "").toLowerCase()
  ].filter(Boolean);

  for (const key of possibleKeys) {
    const value = rateData[key];

    if (Number.isFinite(Number(value))) {
      return Number(value);
    }

    if (
      value &&
      typeof value === "object"
    ) {
      const nestedValue =
        value.estimatedPerHour ??
        value.perHour ??
        value.rate ??
        value.amount;

      if (Number.isFinite(Number(nestedValue))) {
        return Number(nestedValue);
      }
    }
  }

  return null;
}

/*
  Find optional description information using several possible keys.
*/
function findDescription(
  descriptionData,
  sourceId,
  permanentId,
  shardName
) {
  if (
    !descriptionData ||
    typeof descriptionData !== "object"
  ) {
    return null;
  }

  const possibleKeys = [
    sourceId,
    permanentId,
    shardName,
    String(shardName || "").toLowerCase()
  ].filter(Boolean);

  for (const key of possibleKeys) {
    if (descriptionData[key]) {
      return descriptionData[key];
    }
  }

  return null;
}

/*
  Convert one ingredient source key into the ingredient format
  expected by app.js.
*/
function createShardIngredient(
  ingredientSourceId,
  sourceShards
) {
  const ingredientSourceShard =
    sourceShards[ingredientSourceId];

  if (!ingredientSourceShard) {
    return null;
  }

  const ingredientPermanentId =
    getPermanentShardId(
      ingredientSourceId,
      sourceShards
    );

  if (!ingredientPermanentId) {
    return null;
  }

  return {
    type: "shard",
    shardId: ingredientPermanentId,
    amount: toPositiveNumber(
      ingredientSourceShard.fuse_amount,
      1
    )
  };
}

/*
  Produce a stable duplicate key for one fusion pair.

  Sorting the two ingredient IDs causes:

  A + B
  B + A

  to produce the same key.
*/
function createMirroredPairKey(
  firstSourceId,
  secondSourceId,
  outputAmount
) {
  return [
    firstSourceId,
    secondSourceId
  ]
    .sort()
    .join("|") + `::${outputAmount}`;
}

/*
  Convert the nested recipes for one output shard.

  Expected source shape:

  recipes: {
    C2: {
      "1": [
        ["C1", "L4"],
        ["L4", "C1"]
      ],
      "2": [
        ["C5", "U1"]
      ]
    }
  }

  The numbered key is treated as the output amount.
*/
function convertRecipesForShard(
  outputSourceId,
  outputPermanentId,
  sourceRecipeGroups,
  sourceShards
) {
  if (
    !sourceRecipeGroups ||
    typeof sourceRecipeGroups !== "object"
  ) {
    return [];
  }

  const convertedRecipes = [];
  const seenPairs = new Set();

  const sortedGroups = Object.entries(
    sourceRecipeGroups
  ).sort(([firstKey], [secondKey]) => {
    return Number(firstKey) - Number(secondKey);
  });

  for (const [outputAmountKey, pairs] of sortedGroups) {
    if (!Array.isArray(pairs)) {
      continue;
    }

    const outputAmount =
      toPositiveNumber(outputAmountKey, 1);

    for (const pair of pairs) {
      if (
        !Array.isArray(pair) ||
        pair.length < 2
      ) {
        continue;
      }

      const firstSourceId = pair[0];
      const secondSourceId = pair[1];

      if (
        typeof firstSourceId !== "string" ||
        typeof secondSourceId !== "string"
      ) {
        continue;
      }

      const duplicateKey = createMirroredPairKey(
        firstSourceId,
        secondSourceId,
        outputAmount
      );

      if (seenPairs.has(duplicateKey)) {
        continue;
      }

      seenPairs.add(duplicateKey);

      const firstIngredient = createShardIngredient(
        firstSourceId,
        sourceShards
      );

      const secondIngredient = createShardIngredient(
        secondSourceId,
        sourceShards
      );

      if (!firstIngredient || !secondIngredient) {
        console.warn(
          `Skipped invalid recipe for ${outputSourceId}: ` +
          `${firstSourceId} + ${secondSourceId}`
        );

        continue;
      }

      convertedRecipes.push({
        id:
          `${outputPermanentId}_RECIPE_` +
          `${convertedRecipes.length + 1}`,

        name:
          `${sourceShards[firstSourceId].name} + ` +
          `${sourceShards[secondSourceId].name}`,

        outputAmount,

        ingredients: [
          firstIngredient,
          secondIngredient
        ]
      });
    }
  }

  return convertedRecipes;
}

/*
  Convert every source shard into the exact structure expected
  by app.js.
*/
function convertAllShards(
  fusionData,
  rateData,
  descriptionData
) {
  const sourceShards =
    fusionData?.shards || {};

  const sourceRecipes =
    fusionData?.recipes || {};

  const convertedShards = [];

  for (
    const [sourceId, sourceShard]
    of Object.entries(sourceShards)
  ) {
    const permanentId =
      getPermanentShardId(
        sourceId,
        sourceShards
      );

    if (!permanentId) {
      console.warn(
        `Skipped ${sourceId}: missing internal_id`
      );

      continue;
    }

    const name =
      sourceShard.name || permanentId;

    const estimatedPerHour = findRate(
      rateData,
      sourceId,
      permanentId,
      name
    );

    const description = findDescription(
      descriptionData,
      sourceId,
      permanentId,
      name
    );

    const recipes = convertRecipesForShard(
      sourceId,
      permanentId,
      sourceRecipes[sourceId],
      sourceShards
    );

    convertedShards.push({
      id: permanentId,
      name,
      bazaarId: permanentId,

      classification: {
        family:
          sourceShard.family || "",

        rarity:
          sourceShard.rarity
            ? String(
                sourceShard.rarity
              ).toUpperCase()
            : "",

        type:
          sourceShard.type || ""
      },

      hunting: {
        huntable:
          Number.isFinite(estimatedPerHour) &&
          estimatedPerHour > 0,

        location: "",
        method:
          description?.description ||
          description?.text ||
          "",

        tool: "",
        difficulty: "",

        estimatedPerHour:
          Number.isFinite(estimatedPerHour) &&
          estimatedPerHour > 0
            ? estimatedPerHour
            : null
      },

      fusion: {
        recipes
      },

      source: {
        sourceId
      }
    });
  }

  return convertedShards.sort((first, second) =>
    first.name.localeCompare(second.name)
  );
}

/*
  Count all generated recipes.
*/
function countRecipes(shards) {
  return shards.reduce(
    (total, shard) =>
      total + shard.fusion.recipes.length,
    0
  );
}

/*
  Validate that every ingredient points to a shard that exists.
*/
function validateIngredientReferences(shards) {
  const validShardIds = new Set(
    shards.map(shard => shard.id)
  );

  const missingReferences = [];

  for (const outputShard of shards) {
    for (
      const recipe
      of outputShard.fusion.recipes
    ) {
      for (
        const ingredient
        of recipe.ingredients
      ) {
        if (
          ingredient.type === "shard" &&
          !validShardIds.has(
            ingredient.shardId
          )
        ) {
          missingReferences.push({
            output: outputShard.id,
            recipe: recipe.id,
            ingredient:
              ingredient.shardId
          });
        }
      }
    }
  }

  return missingReferences;
}

/*
  Build the JavaScript file loaded by index.html.
*/
function buildOutputFile(shards) {
  return `/*
  ShardScope shard database

  Automatically generated by generateShardData.mjs.
  Do not manually edit the generated recipe list.
*/

const shardData = ${JSON.stringify(
    shards,
    null,
    2
  )};

window.shardData = shardData;
`;
}

async function main() {
  console.log("");
  console.log(
    "Starting ShardScope generator..."
  );
  console.log("");

  const fusionData =
    await fetchRequiredJson(
      "fusion data",
      URLS.fusionData
    );

  const [
    rateData,
    descriptionData
  ] = await Promise.all([
    fetchOptionalJson(
      "acquisition rates",
      URLS.rates
    ),

    fetchOptionalJson(
      "descriptions",
      URLS.descriptions
    )
  ]);

  if (
    !fusionData ||
    typeof fusionData !== "object"
  ) {
    throw new Error(
      "Fusion data is not a valid object."
    );
  }

  if (
    !fusionData.shards ||
    typeof fusionData.shards !== "object"
  ) {
    throw new Error(
      "Fusion data does not contain a shards object."
    );
  }

  if (
    !fusionData.recipes ||
    typeof fusionData.recipes !== "object"
  ) {
    throw new Error(
      "Fusion data does not contain a recipes object."
    );
  }

  console.log("");
  console.log(
    "Converting shards and recipes..."
  );

  const shards = convertAllShards(
    fusionData,
    rateData,
    descriptionData
  );

  const recipeCount =
    countRecipes(shards);

  const missingReferences =
    validateIngredientReferences(shards);

  const outputCode =
    buildOutputFile(shards);

  await writeFile(
    "./shardData.js",
    outputCode,
    "utf8"
  );

  console.log("");
  console.log("Generation complete!");
  console.log(`Shards: ${shards.length}`);
  console.log(`Recipes: ${recipeCount}`);
  console.log(
    `Missing ingredient references: ` +
    `${missingReferences.length}`
  );
  console.log("");
  console.log(
    "Created: shardData.js"
  );

  if (recipeCount === 0) {
    console.warn("");
    console.warn(
      "Warning: zero recipes were generated."
    );
    console.warn(
      "The remote recipe format may have changed."
    );
  }

  if (missingReferences.length > 0) {
    console.warn("");
    console.warn(
      "Some recipe ingredients referenced missing shards:"
    );

    console.warn(
      missingReferences.slice(0, 10)
    );
  }
}

main().catch(error => {
  console.error("");
  console.error(
    "ShardScope generation failed:"
  );
  console.error(error);
  console.error("");

  process.exitCode = 1;
});