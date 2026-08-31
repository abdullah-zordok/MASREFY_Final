import { UnsupportedMediaTypeException, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { json, raw } from 'express';

const bodyMethods = new Set(['POST', 'PUT', 'PATCH']);

export function configureValidation(
  app: NestExpressApplication,
  bodyLimitBytes: number,
  rawJsonPaths: readonly string[] = [],
  largerJsonPaths: Readonly<Record<string, number>> = {},
): void {
  for (const path of rawJsonPaths) {
    app.use(path, raw({ inflate: true, limit: bodyLimitBytes, type: 'application/json' }));
  }
  for (const [path, limit] of Object.entries(largerJsonPaths))
    app.use(path, json({ inflate: true, limit, strict: true }));
  app.useBodyParser('json', {
    inflate: true,
    limit: bodyLimitBytes,
    strict: true,
  });
  app.use((request: Request, _response: Response, next: NextFunction) => {
    if (bodyMethods.has(request.method) && !request.is('application/json')) {
      next(new UnsupportedMediaTypeException());
      return;
    }
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      stopAtFirstError: false,
    }),
  );
}
