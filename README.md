# Yagoya v6.9 Authentication Behaviour & Account Continuity

Yagoya v6.9 builds directly on v6.8. The Merchant workspaces, Premium Graphite visual system, recommendation foundation, delivery architecture and governance work remain intact.

This release makes customer authentication unmistakable and durable: anonymous discovery remains open, private customer information and checkout require Firebase authentication, Firebase explicitly uses local browser persistence so a signed-in session is restored after refresh/reopen, and logout returns the customer to a signed-out state.

Customer → Account retains the compact progressive-disclosure structure: **My Orders · My Favourites · My Addresses · My Details · Payments · Preferences · Help & Support · Account & Security**, with **Log Out** separate at the bottom when authenticated. Signed-out customers can see the Account structure, but private sections route through Account & Security before their data is shown.

The **Preview as** actor switcher remains a prototype screen switcher only. It does not create or change Firebase identity, claims, or authenticated authority. Production authorization remains server-enforced.
