import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

/** Simple in-memory rate limiter for credential endpoints (per IP + route). */
@Injectable()
export class AuthRateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly buckets = new Map<string, Bucket>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, b] of this.buckets) {
        if (b.resetAt < now) this.buckets.delete(k);
      }
    }, WINDOW_MS).unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    const key = `${ip}:${req.route?.path ?? req.url}`;
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    bucket.count += 1;
    if (bucket.count > MAX_ATTEMPTS) {
      throw new HttpException(
        'Too many attempts, try again in a minute',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
