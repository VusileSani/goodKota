const UI_FIELDS = ["customerTab","merchantTab","adminTab","selectedMerchantId","search","cart","location","adminOrderFilter","adminMerchantSearch","reportFrom","reportTo","reportMerchantId"];

export class Store {
  constructor(state, actor, onUpdate = () => {}) {
    this.state = state;
    this.actor = actor;
    this.onUpdate = onUpdate;
    this.queue = Promise.resolve();
    this.uiKey = `goodkota_ui_${actor?.id || "guest"}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(this.uiKey) || "{}");
      for (const key of UI_FIELDS) if (saved[key] !== undefined) this.state[key] = saved[key];
    } catch { /* Browsing remains available when storage is blocked. */ }
    this.state.role = actor?.role || "customer";
    if (actor?.role === "merchant") this.state.merchantId = actor.merchantId;
    if (actor?.role === "customer" || !actor) this.state.merchantId = "";
    if (!this.state.merchants.some(merchant => merchant.id === this.state.selectedMerchantId)) this.state.selectedMerchantId = null;
  }

  save() {
    try { sessionStorage.setItem(this.uiKey, JSON.stringify(Object.fromEntries(UI_FIELDS.map(key => [key,this.state[key]])))); }
    catch { /* UI preferences are optional. */ }
  }

  reset() { sessionStorage.removeItem(this.uiKey); location.reload(); }
  sync(snapshot) {
    const ui = Object.fromEntries(UI_FIELDS.map(key => [key,this.state[key]]));
    this.state = {...snapshot,...ui,userPos:this.state.userPos};
    if (!this.state.merchants.some(merchant => merchant.id === this.state.selectedMerchantId)) this.state.selectedMerchantId = null;
    this.save();
    this.onUpdate();
  }
  merchant(id) { return this.state.merchants.find(m => m.id === id); }
  product(id) {
    for (const merchant of this.state.merchants) {
      const product = merchant.menu.find(item => item.id === id);
      if (product) return {...product,merchantId:merchant.id};
    }
    return null;
  }

  actionPayload(type, payload) {
    const merchant = this.merchant(payload.merchantId);
    const order = this.state.orders.find(o => o.id === (payload.orderId || payload.id));
    const application = this.state.applications.find(a => a.id === payload.applicationId);
    const supportCase = this.state.supportCases.find(c => c.id === payload.caseId);
    switch (type) {
      case "application_submitted": return {fields:application};
      case "application_reviewed": return {...payload,fields:application,reason:application?.reviewReason};
      case "merchant_updated": return {...payload,fields:{...merchant,contactName:merchant?.contact?.name,phone:merchant?.contact?.phone,email:merchant?.contact?.email}};
      case "merchant_standard_reviewed": return {...payload,checks:merchant?.standard,reason:merchant?.reviewNote};
      case "merchant_menu_saved": return {...payload,item:merchant?.menu.find(i => i.id === payload.productId)};
      case "payfast_account_submitted": return {...payload,fields:merchant?.payfast};
      case "payfast_account_reviewed": return {...payload,note:merchant?.payfast?.reviewNote};
      case "pickup_order_created": return {merchantId:order?.merchantId,details:order?.customerDetails,cart:order?.items,requestId:order?.id};
      case "refund_review_requested": return {...payload,fields:order?.refundReview};
      case "refund_review_updated": return {...payload,note:order?.refundReview?.adminNote,externalReference:order?.refundReview?.externalReference};
      case "support_case_opened": {
        const entry = this.state.supportCases.find(c => c.id === payload.caseId);
        return {...payload,subject:entry?.subject,message:entry?.message};
      }
      case "support_case_updated": return {...payload,note:supportCase?.note};
      default: return payload;
    }
  }

  log(type, payload = {}) {
    if (["merchant_open","directions_open","cart_add"].includes(type)) return;
    const body = JSON.stringify({type,payload:this.actionPayload(type,payload)});
    this.queue = this.queue.then(async () => {
      const response = await fetch("./api/actions", {method:"POST",headers:{"Content-Type":"application/json"},body,credentials:"same-origin"});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this change.");
      this.sync(result.state);
      if (result.notificationDelivery?.status === "failed") this.onUpdate("Order marked ready. The in-app alert was saved, but the email alert failed.");
      else if (result.notificationDelivery?.status === "not_configured") this.onUpdate("Order marked ready. The in-app alert was saved; email alerts are not configured.");
      return {ok:true,notificationDelivery:result.notificationDelivery || null};
    }).catch(async error => {
      try {
        const response = await fetch("./api/data",{credentials:"same-origin"});
        if (response.ok) this.state = {...(await response.json()).state,userPos:this.state.userPos};
      } catch { /* The next refresh can recover when the connection returns. */ }
      this.onUpdate(error.message);
      return {ok:false};
    });
    return this.queue;
  }
}
