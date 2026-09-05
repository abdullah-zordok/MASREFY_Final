# Reused Security Patterns

- Customer identity: `src/identity/clerk-auth.guard.ts`; push credentials are
  AES-GCM encrypted in `src/identity/push-token.crypto.ts` and decrypted only in
  backend send scope.
- Admin authorization: `src/security/admin-auth.guard.ts`, the existing exact
  permission manifest, recent-MFA checks, and immutable audit repository paths.
- Required permission keys already exist for notification, campaign, delivery,
  support, notes, categories, feedback, abuse, and content operations; Phase 11
  reuses rather than renames or duplicates them.
- Support access: existing grants and purpose-bound support-access flow remain
  independent from normal ticket ownership and Admin action permissions.
- Idempotency/versioning: Phase 6 request-hash replay and optimistic-version
  patterns are reused; database uniqueness remains the final race guard.
- Privacy: existing handler/export registry is extended only with safe owner data;
  internal notes, provider fields, quarantine keys and draft text are never
  registered for customer export.
- File security: existing private Storage signed-request pattern is reused with a
  new quarantine lifecycle and clean-only authorization check.

Release blockers are cross-user access, internal-note/draft/file disclosure,
permission or MFA bypass, provider/token/secret logging, and any Critical/High
exploitable security finding.

