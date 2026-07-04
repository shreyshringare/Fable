import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LoreService } from './lore.service';

@Controller('lore')
@UseGuards(JwtAuthGuard)
export class LoreController {
  constructor(private readonly lore: LoreService) {}

  /**
   * Tourist lore for a place: mythology, legends, fiction appearances, history.
   * GET /api/v1/lore?q=Edinburgh%20Castle&lat=55.948&lng=-3.199
   */
  @Get()
  get(@Query('q') q?: string, @Query('lat') lat?: string, @Query('lng') lng?: string) {
    if (!q || !q.trim()) throw new BadRequestException('q is required');
    const latN = lat !== undefined && lat !== '' ? Number(lat) : undefined;
    const lngN = lng !== undefined && lng !== '' ? Number(lng) : undefined;
    if ((latN !== undefined && Number.isNaN(latN)) || (lngN !== undefined && Number.isNaN(lngN))) {
      throw new BadRequestException('lat/lng must be numbers');
    }
    return this.lore.getLore(q.trim(), latN, lngN);
  }
}
