import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MedicinesModule } from '../medicines/medicines.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule, MedicinesModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
