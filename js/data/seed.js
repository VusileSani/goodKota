const ago = minutes => Date.now() - minutes * 60_000;
const inMinutes = minutes => Date.now() + minutes * 60_000;

const merchantDefaults = {
  enabled: true,
  prepMinutes: 20,
  deliveryFee: 20,
  minOrder: 30,
  delivery: { enabled: true, radiusKm: 7, providerPreference: "goodkota_fleet" },
  deliveryCapability: { ownDrivers: false, acceptsGoodKotaFleet: true, thirdPartyAllowed: true },
  gatewayAccount: { id: null, status: "not_configured" },
  settlement: { bankName: "", accountHolder: "", maskedAccount: "", status: "not_configured" },
  compliance: { status: "pending_review", note: "Awaiting GoodKota Office review" },
  qualityWorkflow: { status: "healthy", note: "" }
};

const makeMerchant = details => ({
  ...merchantDefaults,
  ...details,
  delivery: { ...merchantDefaults.delivery, ...(details.delivery || {}) },
  deliveryCapability: { ...merchantDefaults.deliveryCapability, ...(details.deliveryCapability || {}) },
  gatewayAccount: { ...merchantDefaults.gatewayAccount, ...(details.gatewayAccount || {}) },
  settlement: { ...merchantDefaults.settlement, ...(details.settlement || {}) },
  compliance: { ...merchantDefaults.compliance, ...(details.compliance || {}) },
  qualityWorkflow: { ...merchantDefaults.qualityWorkflow, ...(details.qualityWorkflow || {}) }
});

