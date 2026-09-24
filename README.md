# GoodKota MVP v8

A focused, orange GoodKota experience for discovering local kota spots and placing pickup orders. The customer can browse, save, open navigation, add products, adjust quantities, enter contact details, and place a pay-on-collection order. The merchant workspace can edit the pickup address and menu availability and move orders through the pickup queue. The GoodKota workspace retains its verification view.

## Run

Serve this folder over HTTP because it uses ES modules:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. The app uses relative paths and can be hosted as a static site.

## Scope and limitations

- Product tiles intentionally use visual placeholders until merchants upload real food photos.
- The included merchants, ratings, distances, and orders are sample content. Seed addresses are suburb-level; merchants must enter verified street addresses before navigation is accurate.
- The workspace selector and localStorage persistence are a prototype mechanism. They are not authentication, shared merchant order delivery, or secure storage of customer details. Do not use this build to take real orders or collect real customer data on a public deployment.
- Pay on collection is the only active payment method. No payment is taken in this build. See `docs/PAYFAST-INTEGRATION.md` for the checkout and payment contract that must be implemented server-side before enabling PayFast.
- Delivery, dispatch, loyalty and promotions are outside the initial pickup flow.
