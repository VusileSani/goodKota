import { renderAdmin, bindAdminEvents } from "./admin.js";
import { renderCustomer, bindCustomerEvents } from "./customer.js";
import { renderMerchant, bindMerchantEvents } from "./merchant.js";
import { subscribe } from "./store.js";

const renderers = {
  customer: renderCustomer,
  merchant: renderMerchant,
  admin: renderAdmin
};

let currentRoute = "customer";

function routeTo(route) {
  if (!renderers[route]) return;
  currentRoute = route;

  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  document.getElementById(`${route}View`).classList.add("active");

  document.querySelectorAll("[data-route]").forEach(button => {
    button.classList.toggle("active", button.dataset.route === route && button.classList.contains("nav-button"));
  });

  renderers[route]();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAll() {
  renderCustomer();
  renderMerchant();
  renderAdmin();
}

function bindNavigation() {
  document.querySelectorAll("[data-route]").forEach(button => {
    button.addEventListener("click", () => routeTo(button.dataset.route));
  });
}

function initialise() {
  bindNavigation();
  bindCustomerEvents();
  bindMerchantEvents();
  bindAdminEvents();

  subscribe(() => {
    renderAll();
  });

  renderAll();
  routeTo(currentRoute);
}

initialise();
