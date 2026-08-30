import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('native privacy configuration', () => {
  it('does not request SMS access and excludes local financial data from Android backup', () => {
    const appConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), 'app.json'), 'utf8')
    ) as {
      expo: {
        android: {
          allowBackup?: boolean;
          permissions?: string[];
          blockedPermissions?: string[];
        };
      };
    };
    const manifest = readFileSync(
      resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
      'utf8'
    );

    expect(appConfig.expo.android.permissions).not.toContain(
      'android.permission.READ_SMS'
    );
    expect(appConfig.expo.android.blockedPermissions).toContain(
      'android.permission.READ_SMS'
    );
    expect(appConfig.expo.android.allowBackup).toBe(false);
    expect(
      manifest.match(
        /<uses-permission[^>]*android\.permission\.READ_SMS[^>]*\/>/g
      ) ?? []
    ).toEqual([expect.stringContaining('tools:node="remove"')]);
    expect(manifest).toContain('android:allowBackup="false"');
  });
});
