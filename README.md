# Yagoya v6.11 Navigation App Choice

Yagoya v6.11 builds directly on v6.10. The customer merchant page keeps the existing **Directions** control beside the merchant address, but makes it more visible and replaces automatic Apple Maps routing with an explicit navigation-app chooser.

Customers can choose **Waze**, **Google Maps**, or **Apple Maps**. Yagoya passes the merchant’s stored coordinates to the selected provider and does not require a maps API key. A customer may remember a preferred provider; Yagoya highlights that choice on future visits while still asking which navigation app to open. This keeps provider choice explicit and avoids silently forcing Apple Maps on iPhone.

The Premium Graphite visual baseline, Firebase authentication continuity, merchant workspaces, location-first discovery, recommendation/quality logic, reporting and governance are retained.

# Yagoya v6.10 Report Generation & Print

Yagoya v6.10 builds directly on v6.9 and retains Firebase authentication continuity, Premium Graphite, merchant workspaces, recommendation/quality logic, delivery and governance.

This release adds compact, role-based report generation without turning the operational screens into long dashboards. Merchants can generate **Sales Reports** and **Sales & Settlement Statements**. Yagoya Admin and Owner can generate **Operations & Quality Reports** across the network or a selected merchant. Generated reports have an in-app preview, **Print / Save PDF** through the browser print flow, and **CSV export** for the underlying report rows.

Settlement reporting is evidence-based: Yagoya reports recorded paid-order, refund and payout events and explicitly does not infer a bank payout that has not been recorded. Production report generation should move behind bounded server-side reporting/query contracts as Firestore replaces the browser-local prototype repository.

# Yagoya v6.9 Authentication Behaviour & Account Continuity

Yagoya v6.9 builds directly on v6.8. The Merchant workspaces, Premium Graphite visual system, recommendation foundation, delivery architecture and governance work remain intact.

This release makes customer authentication unmistakable and durable: anonymous discovery remains open, private customer information and checkout require Firebase authentication, Firebase explicitly uses local browser persistence so a signed-in session is restored after refresh/reopen, and logout returns the customer to a signed-out state.

Customer → Account retains the compact progressive-disclosure structure: **My Orders · My Favourites · My Addresses · My Details · Payments · Preferences · Help & Support · Account & Security**, with **Log Out** separate at the bottom when authenticated. Signed-out customers can see the Account structure, but private sections route through Account & Security before their data is shown.

The **Preview as** actor switcher remains a prototype screen switcher only. It does not create or change Firebase identity, claims, or authenticated authority. Production authorization remains server-enforced.
