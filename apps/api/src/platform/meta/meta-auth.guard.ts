import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

export const META_TOKEN_VERIFIER = Symbol('META_TOKEN_VERIFIER');
export type MetaTokenVerifier = (
  token: string,
) => Promise<boolean | Readonly<{ userId: string }>>;

export interface MetaRequest extends Request {
  metaSubject?: string;
}

@Injectable()
export class MetaAuthGuard implements CanActivate {
  constructor(
    @Optional()
    @Inject(META_TOKEN_VERIFIER)
    private readonly verifier?: MetaTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<MetaRequest>();
    const header = request.header('authorization');
    if (!header?.startsWith('Bearer ') || header.length <= 7) throw new UnauthorizedException();
    if (!this.verifier) throw new ServiceUnavailableException();
    const identity = await this.verifier(header.slice(7));
    if (!identity) throw new UnauthorizedException();
    if (typeof identity === 'object') request.metaSubject = identity.userId;
    return true;
  }
}
