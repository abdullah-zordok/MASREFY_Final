# Contract Inventory

Validation command (from `apps/api`):

```text
node -e "const fs=require('fs'),y=require('js-yaml'); ..."
{"paths":38,"operations":46,"schemas":47}
```

The Phase 11 OpenAPI parses successfully and contains 38 paths, 46 HTTP
operations, and 47 schemas. Its operations cover all customer notification,
preference, support, attachment, feedback, abuse and content flows and all Admin
template, campaign, delivery, support, note, category, feedback, abuse and content
flows. Mutations carry bounded strict schemas, versions where state is mutable, and
idempotency keys. Cursor bounds are customer <=100 and Admin <=200.

Current client gaps are implementation gaps, not contract ambiguities: Mobile has
mock-backed notification/support behavior and hardcoded help content; Admin has
communications repository/no-op handlers that need server mapping. Contract tests
must prove forbidden internal/provider/quarantine/audience/reporter fields remain
absent and must preserve the Phase 14 production-selection boundary.

