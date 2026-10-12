# CommonJS compatibility backport

This private package retains decode-uri-component 0.2.2's CommonJS callable
export, plus-to-space normalization and outer partial-decoding behavior. Only
the recursive `decodeComponents`/`decode` implementation is replaced with the
linear UTF-8 scanner from upstream 0.5.0. The unused old singleMatcher is removed.
Legacy var declarations are changed to const/let for the repository lint rule,
without changing the outer decoder behavior. No Expo, React Native, Router or
React version changes are required.

Upstream source and advisory:

- https://github.com/SamVerschueren/decode-uri-component/blob/v0.5.0/index.js
- https://github.com/SamVerschueren/decode-uri-component/security/advisories/GHSA-vcc3-ghjq-m6fr

MIT attribution is preserved in `license`. Version `0.2.2-masarifi.1` explicitly
identifies a local backport; it is not the upstream ESM 0.5.0 release. Retain npm
audit findings honestly: this backport is not permission to suppress or waive
remaining advisories. The outer replacement algorithm retains historical
behavior and is not claimed universally linear for arbitrary inputs.

The sibling `decode-uri-component-0.2.2-masarifi.1.tgz` is produced with
`npm pack --ignore-scripts --pack-destination ..` in this directory. The mobile
override installs this local artifact without lifecycle scripts or symlinks.
After any source change, regenerate the archive and dependency lock integrity,
then run `scripts/deep-link-decoder.test.mjs` and the actual navigation/auth tests.
Do not patch installed node_modules by hand.
