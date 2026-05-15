export const PRODUCT_LAUNCH_STATUSES = [
  "draft",
  "in_progress",
  "paused",
  "launched",
  "cancelled",
] as const;

export type ProductLaunchStatus = (typeof PRODUCT_LAUNCH_STATUSES)[number];

export const PRODUCT_LAUNCH_ROADMAP = [
  {
    stageNumber: 1,
    stageName: "Innovation Approval - NOT ANNOUNCED",
    gate: "CEO approval",
    tasks: [
      "Concept defined",
      "Add to Spanish section of website",
      "File IDOA product registration application",
    ],
  },
  {
    stageNumber: 2,
    stageName: "Lock Supply Chain - NOT ANNOUNCED",
    gate: "All materials inbound with dates, production window scheduled",
    tasks: [
      "BOM finalized",
      "Ingredient POs placed with confirmed delivery to facility",
      "Packaging POs placed & approved proofs",
      "Production window scheduled",
    ],
  },
  {
    stageNumber: 3,
    stageName: "First Production Run and Lab Testing - NOT ANNOUNCED",
    gate: "Pilot passing all lab & QA testing",
    tasks: [
      "After Product Registration is approved by IDOA",
      "Create in METRC",
      "Temporarily remove from Spanish webpage",
      "Produce first production batch",
      "Submit to Steep Hill, receive passing result",
      "Team samples for validation",
      "Update SOPs if necessary",
    ],
  },
  {
    stageNumber: 4,
    stageName: "Process First Production Run - NOT ANNOUNCED",
    gate: "Sellable inventory in the vault, tested, labeled, sales readiness confirmed.",
    tasks: [
      "Label and package",
      "Add to Bamboo, not public view",
      "Add to brand portals: Jane, Dutchie, others",
      "Strict \"NO retailer communications yet\" policy. Use only codename internally.",
    ],
  },
  {
    stageNumber: 5,
    stageName: "Controlled External Tease",
    gate: "Shipping certainty",
    tasks: [
      "Add back to Spanish webpage",
      "Heads-up to top accounts and PCPs",
      "Promos discussed",
      "Social tease",
      "Identify date of Launch Day",
      "Create/purchase marketing assets to support Launch Day",
    ],
  },
  {
    stageNumber: 6,
    stageName: "Take Orders",
    gate: "Orders shipping",
    tasks: [
      "Orders open with guaranteed shipping, delivery by launch date",
      "Budtender education: Seed Talent, Spark Plug",
    ],
  },
  {
    stageNumber: 7,
    stageName: "Launch Day",
    gate: "N/A",
    tasks: [
      "Announcement on Instagram and Bamboo email campaign",
      "Monitor promos",
      "Replenish ingredients and materials if necessary",
      "Schedule next production batch",
    ],
  },
] as const;
