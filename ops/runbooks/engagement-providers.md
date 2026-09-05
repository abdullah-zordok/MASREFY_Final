# External provider validation

Deterministic tests prove local classification and payload shape, not real delivery. In a controlled non-production account, validate Expo, APNs HTTP/2 token authentication, FCM v1 OAuth, SMTP TLS acceptance, ClamAV signatures, and one physical iOS/Android device. Record provider request IDs only; never record credentials, device tokens, recipient addresses, payload bodies, or attachment data.

Promote live provider mode only after credential ownership, rotation, rate-limit, revocation, outage, ambiguous-acceptance, and device lock-screen checks pass. This is an external release gate when secrets or controlled devices are unavailable.
