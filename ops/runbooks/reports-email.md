# Report email delivery

## Delivery failures

Confirm DNS and TLS negotiation without printing credentials. Retry 4xx/connectivity failures within the configured attempt cap. Treat 5xx rejection as permanent and post-DATA timeout as `DELIVERY_ACCEPTANCE_UNKNOWN`; never resend an ambiguous acceptance.

Rotate SMTP credentials through deployment secrets only. `Delivered` means the configured SMTP server accepted the message, not inbox receipt.
