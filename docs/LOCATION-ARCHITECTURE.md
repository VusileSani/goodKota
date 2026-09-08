# Yagoya Location Architecture

## Purpose

Location is an infrastructure domain, not a view concern. Customer discovery, merchant navigation, delivery destinations and driver tracking have different accuracy, retention and authorization requirements and must remain separate.

## Invariants

1. Merchant coordinates are the navigation and proximity source of truth. Human-readable addresses are display/search metadata.
2. Merchant coordinate changes recompute `geohash` at write time.
3. Customer foreground discovery location is session-only. Do not build a passive customer location history from merchant discovery.
4. Driver tracking is a separate operational stream with short retention and authorization controls.
5. Autocomplete/geocoding provider credentials never ship to a browser client. Production requests go through a Yagoya backend provider adapter.
6. UI code consumes normalized Yagoya location objects, never provider-specific response shapes.
7. Nearby merchant discovery must be bounded: geospatial candidate query first, exact distance second, hard result limit last. Never scan the merchant collection.
8. Autocomplete is debounced, stale requests are cancelled, results are cached briefly, and result counts are bounded.
9. Navigation handoff uses merchant coordinates directly and opens the device mapping service; it does not require continuous customer tracking.
10. Provider failure must degrade gracefully: typed location search can still be submitted and the user can use device location.

## Normalized location contract

```json
{
  "lat": -25.9992,
  "lng": 28.1263,
  "label": "Midrand, Gauteng",
  "type": "suburb",
  "source": "location_provider",
  "providerRef": "opaque-provider-reference"
}
```

`providerRef` is optional and must never be treated as the primary key for a Yagoya merchant, customer, order or delivery.

## Autocomplete flow

```text
user types
  -> minimum character guard
  -> 280 ms debounce
  -> cancel previous request
  -> short-lived cache lookup
  -> Yagoya location endpoint
  -> provider adapter (Google / Mapbox / HERE / other)
  -> normalized bounded suggestions
  -> user selects a suggestion
  -> session location updated
  -> bounded geospatial merchant query
```

The browser must not call a paid provider using secret credentials. The backend adapter is the policy point for quota controls, abuse protection, telemetry, provider failover and cost management.

## Merchant discovery

Production Firestore queries use geohash bounds to fetch a bounded candidate set. The backend/repository then calculates Haversine distance only for those candidates and returns a capped page. Geographic expansion should use progressively wider query windows rather than a full collection scan.

## Merchant onboarding

Store:

- display address
- locality/area
- latitude
- longitude
- geohash
- optional provider reference
- optional address verification metadata

Coordinates must be verified during onboarding or address change. A typed address alone is insufficient for navigation or proximity ranking.

## Privacy and retention

Customer discovery GPS/search positions remain ephemeral session context. Order delivery destinations are stored only because they are required to fulfil and evidence the transaction. Driver current locations are short-lived operational data; durable delivery history should record only the events/locations justified by the delivery record and retention policy.

## Performance controls

- Autocomplete: max 6 suggestions, 280 ms debounce, 5-minute client cache.
- Geocoding: one-shot operation, cached briefly; production backend cache is recommended.
- Merchant discovery: hard candidate/result bounds; Firestore indexes by enabled/commercial/geohash.
- No continuous GPS watchers for customer discovery.
- No route API call merely to rank merchants; straight-line distance is sufficient for discovery. Route/traffic ETA is a later, separately budgeted service.

## Failure boundaries

Autocomplete, merchant discovery and navigation handoff must fail independently. A maps-provider outage must not prevent ordering from a merchant already selected. A geocoding outage must not corrupt existing merchant coordinates. Provider responses must be validated before being accepted into Yagoya state.
