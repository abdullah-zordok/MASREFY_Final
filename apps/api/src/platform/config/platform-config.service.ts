import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { PlatformEnvironment } from './environment.types';

@Injectable()
export class PlatformConfigService {
  constructor(private readonly config: ConfigService<PlatformEnvironment, true>) {}

  get<K extends keyof PlatformEnvironment>(key: K): PlatformEnvironment[K] {
    return this.config.get(key, { infer: true });
  }

  getRequired<K extends keyof PlatformEnvironment>(key: K): NonNullable<PlatformEnvironment[K]> {
    const value = this.config.get<PlatformEnvironment[K] | undefined>(key);
    if (value === undefined || value === '') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }
}
