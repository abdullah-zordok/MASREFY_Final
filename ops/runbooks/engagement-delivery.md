# Engagement delivery

## Provider outage

Confirm the failing channel/provider labels and deployment configuration without printing tokens or payloads. Keep source-domain writes enabled: delivery is outbox-driven and independent. Use the deterministic provider to reproduce classification, restore the provider, then observe bounded lease/retry recovery. Never replay an ambiguous acceptance automatically.

## Backlog

Check worker health, claim saturation, lease expiry, and provider latency. Scale existing workers only after confirming database headroom. Do not increase batch or attempt limits during an incident without a measured query plan.

## Source replay

Inspect only source event IDs, event types, and safe error codes. Correct the template/configuration fault and let the unique `source_event_id` constraint make replay idempotent. Never edit source-domain rows or copy source payloads into logs.

## Token response

An invalid-token response revokes only that user's encrypted device token. Rotate encryption/hash keys through deployment secrets and preserve old decryption keys until all active rows are re-encrypted.
