import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the Android live build uses the isolated public staging Firebase client config', () => {
  const app = JSON.parse(readFileSync(resolve(mobileRoot, 'app.json'), 'utf8'));
  assert.equal(app.expo.android.googleServicesFile, './google-services.json');

  const firebase = JSON.parse(
    readFileSync(resolve(mobileRoot, app.expo.android.googleServicesFile), 'utf8')
  );
  assert.equal(firebase.project_info.project_id, 'masarifi-staging');
  assert.equal(firebase.client.length, 1);
  assert.equal(firebase.client[0].client_info.android_client_info.package_name, 'com.masarifi.mobile');
  assert.equal(firebase.configuration_version, '1');

  const serialized = JSON.stringify(firebase);
  assert.doesNotMatch(serialized, /private_key|client_secret|service_account/i);
});
