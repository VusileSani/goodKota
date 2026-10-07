import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { seed } from "../js/data/seed.js";
import { buildPickupOrder } from "../js/core/checkout.js";
import { merchantExperience, rateCompletedOrder } from "../js/core/feedback.js";
import { submitApplication, reviewApplication, saveMerchant, reviewMerchant, setMerchantStatus, setQuality, transitionOrder, requestRefundReview, reviewRefundRequest, createCase, updateCase } from "../js/core/operations.js";
import { submitPayfastAccount, reviewPayfastAccount } from "../js/core/payfast-onboarding.js";

const clean = value => String(value ?? "").trim();
const short = (value, limit) => clean(value).length <= limit;
const publicMerchant = merchant => {
  const {id,name,area,address,distanceKm,prepMinutes,online,listingStatus,standard,note,tags,menu} = merchant;
  return {id,name,area,address,distanceKm,prepMinutes,online,listingStatus,standard,note,tags,menu};
};

export function createStateRepository({dataDir,storage} = {}) {
  if (!dataDir && !storage) throw new Error("State data directory or durable storage is required.");
  const file = dataDir ? join(dataDir, "state.json") : "";
  let state;
  let loading;
  let queue = Promise.resolve();
  const normalize = current => {
    state = current || {...structuredClone(seed),events:[],profiles:{}};
    state.profiles ||= {};
    state.events ||= [];
    state.revision ||= 0;
    state.merchants.forEach(merchant => {
      merchant.address ||= merchant.area;
      merchant.listingStatus ||= "active";
      merchant.quality ||= {status:"healthy",note:""};
      merchant.contact ||= {name:"",phone:"",email:""};
      merchant.payfast ||= {status:"not_started",accountType:"",merchantId:"",reviewNote:""};
      merchant.tags ||= [];
      merchant.menu ||= [];
    });
    return state;
  };
  const load = () => loading ||= (async () => {
    let current;
    try { current = JSON.parse(await readFile(file, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    return normalize(current);
  })();
  const save = async () => {
    await mkdir(dataDir, {recursive:true,mode:0o700});
    const temp = join(dataDir, `state-${randomBytes(12).toString("hex")}.tmp`);
    await writeFile(temp, JSON.stringify(state), {flag:"wx",mode:0o600});
    await rename(temp, file);
  };
  const store = () => ({state,merchant:id => state.merchants.find(m => m.id === id),log(type,payload) {
    state.events.push({type,payload,at:new Date().toISOString()});
    state.events = state.events.slice(-1000);
  }});
  const snapshotFromState = user => {
    const common = {revision:state.revision,accountId:user?.id || null,location:"Midrand",locations:["Midrand","Tembisa","Centurion"],role:user?.role || "customer",customerTab:"discover",merchantTab:"orders",adminTab:"overview",selectedMerchantId:null,search:"",filter:"All",cart:[],favourites:[],customerDetails:{firstName:"",lastName:"",phone:"",email:""},events:[],applications:[],supportCases:[],orders:[],merchantId:user?.merchantId || ""};
    if (user?.role === "admin") return {...common,...structuredClone(state),role:"admin",merchantId:state.merchants[0]?.id || ""};
    if (user?.role === "merchant") return {...common,merchants:structuredClone(state.merchants.filter(m => m.id === user.merchantId)),orders:structuredClone(state.orders.filter(o => o.merchantId === user.merchantId)),supportCases:structuredClone(state.supportCases.filter(c => c.merchantId === user.merchantId))};
    const profile = state.profiles[user?.id] || {};
    return {...common,merchants:state.merchants.filter(m => m.listingStatus === "active").map(m => ({...publicMerchant(m),feedbackSummary:merchantExperience(state,m.id)})),orders:user ? structuredClone(state.orders.filter(o => o.customerId === user.id)) : [],favourites:profile.favourites || [],customerDetails:profile.customerDetails || common.customerDetails};
  };
  const snapshot = async user => {
    if (storage) { await queue; normalize(await storage.read()); }
    else await load();
    return snapshotFromState(user);
  };
  const apply = async (user, type, payload = {}) => {
    if (!user || !["customer","merchant","admin"].includes(user.role)) throw new Error("Sign in to continue.");
    if (!user.emailVerified && (user.role === "merchant" || ["pickup_order_created","application_submitted","order_experience_rated"].includes(type))) throw new Error("Verify your email to continue.");
    const result = queue.then(async () => {
      if (!storage) await load();
      const change = async () => {
      const s = store();
      const ownMerchant = id => {
        if (user.role !== "admin" && (user.role !== "merchant" || user.merchantId !== id)) throw new Error("This store is not assigned to your account.");
      };
      const ownOrder = id => {
        const order = state.orders.find(o => o.id === id);
        if (!order || (user.role !== "admin" && (user.role !== "merchant" || order.merchantId !== user.merchantId))) throw new Error("Order unavailable.");
        return order;
      };
      const admin = () => { if (user.role !== "admin") throw new Error("GoodKota admin access required."); };
      const before = structuredClone(state);
      try {
      switch (type) {
        case "application_submitted":
          if (!["customer","admin"].includes(user.role)) throw new Error("Customer access required.");
          if (!payload.fields || !short(payload.fields.businessName,80) || !short(payload.fields.contactName,80) || !short(payload.fields.area,80) || !short(payload.fields.address,200) || !short(payload.fields.note,1000) || !short(payload.fields.phone,30) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(payload.fields.email))) throw new Error("Check the merchant application details.");
          submitApplication(s,payload.fields); break;
        case "application_reviewed":
          admin(); reviewApplication(s,payload.applicationId,payload.decision,payload.fields,payload.reason); break;
        case "merchant_updated":
          ownMerchant(payload.merchantId);
          if (!payload.fields || !short(payload.fields.name,80) || !short(payload.fields.address,200) || !short(payload.fields.area,80) || !short(payload.fields.contactName,80) || !short(payload.fields.phone,30) || !short(payload.fields.email,254)) throw new Error("Check the store details.");
          saveMerchant(s,payload.merchantId,payload.fields); break;
        case "merchant_standard_reviewed":
          admin(); reviewMerchant(s,payload.merchantId,payload.checks,payload.reason); break;
        case "merchant_status_changed":
          admin(); setMerchantStatus(s,payload.merchantId,payload.status,payload.reason); break;
        case "merchant_quality_changed":
          admin(); setQuality(s,payload.merchantId,payload.status,payload.reason); break;
        case "merchant_availability_changed": {
          ownMerchant(payload.merchantId);
          const merchant = s.merchant(payload.merchantId);
          if (merchant?.listingStatus !== "active" || typeof payload.online !== "boolean") throw new Error("Store availability cannot change.");
          merchant.online = payload.online; s.log(type,{merchantId:merchant.id,online:merchant.online}); break;
        }
        case "merchant_item_availability_changed": {
          ownMerchant(payload.merchantId);
          const item = s.merchant(payload.merchantId)?.menu.find(i => i.id === payload.productId);
          if (!item || typeof payload.available !== "boolean") throw new Error("Menu item unavailable.");
          item.available = payload.available; s.log(type,{merchantId:payload.merchantId,productId:item.id,available:item.available}); break;
        }
        case "merchant_menu_saved": {
          ownMerchant(payload.merchantId);
          const merchant = s.merchant(payload.merchantId);
          const item = payload.item || {};
          if (!merchant || !/^[\w-]{2,80}$/.test(item.id || "") || !clean(item.name) || clean(item.name).length > 80 || !clean(item.desc) || clean(item.desc).length > 220 || !Number.isSafeInteger(item.price) || item.price < 100 || item.price > 999900 || typeof item.available !== "boolean" || !Array.isArray(item.choices) || item.choices.length > 30 || new Set(item.choices.map(c => c.id)).size !== item.choices.length || item.choices.some(c => !/^[\w-]{2,80}$/.test(c.id || "") || !clean(c.name) || clean(c.name).length > 50 || !["add","remove","select"].includes(c.kind) || (c.kind === "select" && !clean(c.group)) || !Number.isSafeInteger(c.price) || c.price < 0 || c.price > 99900 || (c.kind === "remove" && c.price !== 0))) throw new Error("Review the menu item and choices.");
          if (state.merchants.some(m => m.id !== merchant.id && m.menu.some(i => i.id === item.id))) throw new Error("Menu item ID is already in use.");
          const saved = {id:item.id,name:clean(item.name),desc:clean(item.desc),price:item.price,emoji:["🥪","🍔","🍗"].includes(item.emoji) ? item.emoji : "🥪",available:item.available,choices:item.choices.map(c => ({id:c.id,name:clean(c.name),kind:c.kind,group:c.kind === "select" ? clean(c.group).slice(0,40) : "",price:c.price,available:c.available !== false}))};
          const index = merchant.menu.findIndex(i => i.id === item.id);
          if (index < 0) merchant.menu.push(saved); else merchant.menu[index] = saved;
          s.log(type,{merchantId:merchant.id,productId:saved.id}); break;
        }
        case "payfast_account_submitted":
          ownMerchant(payload.merchantId); submitPayfastAccount(s,payload.merchantId,payload.fields); break;
        case "payfast_account_reviewed":
          admin(); reviewPayfastAccount(s,payload.merchantId,payload.status,payload.note); break;
        case "pickup_order_created": {
          if (user.role !== "customer") throw new Error("Customer access required.");
          if (!/^GK-[0-9A-F]{16}$/.test(payload.requestId || "")) throw new Error("Order reference is invalid.");
          if (state.orders.some(o => o.customerId === user.id && o.requestId === payload.requestId)) break;
          const merchant = s.merchant(payload.merchantId);
          const order = buildPickupOrder(payload.details,merchant,payload.cart);
          order.customerId = user.id;
          order.requestId = payload.requestId;
          state.orders.unshift(order);
          state.profiles[user.id] = {...(state.profiles[user.id] || {}),customerDetails:order.customerDetails};
          s.log(type,{orderId:order.id,merchantId:merchant.id,customerId:user.id}); break;
        }
        case "order_status_changed":
          ownOrder(payload.orderId); transitionOrder(s,payload.orderId,payload.status,payload.reason); break;
        case "refund_review_requested":
          ownOrder(payload.orderId); requestRefundReview(s,user.merchantId,payload.orderId,payload.fields); break;
        case "refund_review_updated":
          admin(); reviewRefundRequest(s,payload.orderId,payload.status,payload.note,payload.outcome,payload.externalReference); break;
        case "order_experience_rated": {
          if (user.role !== "customer" || !state.orders.some(o => o.id === payload.orderId && o.customerId === user.id)) throw new Error("Order unavailable.");
          rateCompletedOrder(s,payload.orderId,payload.value); break;
        }
        case "support_case_opened":
          ownMerchant(payload.merchantId);
          if (!short(payload.subject,80) || !short(payload.message,1000)) throw new Error("Keep the support request brief.");
          createCase(s,payload.merchantId,payload.subject,payload.message); break;
        case "support_case_updated":
          admin(); updateCase(s,payload.caseId,payload.status,payload.note); break;
        case "favourite_toggle": {
          if (user.role !== "customer" || !state.merchants.some(m => m.id === payload.merchantId && m.listingStatus === "active")) throw new Error("Spot unavailable.");
          const profile = state.profiles[user.id] ||= {};
          const saved = new Set(profile.favourites || []);
          saved.has(payload.merchantId) ? saved.delete(payload.merchantId) : saved.add(payload.merchantId);
          profile.favourites = [...saved]; break;
        }
        case "customer_details_saved": {
          if (user.role !== "customer") throw new Error("Customer access required.");
          const details = payload.fields || {};
          if (!clean(details.firstName) || !clean(details.phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(details.email))) throw new Error("Check your contact details.");
          state.profiles[user.id] = {...(state.profiles[user.id] || {}),customerDetails:{firstName:clean(details.firstName).slice(0,80),lastName:clean(details.lastName).slice(0,80),phone:clean(details.phone).slice(0,30),email:clean(details.email).slice(0,254)}}; break;
        }
        default: throw new Error("Unsupported action.");
      }
      state.revision++;
      if (!storage) await save();
      const result = snapshotFromState(user);
      return storage ? {state:structuredClone(state),result} : result;
      } catch (error) {
        state = before;
        throw error;
      }
      };
      if (storage) return storage.update(async current => { normalize(current); return change(); });
      return change();
    });
    queue = result.catch(() => {});
    return result;
  };
  const hasMerchant = async merchantId => { if (storage) { await queue; normalize(await storage.read()); } else await load(); return state.merchants.some(m => m.id === merchantId); };
  return {snapshot,apply,hasMerchant};
}
