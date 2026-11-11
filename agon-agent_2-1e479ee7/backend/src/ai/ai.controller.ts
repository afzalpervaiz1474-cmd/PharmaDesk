import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatDto } from './ai.dto';
import { AiService } from './ai.service';
import type { AssistantStatus, ChatResponse, ConversationView, MessageView } from './ai.types';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Tells the UI whether answers come from a model or from data lookups. */
  @Get('status')
  status(): AssistantStatus {
    return this.ai.status();
  }

  @Get('conversations')
  conversations(@CurrentUser() user: AuthUser): Promise<ConversationView[]> {
    return this.ai.listConversations(user);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<MessageView[]> {
    return this.ai.listMessages(user, id);
  }

  @Post('chat')
  @HttpCode(200)
  chat(@CurrentUser() user: AuthUser, @Body() dto: ChatDto): Promise<ChatResponse> {
    return this.ai.chat(user, dto);
  }

  @Delete('conversations/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<{ ok: true }> {
    await this.ai.deleteConversation(user, id);
    return { ok: true };
  }
}
