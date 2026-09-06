# Backup and disaster recovery

## Production requirements

- enable scheduled Firestore exports to a protected Cloud Storage bucket
- protect payment-provider reconciliation exports independently
- document Firebase Auth recovery/Owner break-glass process
- record deployment/configuration versions
- test restore into an isolated project before trusting backups

## Drill cadence

Quarterly:
1. restore Firestore export into an isolated environment
2. verify merchant/order/payment/delivery referential integrity
3. verify at least one active Owner and platform controls
4. run payment reconciliation against provider export
5. measure RTO/RPO and record gaps

No backup is considered valid until a restore drill has succeeded.
