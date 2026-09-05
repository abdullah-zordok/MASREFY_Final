# Engagement campaigns

## Stalled expansion

Verify campaign state, scheduled time, published template, and fixed audience clauses. A batch is capped at 500 and uniqueness on campaign/user/channel makes replay safe. Resume a paused campaign only after recording the approving operator and incident reason; cancellation is terminal.

## Approval incident

For audiences above the configured threshold, confirm creator and approver differ and recent MFA/audit evidence exists. Do not bypass the database guard. Recreate an expired preview instead of copying an audience list or accepting arbitrary SQL.
