# US2 Evidence — Imports And Safe Intake

Status: implemented, with hostile-input and performance evidence retained.

Evidence:

- Intake accepts normalized JSON and bounded UTF-8 CSV only; binary, archive,
  XML, HTML, executable, Office, image, PDF, spoofed MIME, traversal, formula,
  malformed encoding, and limit breaches fail closed.
- Accepted raw bytes are represented by opaque private raw-payload references and
  hashes. Rejected hostile payloads do not create public raw artifacts.
- Import sessions/items/attempts use bounded status transitions, claim tokens,
  retry ceilings, attempts, unsupported-format records, and safe rollups.
- Sender/institution identification and parser-version selection are
  deterministic and versioned.
- Performance artifacts:
  - `tracking-summary.json`: 2,784 iterations, 0 failed checks, intake P99
    14 ms, read P99 10.21 ms, duplicate P99 8.58 ms.
  - `tracking-csv-summary.json`: 10,000 rows processed in 61.03 ms.

Acceptance mapping: FR-004 through FR-016, FR-029 through FR-032, AC-003,
AC-004, AC-006, AC-012, AC-013, AC-015.
