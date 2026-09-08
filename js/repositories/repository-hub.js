import { pageResult } from "../core/utils.js";
import { distanceKm } from "../services/location-service.js";
import { rankNearbyMerchants } from "../services/recommendation-service.js";
import { boundingBox } from "../services/geohash-service.js";

function byId(items, id) {
  return items.find(item => item.id === id) || null;
}

function inBox(item, box) {
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= box.minLat && lat <= box.maxLat
    && lng >= box.minLng && lng <= box.maxLng;
}

export class RepositoryHub {
  constructor(store) {
    this.store = store;

    this.platform = {
      get: () => this.store.state.platform,
      controls: () => ({ ...(this.store.state.platform?.controls || {}) }),
      paymentGateway: () => ({ ...(this.store.state.platform?.paymentGateway || {}) }),
      brand: () => ({ ...(this.store.state.platform?.brand || {}), social: { ...(this.store.state.platform?.brand?.social || {}) } }),
      summary: () => ({ ...(this.store.state.materialized?.platformSummary || {}) })
    };

    this.users = {
      customer: () => this.store.state.users.find(user => user.role === "customer") || null,
      get: id => byId(this.store.state.users, id)
    };

    this.merchants = {
      get: id => byId(this.store.state.merchants, id),
      first: () => this.store.state.merchants[0] || null,
      list: options => this.listMerchants(options),
      nearby: (origin, options) => this.listNearbyMerchants(origin, options)
    };

    this.products = {
      get: id => byId(this.store.state.products, id),
      listForMerchant: (merchantId, options = {}) => pageResult(
        this.store.state.products.filter(product => product.merchantId === merchantId && (options.enabled === undefined || product.enabled === options.enabled)),
        { limit: options.limit || 100, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      )
    };

    this.orders = {
      get: id => byId(this.store.state.orders, id),
      listForCustomer: (customerId, options = {}) => pageResult(
        this.store.state.orders.filter(order => order.customerId === customerId && (!options.status || [].concat(options.status).includes(order.status))),
        { limit: options.limit || 10, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      ),
      listForMerchant: (merchantId, options = {}) => pageResult(
        this.store.state.orders.filter(order => order.merchantId === merchantId && (!options.status || [].concat(options.status).includes(order.status))),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      ),
      listAll: (options = {}) => pageResult(
        this.store.state.orders.filter(order => {
          if (options.status && ![].concat(options.status).includes(order.status)) return false;
          if (options.merchantId && order.merchantId !== options.merchantId) return false;
          if (options.query) {
            const merchant = byId(this.store.state.merchants, order.merchantId);
            const hay = `${order.orderNumber || order.id} ${order.customer || ""} ${merchant?.name || ""}`.toLowerCase();
            if (!hay.includes(String(options.query).toLowerCase())) return false;
          }
          return true;
        }),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      )
    };

    this.delivery = {
      task: id => byId(this.store.state.deliveryTasks, id),
      taskForOrder: orderId => this.store.state.deliveryTasks.find(task => task.orderId === orderId) || null,
      listQueue: (options = {}) => pageResult(
        this.store.state.deliveryTasks.filter(task => !options.statuses || options.statuses.includes(task.status)),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: options.sortBy || "createdAt", direction: "desc" }
      ),
      driver: id => byId(this.store.state.drivers, id),
      vehicle: id => byId(this.store.state.driverVehicles, id),
      listDrivers: (options = {}) => pageResult(
        this.store.state.drivers.filter(driver => {
          if (options.operatorType && driver.operatorType !== options.operatorType) return false;
          if (options.operatorId && driver.operatorId !== options.operatorId) return false;
          if (options.shiftStatus && driver.shiftStatus !== options.shiftStatus) return false;
          if (options.availability && driver.availability !== options.availability) return false;
          if (options.enabled !== undefined && driver.enabled !== options.enabled) return false;
          return true;
        }),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      ),
      currentLocation: driverId => this.store.state.driverLocations.find(item => item.driverId === driverId) || null,
      events: (taskId, options = {}) => pageResult(
        this.store.state.deliveryEvents.filter(event => event.taskId === taskId),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: options.direction || "asc" }
      ),
      recommendDrivers: (task, options = {}) => this.recommendDrivers(task, options)
    };

    this.promotions = {
      get: id => byId(this.store.state.promos, id),
      byCode: code => this.store.state.promos.find(item => item.code === String(code || "").trim().toUpperCase()) || null,
      list: (options = {}) => pageResult(
        this.store.state.promos.filter(item => options.status ? item.status === options.status : true),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      )
    };

    this.applications = {
      merchants: (options = {}) => pageResult(
        this.store.state.merchantApplications.filter(item => !options.status || item.status === options.status),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      ),
      drivers: (options = {}) => pageResult(
        this.store.state.driverApplications.filter(item => !options.status || item.status === options.status),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      ),
      merchant: id => byId(this.store.state.merchantApplications, id),
      driver: id => byId(this.store.state.driverApplications, id),
      waitlist: (options = {}) => pageResult(this.store.state.waitlistEntries, { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" })
    };

    this.governance = {
      staff: (options = {}) => pageResult(
        this.store.state.platformStaff.filter(person => options.active === undefined || (person.active !== false) === Boolean(options.active)),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      ),
      actor: role => this.store.state.platformStaff.find(person => person.role === role && person.active !== false) || null,
      supportCases: (options = {}) => pageResult(
        this.store.state.supportCases.filter(item => {
          if (options.status && ![].concat(options.status).includes(item.status)) return false;
          if (options.priority && item.priority !== options.priority) return false;
          if (options.merchantId && item.merchantId !== options.merchantId) return false;
          return true;
        }),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "updatedAt", direction: "desc" }
      ),
      supportCase: id => byId(this.store.state.supportCases, id),
      supportEvents: (caseId, options = {}) => pageResult(
        this.store.state.supportCaseEvents.filter(event => event.caseId === caseId),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "asc" }
      ),
      announcements: (options = {}) => pageResult(
        this.store.state.announcements.filter(item => options.active === undefined || (item.active !== false) === Boolean(options.active)),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      ),
      latestAnnouncement: audience => pageResult(
        this.store.state.announcements.filter(item => item.active !== false && ["all", audience].includes(item.audience)),
        { limit: 1, sortBy: "createdAt", direction: "desc" }
      ).items[0] || null,
      audit: (options = {}) => pageResult(
        this.store.state.auditTrail.filter(item => !options.visibility || [].concat(options.visibility).includes(item.visibility)),
        { limit: options.limit || 80, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      ),
      operationalAlerts: (options = {}) => pageResult(
        this.store.state.operationalAlerts.filter(item => !options.status || item.status === options.status),
        { limit: options.limit || 50, cursor: options.cursor, sortBy: "createdAt", direction: "desc" }
      ),
      adminOverview: () => {
        const attention = this.store.state.materialized?.attention || {};
        return {
          summary: { ...(this.store.state.materialized?.platformSummary || {}) },
          qualityAlerts: (attention.qualityMerchantIds || []).slice(0, 20).map(id => byId(this.store.state.merchants, id)).filter(Boolean),
          settlementAttention: (attention.settlementMerchantIds || []).slice(0, 20).map(id => byId(this.store.state.merchants, id)).filter(Boolean),
          commercialAttention: (attention.commercialMerchantIds || []).slice(0, 20).map(id => byId(this.store.state.merchants, id)).filter(Boolean),
          dispatchAttention: (attention.dispatchTaskIds || []).slice(0, 20).map(id => byId(this.store.state.deliveryTasks, id)).filter(Boolean)
        };
      },
      ownerIntegrity: () => {
        const attention = this.store.state.materialized?.attention || {};
        return {
          summary: { ...(this.store.state.materialized?.platformSummary || {}) },
          openCases: (attention.openSupportCaseIds || []).slice(0, 20).map(id => byId(this.store.state.supportCases, id)).filter(Boolean),
          settlementAttention: (attention.settlementMerchantIds || []).slice(0, 20).map(id => byId(this.store.state.merchants, id)).filter(Boolean),
          qualityAttention: (attention.qualityMerchantIds || []).slice(0, 20).map(id => byId(this.store.state.merchants, id)).filter(Boolean),
          commercialAttention: (attention.commercialMerchantIds || []).slice(0, 20).map(id => byId(this.store.state.merchants, id)).filter(Boolean),
          activeDeliveries: pageResult(this.store.state.deliveryTasks.filter(task => !["delivered", "cancelled"].includes(task.status)), { limit: 50, sortBy: "createdAt", direction: "desc" }).items,
          operationalAlerts: pageResult(this.store.state.operationalAlerts.filter(item => item.status === "open"), { limit: 20, sortBy: "createdAt", direction: "desc" }).items,
          controls: { ...(this.store.state.platform?.controls || {}) },
          platform: { ...(this.store.state.platform || {}) }
        };
      }

    };
  }

  listMerchants(options = {}) {
    const query = String(options.query || "").trim().toLowerCase();
    const filtered = this.store.state.merchants.filter(merchant => {
      if (options.enabled !== undefined && merchant.enabled !== options.enabled) return false;
      if (options.complianceStatus && merchant.compliance?.status !== options.complianceStatus) return false;
      if (options.commercialStatus && merchant.commercial?.status !== options.commercialStatus) return false;
      if (query && !`${merchant.name} ${merchant.area} ${merchant.address}`.toLowerCase().includes(query)) return false;
      return true;
    });
    return pageResult(filtered, { limit: options.limit || 50, cursor: options.cursor, sortBy: options.sortBy || "createdAt", direction: options.direction || "desc" });
  }

  listNearbyMerchants(origin, { radiusKm = 35, limit = 30 } = {}) {
    const box = boundingBox(origin, radiusKm);
    const candidates = this.store.state.merchants
      .filter(merchant => merchant.enabled && merchant.qualityWorkflow?.status !== "suspended" && merchant.commercial?.status !== "suspended")
      .filter(merchant => inBox(merchant, box))
      .map(merchant => ({ ...merchant, distanceKm: distanceKm(origin, { lat: Number(merchant.latitude), lng: Number(merchant.longitude) }) }))
      .filter(merchant => merchant.distanceKm <= radiusKm);
    return { items: rankNearbyMerchants(candidates, { radiusKm, limit }), nextCursor: null, hasMore: false };
  }

  recommendDrivers(task, { radiusKm = 25, limit = 10 } = {}) {
    const pickup = { lat: Number(task.pickup.latitude), lng: Number(task.pickup.longitude) };
    const box = boundingBox(pickup, radiusKm);
    const merchant = this.merchants.get(task.merchantId);
    const candidates = this.store.state.drivers
      .filter(driver => driver.enabled && driver.shiftStatus === "online" && driver.availability === "available")
      .filter(driver => {
        if (task.providerType === "merchant_fleet") return driver.operatorType === "merchant" && driver.operatorId === task.merchantId;
        if (task.providerType === "yagoya_fleet") return driver.operatorType === "yagoya";
        if (task.providerType === "hybrid") return driver.operatorType === "yagoya" || (driver.operatorType === "merchant" && driver.operatorId === merchant?.id);
        return true;
      })
      .map(driver => ({ driver, location: this.delivery.currentLocation(driver.id) }))
      .filter(entry => entry.location && inBox(entry.location, box))
      .map(entry => ({ ...entry, distanceToPickupKm: distanceKm({ lat: entry.location.latitude, lng: entry.location.longitude }, pickup) }))
      .filter(entry => entry.distanceToPickupKm <= radiusKm)
      .sort((a, b) => a.distanceToPickupKm - b.distanceToPickupKm)
      .slice(0, Math.max(1, Math.min(limit, 25)));
    return candidates;
  }
}
