# PayFast split decisions for GoodKota

Record PayFast's answers here before building hosted checkout. The current application is a browser demonstration with pay on collection only. Merchant account submission and office review do not verify ownership or activate payments.

| Decision to confirm with PayFast | Why it changes the implementation |
| --- | --- |
| Which account is primary for the customer payment: the merchant or GoodKota? Which account receives the split? | Determines whose Merchant ID/Key initiates checkout, which account shows as the payee, and how credentials are stored and rotated. Public PayFast support gives a merchant-primary/platform-secondary example; the GoodKota arrangement must be confirmed. |
| Can one verified PayFast account represent multiple pickup locations owned by the same business? | GoodKota models locations as separate merchant spots. The current demo prevents reusing a PayFast ID across spots until account ownership is verified. |
| What fixed or percentage split applies, and who pays processing fees? | Determines integer-cent calculations, rounding, whether the commission comes from the whole order, and the displayed customer total. Capture per-merchant agreed terms and their effective dates. |
| Which payment methods support splits, and what are the minimum and maximum amounts? | Determines eligible checkout options and whether a low-priced kota order remains viable after fees. |
| How are full and partial refunds, chargebacks and cancellations handled across both accounts? | Determines support operations, refund permissions and reconciliation. Never assume the split reverses automatically. |
| What onboarding or authorization step links a verified merchant account to GoodKota? Is there a partner sign-up or account-status API? | Determines whether merchant signup stays a guided PayFast handoff, and how GoodKota verifies ownership without collecting PayFast login details. |
| Which sandbox accounts, test credentials, notification validation steps and transaction reports should GoodKota use? | Determines how to test both sides of a split, retry-safe payment attempts, provider notifications and accounting reconciliation. |

## Build gates after those answers

1. Move merchant identities, account links, menus and orders into shared server storage with real merchant and office authorization. An editable browser role selector and localStorage cannot establish payment ownership.
2. Give each checkout attempt a unique reference tied to a durable order. Price items, extras and the split on the server in integer cents. Reject mixed-merchant carts and unverified provider account links.
3. Create the PayFast hosted-checkout payload on the server. Treat return and cancel pages as navigation; only validated provider notifications and reconciliation can mark an online order paid. Handle repeated and out-of-order notifications idempotently.
4. Prove primary and secondary sandbox transactions, failed and retried payments, fees and refunds before allowing the first live payment. Keep pay on collection available during the migration.

PayFast references: https://support.payfast.help/portal/en/kb/articles/can-i-split-a-payment-20-9-2022 · https://support.payfast.help/portal/en/kb/articles/how-do-i-enable-split-payments-20-9-2022 · https://developers.payfast.co.za/docs
