# Data retention and privacy

Default policy targets (must be validated against legal/commercial requirements before launch):

| Data family | Target |
|---|---:|
| Current driver location | ~30 minutes operational TTL |
| Telemetry/debug events | 30 days |
| Support cases | 2 years |
| Privileged audit | 7 years |
| Delivery/order/payment financial records | policy/legal retention; do not TTL blindly |

Principles:
- store minimum customer PII necessary for fulfilment/support
- restrict PII by role/tenant
- do not place secrets, full bank account values or expected delivery credentials in client-readable documents
- export analytics using pseudonymous/stable IDs where possible
- current location is ephemeral; durable delivery events contain only what operations/analytics need
