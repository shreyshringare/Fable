import { Controller, Get } from '@nestjs/common';

const startedAt = Date.now();

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      uptime_s: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
