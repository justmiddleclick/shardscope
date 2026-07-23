const shardData = [
  {
    name: "Hideonleaf",
    bazaarId: "SHARD_HIDEONLEAF",

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
      canBeCreatedByFusion: false,
      ingredients: [],
      usedIn: [
  "SHARD_HIDEON_GIFT"
]
    }
  },
    {
    name: "Hideon Gift",
    bazaarId: "SHARD_HIDEON_GIFT",

    hunting: {
      huntable: false,
      location: null,
      method: null,
      tool: null,
      difficulty: null,
      estimatedPerHour: null
    },

    fusion: {
      canBeCreatedByFusion: true,
      outputAmount: 2,
      ingredients: [
        {
          requirement: "Any Shulker-family shard",
          amount: 5
        },
        {
          requirement: "Any COMMON shard",
          amount: 5
        }
      ],
      usedIn: []
    }
  }
];