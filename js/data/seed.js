export const STANDARD = [
  { id: "local", name: "Local & independent", description: "A real local operator, not a generic chain listing." },
  { id: "kota", name: "Kota is core", description: "Kota is a meaningful part of the menu, not an afterthought." },
  { id: "consistency", name: "Consistent food", description: "Recent verified customer signal supports reliable quality." },
  { id: "value", name: "Fair value", description: "Portion, price and experience make sense for the local market." },
  { id: "readiness", name: "Ready to serve", description: "Current operating details, menu and customer hand-off are reliable." }
];

export const seed = {
  location: "Midrand",
  locations: ["Midrand", "Tembisa", "Centurion"],
  merchants: [
    {
      id: "m1", name: "Kasi Bites Midrand", area: "Halfway House, Midrand", address: "Halfway House, Midrand", distanceKm: 1.4,
      rating: 4.8, verifiedRatings: 284, prepMinutes: 14, priceBand: "R45–R95", online: true,
      standard: { local: true, kota: true, consistency: true, value: true, readiness: true },
      note: "Big flavour, crisp chips and a dependable classic kota.",
      tags: ["Classic", "Loaded", "Chicken"],
      menu: [
        { id: "p1", name: "Classic Kota", price: 4800, desc: "Chips, polony, cheese, atchar and house sauce.", emoji: "🥪", available: true },
        { id: "p2", name: "Loaded Kota", price: 7600, desc: "Chips, russian, egg, bacon, cheese and sauce.", emoji: "🍔", available: true },
        { id: "p3", name: "Chicken Kota", price: 8200, desc: "Crispy chicken, chips, cheese, slaw and chilli mayo.", emoji: "🍗", available: true }
      ]
    },
    {
      id: "m2", name: "Tembisa Kota House", area: "Ivory Park, Tembisa", address: "Ivory Park, Tembisa", distanceKm: 6.7,
      rating: 4.7, verifiedRatings: 191, prepMinutes: 18, priceBand: "R40–R90", online: true,
      standard: { local: true, kota: true, consistency: true, value: true, readiness: true },
      note: "Known for generous portions and a proper kasi-style build.",
      tags: ["Best value", "Russian", "Big portions"],
      menu: [
        { id: "p4", name: "Tembisa Special", price: 6900, desc: "Chips, russian, vienna, egg, cheese and atchar.", emoji: "🥪", available: true },
        { id: "p5", name: "Double Trouble", price: 8400, desc: "Double protein, chips, cheese, egg and atchar.", emoji: "🍔", available: true },
        { id: "p6", name: "Budget Kota", price: 4200, desc: "Chips, polony, atchar and sauce.", emoji: "🥪", available: true }
      ]
    },
    {
      id: "m3", name: "Centurion Kota Works", area: "The Reeds, Centurion", address: "The Reeds, Centurion", distanceKm: 10.9,
      rating: 4.6, verifiedRatings: 148, prepMinutes: 16, priceBand: "R55–R105", online: true,
      standard: { local: true, kota: true, consistency: true, value: true, readiness: true },
      note: "A cleaner modern take without losing the kota identity.",
      tags: ["Chicken", "Fresh", "Modern"],
      menu: [
        { id: "p7", name: "Centurion Crunch", price: 7200, desc: "Crunchy chicken strips, chips, cheese and sauce.", emoji: "🍗", available: true },
        { id: "p8", name: "Works Kota", price: 9400, desc: "Beef patty, russian, egg, cheese, chips and relish.", emoji: "🍔", available: true }
      ]
    },
    {
      id: "m4", name: "Ebony Park Corner", area: "Ebony Park, Midrand", address: "Ebony Park, Midrand", distanceKm: 3.8,
      rating: 4.2, verifiedRatings: 72, prepMinutes: 20, priceBand: "R40–R80", online: true,
      standard: { local: true, kota: true, consistency: false, value: true, readiness: true },
      note: "Popular local stop currently under GoodKota quality review.",
      tags: ["Local favourite", "Value"],
      menu: [
        { id: "p9", name: "Corner Classic", price: 4500, desc: "Chips, polony, cheese and atchar.", emoji: "🥪", available: true },
        { id: "p10", name: "Corner Loaded", price: 7500, desc: "Russian, egg, cheese, chips and sauce.", emoji: "🍔", available: true }
      ]
    }
  ],
  favourites: [],
  orders: [],
  candidates: [
    { id: "c1", name: "Ma-Lebo's Kota", area: "Rabie Ridge", checks: { local: true, kota: true, consistency: true, value: true, readiness: true } },
    { id: "c2", name: "Corner Grill Kota", area: "Olifantsfontein", checks: { local: true, kota: true, consistency: true, value: false, readiness: true } }
  ]
};
