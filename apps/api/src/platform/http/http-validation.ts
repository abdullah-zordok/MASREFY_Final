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
  rawBodyPaths: Readonly<Record<string, number>> = {},
): void {
  for (const path of rawJsonPaths) {
    app.use(path, raw({ inflate: true, limit: bodyLimitBytes, type: 'application/json' }));
  }
  for (const [path, limit] of Object.entries(largerJsonPaths))
    app.use(path, json({ inflate: true, limit, strict: true }));
  for (const [path, limit] of Object.entries(rawBodyPaths))
    app.use(
      path,
      raw({
        inflate: false,
        limit,
        type: (request) => {
          const contentType = request.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
          return contentType !== 'application/json' && !contentType?.endsWith('+json');
        },
      }),
    );
  app.useBodyParser('json', {
    inflate: true,
    limit: bodyLimitBytes,
    strict: true,
  });
  app.use((request: Request, _response: Response, next: NextFunction) => {
    const pathname = request.originalUrl.split('?')[0];
    const acceptedRaw =
      pathname !== undefined &&
      rawBodyPaths[pathname] !== undefined &&
      Buffer.isBuffer(Reflect.get(request, 'body'));
    if (bodyMethods.has(request.method) && !request.is('application/json') && !acceptedRaw) {
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
