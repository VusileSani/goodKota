# Build notes — why v7 is smaller

The previous scale-foundation build proved that GoodKota can support ordering, payments, delivery, drivers, dispatch, platform governance and operational expansion. That architecture is useful, but it creates too much product surface for the first market test.

v7 changes the question from:

> Can GoodKota run a food-delivery platform?

To:

> Will people repeatedly use GoodKota to decide where to get a good kota?

The build therefore retains three actors only:

- **Customer** — discover, inspect, save, get directions, order pickup.
- **Merchant** — stay open, keep the menu current, process pickup orders.
- **GoodKota** — curate the standard, grow a hyperlocal launch cluster, measure repeat use.

The demo intentionally begins in one launch cluster. Expansion should happen only after repeat behaviour is visible.
