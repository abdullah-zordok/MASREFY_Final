# Admin Web Compatibility Review

The existing Admin Web references to accounts and transactions are aggregate,
billing-limit, health, user-summary, or fictional fixture fields. Its category
routes manage support/default taxonomies, not per-user Mobile sync state.

Phase 06 therefore adds no Admin Web route, schema, component, repository, or
mock. The sync API remains an authenticated customer-device boundary. Existing
Admin permissions and privacy-safe aggregate projections are unchanged.

Reviewed with:

```powershell
rg -n "transactions|accounts|categories" apps/admin-web
```
