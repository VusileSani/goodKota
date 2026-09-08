# Yagoya v6.8 Merchant Workspaces & Action Confirmation

Yagoya v6.8 restructures the Merchant actor into focused menu workspaces rather than one long operational page. The Merchant navigation is now **Overview · Orders · Menu · Quality · Brand Materials · Store Settings · Support**. Each section owns its task and deeper actions remain inside that section.

Brand Materials is now actionable: merchants can order banners, stickers, serviettes, customer-experience materials and eligible Yagoya Verified kits from the Merchant workspace, with persistent order history and reorder. Verified-material eligibility follows the live Yagoya quality/compliance state; physical branding never overrides the app.

Authentication repair from v6.6.1/v6.7 is retained: anonymous browsing stays open, checkout requires Firebase customer authentication, the header Sign in / Account control remains visible, and checkout resumes with the cart preserved after authentication.

Routine state-changing actions now use explicit post-action confirmations; higher-impact flows retain review/reason steps before submission where already applicable.
