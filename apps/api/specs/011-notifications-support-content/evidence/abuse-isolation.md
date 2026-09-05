# Abuse isolation

The public receipt is deliberately opaque and does not confirm resource existence,
reporter identity, assignment, or moderation detail. Database uniqueness prevents
two active reports for the same reporter/resource/type under concurrency. BOLA,
BFLA, mass-assignment, wrong-permission, timing, and duplicate-replay cases are
covered by negative security and live-capable integration tests.
