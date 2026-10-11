# Dependency security — 2026-10-11

## Outcome

The API lockfile audits clean. The mobile and admin critical findings are fixed, but their full dependency security gates remain **RED** because upstream vulnerabilities remain. This evidence does not waive them or claim production readiness. UI/framework migrations, deployments, live financial operations and native identity/ABI changes were outside this remediation.

Fresh `npm audit --package-lock-only --json` results, including development dependencies:

| Application | RED baseline at 68e198e0 | Final lockfile | Gate |
| --- | --- | --- | --- |
| API | 24 moderate; 0 high; 0 critical | 0 vulnerabilities | GREEN |
| Mobile | 28 moderate; 56 high; 1 critical | 27 moderate; 53 high; 0 critical | RED |
| Admin | 3 moderate; 13 high; 1 critical | 0 moderate; 8 high; 0 critical | RED |

Counts include propagated parent-package findings; they are not counts of independent advisories. The admin's eight residual high findings all trace to one `braces` advisory. Audits were queried from the npm registry on the evidence date with Node 24.16.0 and npm 11.17.0. Final audit exit codes: API 0, mobile 1, admin 1.

Raw JSON is preserved at `E:/Masarifi-local-readiness-2026-10-11/dependency-security/`: `masarifi-api-audit-before.json`, `masarifi-mobile-audit-before.json`, `masarifi-admin-web-audit-before.json`, `api-audit-after.json`, `mobile-audit-after.json`, and `admin-web-audit-after.json`. No `audit fix --force`, audit suppression, dependency omission, test weakening, or waiver was used.

## Compatible remediation

