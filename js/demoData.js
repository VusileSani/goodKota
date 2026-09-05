const now = Date.now();

export const demoData = {
  meta: {
    schemaVersion: "1.0",
    createdAt: new Date(now).toISOString()
  },

  subscriptionPlans: [
    {
      id: "PLAN-PILOT",
      name: "Pilot",
      description: "Prototype merchant access while GoodKota validates the operating model.",
      amount: 0,
      durationDays: 30,
      active: true
    },
    {
      id: "PLAN-STANDARD",
      name: "Standard",
      description: "Placeholder commercial plan. Final price and terms are intentionally not fixed in V1.",
      amount: null,
      durationDays: 30,
      active: true
    }
  ],

  merchants: [
    {
      id: "MER-MIDRAND-01",
      slug: "goodkota-midrand",
      name: "Kasi Corner Midrand",
      location: "Midrand",
      shortDescription: "Big kota energy, quick collection and local delivery.",
      prepMinutes: 20,
      deliveryFee: 25,
      minimumOrder: 30,
      fulfilmentModes: ["COLLECTION", "DELIVERY"],
      isOpen: true,
      platformStatus: "ACTIVE",
      subscriptionPlanId: "PLAN-PILOT",
      subscriptionStatus: "PILOT",
      joinedAt: "2026-09-01T08:00:00+02:00"
    },
    {
      id: "MER-TEMBISA-01",
      slug: "tembisa-kota-house",
      name: "Tembisa Kota House",
      location: "Tembisa",
      shortDescription: "Classic township favourites with loaded options.",
      prepMinutes: 25,
      deliveryFee: 20,
      minimumOrder: 35,
      fulfilmentModes: ["COLLECTION", "DELIVERY"],
      isOpen: true,
      platformStatus: "ACTIVE",
      subscriptionPlanId: "PLAN-PILOT",
      subscriptionStatus: "PILOT",
      joinedAt: "2026-09-02T08:00:00+02:00"
    },
    {
      id: "MER-CENTURION-01",
      slug: "centurion-kota-spot",
      name: "Centurion Kota Spot",
      location: "Centurion",
      shortDescription: "Crunchy, loaded and built for the lunch rush.",
      prepMinutes: 30,
      deliveryFee: 30,
      minimumOrder: 40,
      fulfilmentModes: ["COLLECTION"],
      isOpen: false,
      platformStatus: "ACTIVE",
      subscriptionPlanId: "PLAN-STANDARD",
      subscriptionStatus: "ACTIVE",
      joinedAt: "2026-08-25T08:00:00+02:00"
    }
  ],

  menuItems: [
    { id: "ITEM-M-01", merchantId: "MER-MIDRAND-01", name: "Classic Kota", category: "Kotas", description: "Chips, polony, cheese, atchar and house sauces.", unitPrice: 45, emoji: "🥪", enabled: true },
    { id: "ITEM-M-02", merchantId: "MER-MIDRAND-01", name: "Loaded Kota", category: "Kotas", description: "Chips, cheese, russian, egg, bacon and house sauces.", unitPrice: 72, emoji: "🍔", enabled: true },
    { id: "ITEM-M-03", merchantId: "MER-MIDRAND-01", name: "Russian & Chips", category: "Meals", description: "Crispy chips, sliced russian and sauce.", unitPrice: 55, emoji: "🍟", enabled: true },
    { id: "ITEM-M-04", merchantId: "MER-MIDRAND-01", name: "Six Wings", category: "Meals", description: "Six grilled wings with your choice of sauce.", unitPrice: 68, emoji: "🍗", enabled: true },
    { id: "ITEM-M-05", merchantId: "MER-MIDRAND-01", name: "Cold Drink", category: "Drinks", description: "330ml cold drink.", unitPrice: 18, emoji: "🥤", enabled: true },

    { id: "ITEM-T-01", merchantId: "MER-TEMBISA-01", name: "Tembisa Special", category: "Kotas", description: "Chips, vienna, cheese, egg and house sauce.", unitPrice: 65, emoji: "🥪", enabled: true },
    { id: "ITEM-T-02", merchantId: "MER-TEMBISA-01", name: "Double Russian Kota", category: "Kotas", description: "Two russians, chips, cheese and atchar.", unitPrice: 78, emoji: "🌯", enabled: true },
    { id: "ITEM-T-03", merchantId: "MER-TEMBISA-01", name: "Chips", category: "Sides", description: "Fresh-cut chips with seasoning.", unitPrice: 28, emoji: "🍟", enabled: true },

    { id: "ITEM-C-01", merchantId: "MER-CENTURION-01", name: "Centurion Crunch", category: "Kotas", description: "Loaded kota with crunchy chicken strips.", unitPrice: 70, emoji: "🥙", enabled: true },
    { id: "ITEM-C-02", merchantId: "MER-CENTURION-01", name: "Cheese & Egg Kota", category: "Kotas", description: "Chips, cheese, egg, atchar and sauce.", unitPrice: 52, emoji: "🥪", enabled: true }
  ],

  promotions: [
    { id: "PROMO-01", code: "KOTA10", discountPercent: 10, minimumSpend: 50, status: "ACTIVE" }
  ],

  orders: [
    {
      id: "GK-1001",
      merchantId: "MER-MIDRAND-01",
      merchantNameSnapshot: "Kasi Corner Midrand",
      customer: { name: "Lebo", phone: "072 111 2233" },
      fulfilmentType: "COLLECTION",
      timing: "ASAP",
      scheduledAt: null,
      deliveryAddress: null,
      notes: "Extra atchar please",
      items: [
        { menuItemId: "ITEM-M-01", name: "Classic Kota", unitPrice: 45, quantity: 2 }
      ],
      pricing: { subtotal: 90, deliveryFee: 0, discount: 0, tip: 0, total: 90, promoCode: null },
      status: "PENDING",
      statusHistory: [{ status: "PENDING", at: new Date(now - 18 * 60 * 1000).toISOString() }],
      createdAt: new Date(now - 18 * 60 * 1000).toISOString()
    },
    {
      id: "GK-1002",
      merchantId: "MER-MIDRAND-01",
      merchantNameSnapshot: "Kasi Corner Midrand",
      customer: { name: "Nandi", phone: "083 222 3344" },
      fulfilmentType: "DELIVERY",
      timing: "ASAP",
      scheduledAt: null,
      deliveryAddress: "Demo address, Midrand",
      notes: "",
      items: [
        { menuItemId: "ITEM-M-02", name: "Loaded Kota", unitPrice: 72, quantity: 1 }
      ],
      pricing: { subtotal: 72, deliveryFee: 25, discount: 0, tip: 0, total: 97, promoCode: null },
      status: "PREPARING",
      statusHistory: [
        { status: "PENDING", at: new Date(now - 14 * 60 * 1000).toISOString() },
        { status: "ACCEPTED", at: new Date(now - 10 * 60 * 1000).toISOString() },
        { status: "PREPARING", at: new Date(now - 7 * 60 * 1000).toISOString() }
      ],
      createdAt: new Date(now - 14 * 60 * 1000).toISOString()
    }
  ]
};
