const shardData = [
  {
    id: "SHARD_HIDEONLEAF",
    name: "Hideonleaf",
    bazaarId: "SHARD_HIDEONLEAF",

    classification: {
      family: "Shulker",
      rarity: null
    },

    hunting: {
      huntable: true,
      location: "Galatea",
      method:
        "Wake the Hideonleaf, then reflect its projectile back until it is defeated.",
      tool: "Fishing Net",
      difficulty: "Easy",
      estimatedPerHour: null
    },

    fusion: {
      recipes: []
    }
  },

  {
    id: "SHARD_HIDEON_GIFT",
    name: "Hideongift",
    bazaarId: "SHARD_HIDEON_GIFT",

    classification: {
      family: null,
      rarity: null
    },

    hunting: {
      huntable: false,
      location: null,
      method: null,
      tool: null,
      difficulty: null,
      estimatedPerHour: null
    },

    fusion: {
      recipes: [
        {
          id: "HIDEON_GIFT_RECIPE_1",
          name: "Hideon Gift Fusion",
          outputAmount: 2,

          ingredients: [
            {
              type: "group",
              label: "Any Shulker-family shard",
              amount: 5,

              options: [
                "SHARD_HIDEONLEAF"
              ]
            },

            {
              type: "group",
              label: "Any COMMON shard",
              amount: 5,

              options: []
            }
          ]
        }
      ]
    }
  }
];