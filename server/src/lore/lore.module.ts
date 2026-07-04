import { Module } from '@nestjs/common';
import { LoreController } from './lore.controller';
import { LoreService } from './lore.service';

@Module({
  controllers: [LoreController],
  providers: [LoreService],
})
export class LoreModule {}
