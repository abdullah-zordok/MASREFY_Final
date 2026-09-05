# Provider and scanner validation

Deterministic Expo, APNs, FCM, SMTP, Storage, and scanner adapters cover success,
retryable failure, terminal failure, timeout, ambiguous acceptance, redaction,
revoked tokens, circuit recovery, scan mismatch, malware, and unavailable scanner.
This is simulation-only evidence. Genuine external gates remain: provider sandbox
credentials, physical push devices, a real SMTP recipient, a deployed Storage
bucket, and a live ClamAV daemon. The provider runbook gives the controlled validation
sequence; none is represented as completed locally.
