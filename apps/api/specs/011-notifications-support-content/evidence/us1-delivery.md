# US1 — Safe asynchronous delivery

Unit and contract coverage exercises registered source events, bilingual safe
rendering, variable rejection/escaping, IANA timezone quiet hours and DST folds,
preference decisions, expiry, deterministic Expo/APNs/FCM/SMTP results, retries,
token revocation, circuit behavior, lease replay, and fixed-cardinality telemetry.
Integration suites are database-live when `MASARIFI_LIVE_DATABASE_TESTS=1` and are
therefore CI-owned on this host. Provider adapters never run inside source-domain
transactions.
