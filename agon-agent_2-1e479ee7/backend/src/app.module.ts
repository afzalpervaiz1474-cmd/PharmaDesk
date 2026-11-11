import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config/app-config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { MedicinesModule } from './medicines/medicines.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [AppConfigModule, DatabaseModule, AuthModule, MedicinesModule, SyncModule, AiModule],
  controllers: [HealthController],
})
export class AppModule {}