| Scope | Exact change | Reason |
| --- | --- | --- |
| API | Direct `js-yaml` 5.3.0 → 5.4.1; override its transitive 5.x copies to the same direct version | First patched version for [GHSA-r3ph-w7gj-g6xm](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm). |
| API | Existing `multer` override 2.3.0 → 2.4.0 | Patched aborted-upload disk cleanup in [GHSA-3pph-fpjx-jg34](https://github.com/advisories/GHSA-3pph-fpjx-jg34). |
| API | `qs` override 6.16.0 | Addresses [array-limit bypass](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) and [attacker-controlled isBuffer DoS](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g). |
| API | Scoped `@istanbuljs/load-nyc-config` → `js-yaml` 4.3.2 | Removes obsolete `argparse` 1.x → `sprintf-js`. The installed NYC consumer calls only `.load()`; before/after YAML flag parsing matched, and its actual asynchronous `loadNycConfig` passed a YAML config smoke. It does not receive js-yaml 5.x, whose loader/schema behavior changed. |
| Mobile | Overrides `brace-expansion` 1.x → 1.1.21, 2.x → 2.1.7, 5.x → 5.0.12 | Matching-major patches cover the [quadratic rewrite](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) and related stack exhaustion advisories. |
| Mobile | `compression` 1.8.1 → 1.8.2 | Stops native zlib memory leakage after prematurely closed responses ([GHSA-vc2v-76pw-4v95](https://github.com/advisories/GHSA-vc2v-76pw-4v95)). |
| Mobile | `shell-quote` 1.10.0 → 1.11.0 | Fixes critical command injection after comment tokens ([GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv)). |
| Mobile and admin | `source-map-js` 1.2.1 → 1.2.2 | Fixes indexed-source-map offset DoS ([GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)). |
| Mobile and admin | `fast-uri` 3.1.7 → 3.1.8 | Fixes percent-encoded host normalization inconsistency ([GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj)). |
| Admin | Pin `next` 16.3.4 → 16.3.8 | Minimum same-release-line patch covering the [critical ImageResponse RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), image SSRF and cache/metadata/dev-server advisories in the fresh audit. [Image SSRF patch](https://github.com/advisories/GHSA-cjq9-62q9-8jv4) is 16.3.8. |
| Admin | `@cloudflare/vite-plugin` 1.56.0 → 1.63.1 and required peer `wrangler` 4.135.0 → 4.149.0 | Maintains plugin major 1 and Wrangler major 4. Their matched upstream dependency set installs patched `sharp` 0.35.5 and Miniflare; workerd/esbuild platform packages change with that tooling set. |
| Admin | Overrides `undici` 7.x → 7.29.1 and 8.x → 8.10.2 | Matching-major fixes for TLS validation, WebSocket, decompression, retry and caching advisories. |
| Admin | Overrides `brace-expansion` 1.x → 1.1.21 and 5.x → 5.0.12 | Matching-major fixes as above. |

Expo is still 55.0.31, React Native is still 0.83.10, and the three existing Metro overrides remain 0.83.8. React, React DOM and React Test Renderer remain 19.2.0 in mobile. Android namespace/application ID remain `com.masarifi.mobile`; configured ABIs remain `armeabi-v7a,arm64-v8a,x86,x86_64`. No native configuration or source file was edited for this subtask. `packages/transaction-parser` has no dependencies and needed no manifest/lock change.

## Residual blockers and exposure

| Package and scope | Advisory and exposure | Why retained / required follow-up |
| --- | --- | --- |
| `braces` 3.0.3; mobile and admin | High [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), CVE-2026-93687. Deeply nested untrusted brace patterns can terminate a Node process. Admin paths include ESLint/Next's glob tooling and vinext → CommonJS/dynamic-import plugin → fast-glob → micromatch. Mobile paths include Metro/Expo and Jest/glob tooling. These are tooling pattern parsers; a deployed financial API endpoint exposing brace patterns was not established. | Maintainer advisory lists **no patched version**; npm latest is still 3.0.3. Downgrading Next ESLint configuration or migrating Jest/Expo to npm's suggested different major versions would not be a compatible remediation. Requires an upstream patch or separately designed replacement with consumer-level regression checks. Full gate stays RED. |
| `node-forge` 1.4.0; mobile | High [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), CVE-2026-85393. Malformed nested DigestAlgorithm data can bypass RSA PKCS#1 v1.5 signature verification with low-exponent keys. Lock chains include Expo CLI and `@expo/code-signing-certificates`; Expo CLI also imports forge for iOS code-signing certificate handling. No app financial/auth runtime calling the vulnerable verification API was established. | Maintainer advisory lists **no patched version**; npm latest is 1.4.0. npm's datetimepicker downgrade recommendation propagates through the graph and is not a forge patch. Requires upstream correction and signing-tool regression; remains RED. |
| `decode-uri-component` 0.2.2; mobile | Moderate [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), CVE-2026-45822. Malformed percent-encoded input can consume exponential CPU. `@react-navigation/core` uses `query-string` during `getStateFromPath`, so malformed deep-link/query data is a relevant runtime input surface, including authentication callbacks. | Patch 0.5.0 is ESM-only. The pinned compatible `query-string` 7.1.3 uses `require('decode-uri-component')` as a callable CommonJS function, so overriding it to 0.5.0 changes the module contract. npm suggests Expo Router 58; the user requires Expo 55. Requires compatible upstream backport or a separately validated linking/parser migration. No waiver. |
| `sprintf-js` 1.0.3; mobile | Moderate [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), CVE-2026-97058. Untrusted precision format strings can trigger uncaught RangeError. Chain: Jest/Babel coverage → NYC config loader → js-yaml 3.15.2 → argparse 1.0.10 → sprintf-js. No financial runtime formatting use was established. | No patched sprintf-js release exists. A scoped YAML 4.x override validated for API did not re-resolve this existing mobile npm graph under install/targeted update; the ineffective override was removed, rather than claiming a fix. Requires coherent tooling dependency replacement/backport under Expo/Jest compatibility tests. |
| `stream-json` 1.9.1; mobile | Moderate [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), [GHSA-hqr4-qq8f-hg3x](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x), [GHSA-mjw6-4jj6-33hc](https://github.com/advisories/GHSA-mjw6-4jj6-33hc). Nested filter/JSONC inputs can cause CPU DoS; stream assembly can replace parsed object prototypes. Chain comes through Clerk's Solana wallet packages → Solana web3 → jayson. jayson's Node streaming helper constructs `StreamValues.withParser()` and `new Verifier`; its browser client uses JSON handling rather than that streaming helper. The native app's use of the vulnerable streaming helper was not established. | Patched 3.6.0 is ESM, changes case-sensitive deep import paths and stream APIs. jayson 4.3.0 requires `stream-json/streamers/StreamValues` and `stream-json/utils/Verifier`; a blind 1.x → 3.x override breaks that contract. Requires upstream jayson/wallet dependency correction or separately validated replacement. |
| `uuid` 8.3.2 and xcode's 7.0.3; mobile | Moderate [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), CVE-2026-41907. Missing output-buffer bounds checks affect v3/v5/v6. Inspected jayson and xcode call `v4()` without external buffers; those observed calls do not exercise the described vulnerable methods. This is exposure evidence, not an audit suppression. | First patched line is 11.1.1, beyond consumers' 7.x/8.x ranges. No cross-major native crypto/module change was forced for a buffer API not used by those callers. Requires upstream compatible dependency ranges/backport or a dedicated validated migration. Finding remains visible. |

The detailed chain/exposure descriptions are inferences from the locked graph and inspected installed consumer code; they do not establish universal non-exploitability. `npm audit --omit=dev` also cannot distinguish a native runtime bundle from Expo tooling, because Expo ships tooling beneath production dependency declarations.

## Verification and local environment

- RED was demonstrated with fresh audits of all three original lockfiles.
- GREEN is established only for the API dependency audit. Mobile/admin full audits intentionally remain failing.
- API patched installed versions were checked directly against the final lock; NYC `.nycrc.yaml` loading smoke passed.
- Admin `npm ci --ignore-scripts --no-audit --no-fund` completed (661 packages), then its fast-uri patch was installed; direct installed versions match the lock for Next, Sharp, Undici, brace-expansion, source-map-js and fast-uri.
- Mobile incremental npm install reported success while direct version checks showed stale modules. The first scripts-disabled `npm ci` failed with host V8 Zone Allocation OOM (exit 134). A bounded retry with `UV_THREADPOOL_SIZE=1`, `--maxsockets=1`, `--max-old-space-size=512` and `--v8-pool-size=1` completed successfully (1467 packages, exit 0). Direct installed-vs-lock checks now match all patched packages, including nested brace-expansion copies. The shell-quote critical payload now throws the required TypeError. Expo SQLite vendor headers are present again.
- Existing mobile Clerk React peer warnings concern React 19.2.0 versus Clerk's newer patch ranges; those versions and warnings predate the security edits. They were not bypassed by `--legacy-peer-deps` or a React framework upgrade.
- The C: disk ran out of space during initial registry/test-cache writes. Cache/TEMP/TMP and raw evidence were redirected to E:. Preserved files were not deleted. The interrupted audit/install attempts are not passing evidence.
- Root owns whole-suite tests and records them in its readiness evidence. Root reported the admin serial suite passed (274 suites, 926 tests). This file does not assert that all API/mobile tests/builds or native Android packaging passed; comprehensive isolated CI is still required.

Recommended regression commands from each app directory, with TEMP/TMP/npm cache/Jest cache redirected to E: on this host:

```text
API:       npm run typecheck; npm run lint; npm run test:unit; npm run test:contract; npm run build
Mobile:    npm run typecheck; npm run lint; npm run check:frontend-quality; npm test -- --runInBand
Admin:     npm run typecheck; npm run lint; npm test -- --maxWorkers=1; npm run build
Each app:  npm audit --package-lock-only --json
```

Native/deep-link/signing and vinext build verification remain meaningful follow-up checks before shipping, particularly for the documented upstream blockers. No deployment or device operations were performed here.
