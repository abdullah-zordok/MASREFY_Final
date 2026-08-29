# Environment Contract: SPEC-BE-003

Values are injected by process secret/config stores. `.env.example` contains names
and safe descriptions only.

| Name                                     | API | Worker | Secret | Bounds / purpose                                                           |
| ---------------------------------------- | --: | -----: | -----: | -------------------------------------------------------------------------- |
| `MASARIFI_ADMIN_ROUTES_ENABLED`          | yes |     no |     no | `false` until bootstrap/drift gates pass                                   |
| `MASARIFI_ADMIN_INVITATION_REDIRECT_URL` | yes |     no |     no | exact HTTPS Admin origin/path; localhost only outside production           |
| `MASARIFI_SECURITY_IP_HASH_KEYS`         | yes |    yes |    yes | 1–3 `keyId:base64url-32-byte-key` entries; first writes, all verify/rotate |
| `SUPABASE_URL`                           | yes |    yes |     no | exact HTTPS project URL; local URL allowed outside production              |
| `SUPABASE_SERVICE_ROLE_KEY`              | yes |    yes |    yes | API signs owner downloads; worker uploads/deletes; never migration/client  |
| `MASARIFI_EXPORT_MAX_BYTES`              |  no |    yes |     no | bounded 1 MiB–1 GiB deployment limit                                       |
| `MASARIFI_EXPORT_MAX_ENTRIES`            |  no |    yes |     no | 1–10,000                                                                   |
| `MASARIFI_EXPORT_RETENTION_HOURS`        | yes |    yes |     no | approved short retention; 1–168                                            |
| `MASARIFI_EXPORT_SIGNED_URL_SECONDS`     | yes |     no |     no | 60–900                                                                     |
| `MASARIFI_DELETION_COOLING_OFF_HOURS`    | yes |    yes |     no | approved policy; 1–2160                                                    |
| `MASARIFI_SECURITY_WORKER_POLL_MS`       |  no |    yes |     no | 100–10,000                                                                 |
| `MASARIFI_SECURITY_JOB_BATCH_SIZE`       |  no |    yes |     no | 1–100                                                                      |
| `MASARIFI_PRIVACY_HANDLER_MANIFEST`      |  no |    yes |     no | sorted `resource@version` list, max 100 entries                            |

The existing Clerk secret remains the only provider credential for invitation
delivery, verified email lookup, and session revocation. The existing recent-auth
maximum remains authoritative. Process validation fails before bind/start on a
missing, malformed, wrongly scoped, production-insecure, duplicate, or unknown
Masarifi variable. Logs and errors name only invalid variable names, never values.
