# Load and scale test plan

Before launch and before major campaigns, test at least 10x forecast peak.

Scenarios:
- merchant discovery by geohash
- menu reads
- checkout command + duplicate retry/idempotency
- simultaneous merchant acceptance/ready updates
- two dispatchers racing for one driver/task
- driver location updates
- delivery tracking reads
- support queue bursts
- Owner/Admin audit writes

Pass conditions include bounded query result sizes, no duplicate orders/assignments, invariant preservation, acceptable p95/p99 latency, no unexpected Firestore hotspotting, and projected cost inside agreed guardrails.
