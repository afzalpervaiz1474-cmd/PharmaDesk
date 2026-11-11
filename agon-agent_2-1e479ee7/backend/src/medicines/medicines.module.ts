import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MedicinesController } from './medicines.controller';
import { MedicinesRepository } from './medicines.repository';

@Module({
  imports: [AuthModule],
  controllers: [MedicinesController],
  providers: [MedicinesRepository],
  exports: [MedicinesRepository],
})
export class MedicinesModule {}