export const seed = {
  platform: {
    name: "GoodKota",
    paymentGateway: {
      provider: "Marketplace Gateway (demo adapter)",
      enabled: true,
      settlementModel: "direct_to_merchant",
      configuredBy: "GoodKota Office"
    },
    delivery: {
      enabled: true,
      operatingModel: "hybrid_ready",
      dispatchPolicy: "best_available_driver",
      trackingModel: "current_snapshot_plus_events",
      proofOfDelivery: "customer_pin",
      driverLocationRetention: "short_lived_operational_data",
      providerAdapters: ["goodkota_fleet", "merchant_fleet", "third_party_future"]
    }
  },
  users: [
    {
      id: "u_customer_1",
      role: "customer",
      name: "Demo Customer",
      phone: "071 000 0000",
      email: "customer@example.com",
      notificationPreferences: { nearbyQualityMerchants: false, orderUpdates: true, deliveryUpdates: true }
    }
  ],
  merchants: [
    makeMerchant({
      id: "m1",
      name: "Kasi Bites Midrand",
      legalName: "Kasi Bites (Pty) Ltd",
      contact: { email: "midrand@kasibites.example" },
      address: "Midrand, Gauteng",
      area: "Midrand",
      latitude: -25.9992,
      longitude: 28.1263,
      prepMinutes: 18,
      deliveryFee: 24,
      minOrder: 35,
      delivery: { enabled: true, radiusKm: 8, providerPreference: "goodkota_fleet" },
      gatewayAccount: { id: "sub_demo_001", status: "verified" },
      settlement: { bankName: "Demo Bank", accountHolder: "Kasi Bites (Pty) Ltd", maskedAccount: "•••• 4821", status: "verified" },
      compliance: { status: "compliant", note: "GoodKota merchant requirements verified" }
    }),
    makeMerchant({
      id: "m2",
      name: "Tembisa Kota Co.",
      legalName: "Tembisa Kota Company (Pty) Ltd",
      contact: { email: "orders@tembisakota.example" },
      address: "Tembisa, Gauteng",
      area: "Tembisa",
      latitude: -25.9964,
      longitude: 28.2268,
      prepMinutes: 22,
      deliveryFee: 20,
      minOrder: 30,
      delivery: { enabled: true, radiusKm: 7, providerPreference: "merchant_fleet" },
      deliveryCapability: { ownDrivers: true, acceptsGoodKotaFleet: true, thirdPartyAllowed: true },
      gatewayAccount: { id: "sub_demo_002", status: "verified" },
      settlement: { bankName: "Demo Bank", accountHolder: "Tembisa Kota Company (Pty) Ltd", maskedAccount: "•••• 1954", status: "verified" },
      compliance: { status: "compliant", note: "GoodKota merchant requirements verified" }
    }),
    makeMerchant({
      id: "m3",
      name: "Centurion Kota Works",
      legalName: "Centurion Kota Works CC",
      contact: { email: "hello@centurionkota.example" },
      address: "Centurion, Gauteng",
      area: "Centurion",
      latitude: -25.8603,
      longitude: 28.1894,
      prepMinutes: 25,
      deliveryFee: 28,
      minOrder: 40,
      delivery: { enabled: true, radiusKm: 9, providerPreference: "goodkota_fleet" },
      gatewayAccount: { id: "sub_demo_003", status: "pending" },
      settlement: { status: "pending" },
      compliance: { status: "pending_review", note: "Merchant verification still in progress" },
      qualityWorkflow: { status: "watch", note: "Monitor food consistency" }
    }),
    makeMerchant({
      id: "m4",
      name: "Kasi Bites Ivory Park",
      legalName: "Kasi Bites (Pty) Ltd",
      contact: { email: "ivorypark@kasibites.example" },
      address: "Ivory Park, Gauteng",
      area: "Ivory Park",
      latitude: -25.9869,
      longitude: 28.1974,
      prepMinutes: 20,
      deliveryFee: 22,
      minOrder: 35,
      delivery: { enabled: true, radiusKm: 6, providerPreference: "goodkota_fleet" },
      gatewayAccount: { id: "sub_demo_004", status: "verified" },
      settlement: { bankName: "Demo Bank", accountHolder: "Kasi Bites (Pty) Ltd", maskedAccount: "•••• 4821", status: "verified" },
      compliance: { status: "compliant", note: "GoodKota merchant requirements verified" },
      qualityWorkflow: { status: "intervention", note: "Corrective action: improve holding times and chips freshness" }
    })
  ],
  products: [
    { id: "p1", merchantId: "m1", name: "Classic Kota", price: 48, category: "Kotas", desc: "Chips, polony, cheese, atchar and house sauces.", emoji: "🥪", enabled: true },
    { id: "p2", merchantId: "m1", name: "Loaded Kota", price: 76, category: "Kotas", desc: "Chips, cheese, russian, egg, bacon and sauces.", emoji: "🍔", enabled: true },
    { id: "p3", merchantId: "m1", name: "Russian & Chips", price: 58, category: "Meals", desc: "Crispy chips with sliced russian and sauce.", emoji: "🍟", enabled: true },
    { id: "p4", merchantId: "m2", name: "Tembisa Special", price: 69, category: "Kotas", desc: "Chips, vienna, cheese, egg and signature sauce.", emoji: "🥪", enabled: true },
    { id: "p5", merchantId: "m2", name: "Double Trouble", price: 84, category: "Kotas", desc: "Double protein, chips, cheese, egg and atchar.", emoji: "🍔", enabled: true },
    { id: "p6", merchantId: "m3", name: "Centurion Crunch", price: 72, category: "Kotas", desc: "Loaded kota with crunchy chicken strips.", emoji: "🥙", enabled: true },
    { id: "p7", merchantId: "m1", name: "Soft Drink", price: 20, category: "Drinks", desc: "330ml cold drink.", emoji: "🥤", enabled: true },
    { id: "p8", merchantId: "m4", name: "Classic Kota", price: 48, category: "Kotas", desc: "Chips, polony, cheese, atchar and house sauces.", emoji: "🥪", enabled: true },
    { id: "p9", merchantId: "m4", name: "Loaded Kota", price: 76, category: "Kotas", desc: "Chips, cheese, russian, egg, bacon and sauces.", emoji: "🍔", enabled: true },
    { id: "p10", merchantId: "m4", name: "Russian & Chips", price: 58, category: "Meals", desc: "Crispy chips with sliced russian and sauce.", emoji: "🍟", enabled: true },
    { id: "p11", merchantId: "m4", name: "Soft Drink", price: 20, category: "Drinks", desc: "330ml cold drink.", emoji: "🥤", enabled: true }
  ],
  orders: [
    {
      id: "GK2001", customerId: "u_customer_1", merchantId: "m1", customer: "Demo Customer",
      phone: "071 000 0000", email: "customer@example.com", mode: "Takeaway", amount: 96,
      fulfilment: { type: "pickup" },
      status: "completed", paymentStatus: "paid", createdAt: ago(60 * 24 * 2),
      items: [{ productId: "p1", name: "Classic Kota", qty: 2, price: 48 }], rated: false
    },
    {
      id: "GK2002", customerId: "u_customer_1", merchantId: "m2", customer: "Demo Customer",
      phone: "071 000 0000", email: "customer@example.com", mode: "Takeaway", amount: 69,
      fulfilment: { type: "pickup" },
      status: "accepted", paymentStatus: "paid", createdAt: ago(34),
      items: [{ productId: "p4", name: "Tembisa Special", qty: 1, price: 69 }], rated: false
    },
    {
      id: "GK2003", customerId: "u_customer_1", merchantId: "m1", customer: "Demo Customer",
      phone: "071 000 0000", email: "customer@example.com", mode: "Home Delivery", amount: 100,
      deliveryFee: 24,
      fulfilment: {
        type: "delivery",
        provider: "goodkota_fleet",
        destination: { address: "Demo delivery address, Midrand", latitude: -26.0072, longitude: 28.1205 }
      },
      status: "out_for_delivery", paymentStatus: "paid", createdAt: ago(28),
      items: [{ productId: "p2", name: "Loaded Kota", qty: 1, price: 76 }], rated: false
    }
  ],
  payments: [],
  drivers: [
    {
      id: "d1", name: "Neo M.", phone: "071 555 0101", operatorType: "goodkota", operatorId: "goodkota",
      enabled: true, shiftStatus: "online", availability: "busy", vehicleId: "v1", activeTaskId: "dt1",
      rating: 4.9, completedDeliveries: 184, trackingConsent: true
    },
    {
      id: "d2", name: "Lerato K.", phone: "071 555 0102", operatorType: "goodkota", operatorId: "goodkota",
      enabled: true, shiftStatus: "online", availability: "available", vehicleId: "v2", activeTaskId: null,
      rating: 4.8, completedDeliveries: 126, trackingConsent: true
    },
    {
      id: "d3", name: "Sello T.", phone: "071 555 0103", operatorType: "merchant", operatorId: "m2",
      enabled: true, shiftStatus: "online", availability: "available", vehicleId: "v3", activeTaskId: null,
      rating: 4.7, completedDeliveries: 91, trackingConsent: true
    }
  ],
  driverVehicles: [
    { id: "v1", driverId: "d1", type: "motorbike", registration: "GK 01 DEMO", enabled: true },
    { id: "v2", driverId: "d2", type: "motorbike", registration: "GK 02 DEMO", enabled: true },
    { id: "v3", driverId: "d3", type: "scooter", registration: "TM 03 DEMO", enabled: true }
  ],
  driverLocations: [
    { driverId: "d1", latitude: -26.0028, longitude: 28.1232, accuracyMeters: 14, heading: 220, recordedAt: ago(1) },
    { driverId: "d2", latitude: -25.9950, longitude: 28.1315, accuracyMeters: 10, heading: 70, recordedAt: ago(2) },
    { driverId: "d3", latitude: -25.9984, longitude: 28.2252, accuracyMeters: 12, heading: 180, recordedAt: ago(2) }
  ],
  deliveryTasks: [
    {
      id: "dt1", orderId: "GK2003", merchantId: "m1", providerType: "goodkota_fleet",
      status: "en_route", assignedDriverId: "d1", assignmentId: "da1", deliveryFee: 24,
      pickup: { address: "Kasi Bites Midrand, Midrand, Gauteng", latitude: -25.9992, longitude: 28.1263 },
      dropoff: { address: "Demo delivery address, Midrand", latitude: -26.0072, longitude: 28.1205 },
      verification: { method: "pin", demoPin: "4827" },
      createdAt: ago(28), readyAt: ago(18), assignedAt: ago(16), pickedUpAt: ago(7), estimatedArrivalAt: inMinutes(8), deliveredAt: null
    }
  ],
  deliveryAssignments: [
    { id: "da1", taskId: "dt1", driverId: "d1", status: "active", assignedBy: "dispatch_demo", assignedAt: ago(16) }
  ],
  deliveryEvents: [
    { id: "de1", taskId: "dt1", type: "delivery_created", message: "Delivery task created", actorType: "system", actorId: "goodkota", createdAt: ago(28) },
    { id: "de2", taskId: "dt1", type: "merchant_ready", message: "Merchant marked order ready", actorType: "merchant", actorId: "m1", createdAt: ago(18) },
    { id: "de3", taskId: "dt1", type: "driver_assigned", message: "Neo M. assigned", actorType: "dispatch", actorId: "goodkota", createdAt: ago(16) },
    { id: "de4", taskId: "dt1", type: "pickup_confirmed", message: "Order collected from merchant", actorType: "driver", actorId: "d1", createdAt: ago(7) },
    { id: "de5", taskId: "dt1", type: "en_route", message: "Driver is on the way", actorType: "driver", actorId: "d1", createdAt: ago(6) }
  ],
  proofsOfDelivery: [],
  ratings: [
    {id:"r1",merchantId:"m1",orderId:"hist1",verified:true,overall:5,food:5,service:4,comment:"Fresh and excellent.",createdAt:ago(3000)},
    {id:"r2",merchantId:"m1",orderId:"hist2",verified:true,overall:4,food:5,service:4,comment:"Good portion.",createdAt:ago(2500)},
    {id:"r3",merchantId:"m1",orderId:"hist3",verified:true,overall:5,food:5,service:5,comment:"",createdAt:ago(2200)},
    {id:"r4",merchantId:"m1",orderId:"hist4",verified:true,overall:4,food:4,service:4,comment:"",createdAt:ago(1800)},
    {id:"r5",merchantId:"m1",orderId:"hist5",verified:true,overall:5,food:5,service:5,comment:"",createdAt:ago(1500)},
    {id:"r6",merchantId:"m1",orderId:"hist6",verified:true,overall:4,food:4,service:5,comment:"",createdAt:ago(900)},
    {id:"r7",merchantId:"m2",orderId:"hist7",verified:true,overall:5,food:5,service:5,comment:"",createdAt:ago(2800)},
    {id:"r8",merchantId:"m2",orderId:"hist8",verified:true,overall:5,food:5,service:4,comment:"",createdAt:ago(2200)},
    {id:"r9",merchantId:"m2",orderId:"hist9",verified:true,overall:4,food:4,service:4,comment:"",createdAt:ago(1900)},
    {id:"r10",merchantId:"m2",orderId:"hist10",verified:true,overall:5,food:5,service:5,comment:"",createdAt:ago(1400)},
    {id:"r11",merchantId:"m2",orderId:"hist11",verified:true,overall:4,food:5,service:4,comment:"",createdAt:ago(1100)},
    {id:"r12",merchantId:"m3",orderId:"hist12",verified:true,overall:4,food:4,service:4,comment:"",createdAt:ago(3000)},
    {id:"r13",merchantId:"m3",orderId:"hist13",verified:true,overall:3,food:3,service:4,comment:"",createdAt:ago(2500)},
    {id:"r14",merchantId:"m3",orderId:"hist14",verified:true,overall:3,food:3,service:3,comment:"",createdAt:ago(1900)},
    {id:"r15",merchantId:"m3",orderId:"hist15",verified:true,overall:4,food:4,service:4,comment:"",createdAt:ago(1200)},
    {id:"r16",merchantId:"m3",orderId:"hist16",verified:true,overall:3,food:3,service:4,comment:"",createdAt:ago(800)},
    {id:"r17",merchantId:"m4",orderId:"hist17",verified:true,overall:2,food:2,service:4,comment:"Chips were cold.",createdAt:ago(2000)},
    {id:"r18",merchantId:"m4",orderId:"hist18",verified:true,overall:2,food:2,service:3,comment:"Cold chips again.",createdAt:ago(1600)},
    {id:"r19",merchantId:"m4",orderId:"hist19",verified:true,overall:3,food:2,service:4,comment:"Service good, food inconsistent.",createdAt:ago(1200)},
    {id:"r20",merchantId:"m4",orderId:"hist20",verified:true,overall:2,food:2,service:4,comment:"",createdAt:ago(900)},
    {id:"r21",merchantId:"m4",orderId:"hist21",verified:true,overall:4,food:4,service:4,comment:"Much better.",createdAt:ago(600)}
  ],
  promos: [{ id: "promo1", code: "KOTA10", discount: 10, min: 60, status: "active" }]
};
