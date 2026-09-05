# Internal-note isolation

Static contract/DTO/OpenAPI/Realtime/log/cache/export scans and negative security
tests find no customer-accessible internal-note field or route. Notes use an Admin-
only function, exact permission plus recent MFA, separate persistence, privileged
audit, and bounded metadata-only observability. Customer ticket history and export
allowlists cannot select the note relation.
