# Analytics and search separation

Operational Firestore is not the BI warehouse.

Export append-oriented events (orders, payments, delivery events, ratings, support, compliance/commercial events) to BigQuery for Tableau/BI, cohort analysis and long-range reporting. Owner/Admin operational screens should use materialized current-state summaries, not analytical scans.

Merchant/product text search is behind `MerchantSearchService`. If Firestore prefix/query capabilities become insufficient, replace that adapter with a dedicated search index without changing the customer view contract.
