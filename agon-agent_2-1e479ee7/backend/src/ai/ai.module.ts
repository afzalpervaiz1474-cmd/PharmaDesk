import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { BusinessDataService } from './business-data.service';
import { ConversationsRepository } from './conversations.repository';
import { OmniRouteClient } from './omniroute.client';

@Module({
  imports: [AuthModule],
  controllers: [AiController],
  providers: [AiService, BusinessDataService, ConversationsRepository, OmniRouteClient],
})
export class AiModule {}
