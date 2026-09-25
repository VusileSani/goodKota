# GoodKota MVP v12

An orange, charcoal and white pickup discovery prototype. GoodKota helps people find a kota worth eating in one launch cluster, see what a spot is known for, tailor an order and collect it. Merchant cards lead with food placeholders, menu highlights and live availability. The merchant and GoodKota workspaces retain the core operating flows from the supplied full-spectrum build.

## Run locally

Serve **this directory** over HTTP (ES modules require it):

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. Use the workspace selector in the header to inspect Customer, Merchant and GoodKota views. All three views share state within one browser profile for demonstration. The area button lets customers prioritise spots in Midrand, Tembisa, Centurion or a typed area; menu items, descriptions and option names are searchable. Filters focus on price and kota ingredients.

## Main journey

1. In Customer → Account, submit a merchant application with the pickup address and contact details.
2. In GoodKota → Applications, review and approve it. The new listing starts offline in **review**.
3. In Merchant, select the new spot. In Menu, add a kota and optional paid extras, free ingredient removals, or one-of groups for sauce and heat. Each choice can be switched off separately. Set store details and availability of each item.
4. In GoodKota → Quality, record the five checks with a review note. In Merchants, activate the listing with a reason.
5. In Merchant → Orders, open the listing for orders. In Customer → Discover, choose an item and its options, adjust quantities in the cart, enter contact details, and place a pickup order. The menu and total are rechecked before the browser records the order.
6. In Merchant → Orders, accept, mark ready and mark collected, or cancel with a reason. Customer → Orders shows status, contents, directions and cancellation reason. A completed order can be rated once as **Amazing**, **Good** or **Average**. GoodKota → Orders provides oversight.
7. Merchant → Support opens cases. GoodKota → Support records progress and a handover note. GoodKota → Quality sees the order feedback alongside its separate five-point review. Reports filter dated orders and export CSV; Activity shows recent actions.

The experience indicator uses the last 20 rated, completed pickup orders. It remains neutral until there are at least three. Thereafter an average score of at least 1.5 of 2 is green (Amazing), at least 0.75 is yellow (Good), and lower is red (Average). A single review cannot turn a merchant red. GoodKota approval remains a separate editorial decision; ratings do not automatically approve or suspend a listing.

The checkout uses **pay on collection** and records `unpaid`. Customer name, phone and email are captured for the order. No online charge is taken.

## Mobile merchant experience

GoodKota → Merchants → Manage now groups Merchant details, Pickup location with Open Maps, and Save changes. A separate Trading status card shows readiness for the five GoodKota checks, saved pickup address, available menu and quality clearance. It offers one status action for the listing's current state; the other action remains under “Other status action.” A reason is required and logged when the status changes. The merchant's Store page follows the same details → pickup → save order. On Merchant → Orders, live queue cards appear before summary metrics, with occupied statuses first, so an existing order is easier to reach on a phone.

## Secure PayFast credential setup

GoodKota → Payments lets the office select a merchant and enter that store’s PayFast **Merchant ID**, **Merchant Key** and optional **Security Passphrase** when the bundled Node server is running. PayFast does not label this hosted checkout credential set as a generic public/private key pair. Each store has a separate encrypted configuration outside the public web root; the service requires a separate setup access code, returns only masked status, and never writes secrets to browser localStorage. This is credential preparation only: **online checkout stays disabled** until authenticated orders, server pricing and validated payment notifications are built.

For a local secure-setup demo, set a random 32-byte setup code and 32-byte encryption key (base64), then run `npm start`. Keep the same encryption key for subsequent runs; losing it makes saved credentials unreadable. The server binds to `127.0.0.1:8080` by default. On PowerShell, you can generate values for the current session:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$env:GOODKOTA_SETUP_TOKEN = [BitConverter]::ToString($bytes).Replace('-', '')
$rng.GetBytes($bytes)
$env:GOODKOTA_CONFIG_KEY = [Convert]::ToBase64String($bytes)
Write-Host "Setup access code: $env:GOODKOTA_SETUP_TOKEN"
npm start
```

Copy the setup token from your own environment into the Payments unlock form. Keep both variables in a proper secret manager for a persistent deployment. Do not commit them or the encrypted credential store. Any public server requires HTTPS, real admin authentication, protected storage and a working verified payment flow. See `docs/PAYFAST-INTEGRATION.md`.

## Scope and honest limits

- Delivery, drivers, dispatch, promotions, settlement and the wider full-spectrum modules are outside this pickup build.
- Seed merchants and initial distances are illustrative. Their starting addresses identify areas, so navigation opens those areas until a merchant enters a real street address. The location picker ranks matching areas first; actual GPS distance needs location coordinates and a location service. No sample star scores are shown as customer evidence.
- The workspace selector is a demonstration control, **not authentication or role enforcement**. Browser localStorage is local to one device and is not shared order delivery, durable business data, or secure storage for real customer details. This build must not be used to take real public orders or collect real customer data.
- Feedback and merchant signals are stored in the same local browser demo. They require authenticated order ownership, shared persistence and moderation before public use.
- PayFast credentials can be saved only through the secure server. The static GitHub Pages build cannot save secrets or turn on online payments.
- Existing v9 browser state is reused where present. A fresh browser profile starts from the sample merchants. To demo a brand new listing, use the application journey above.

## Updating GitHub Pages

Extract the ZIP and copy its **contents** to the configured Pages publishing branch and folder. Commit and push changed files. Pushing only the ZIP leaves the public app unchanged. The customer, merchant and management demo works on Pages, while Payments explains that secure setup requires a backend. The service-worker cache name is bumped to v12; after deployment, reload or clear older site data if necessary.

Run `npm test` for integrity and workflow checks.
