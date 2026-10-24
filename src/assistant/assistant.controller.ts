import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ASSISTANT_LIMITS } from '../rate-limits';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { AssistantService } from './assistant.service';

class ChatDto {
  @IsString() @MaxLength(1000) message!: string;
  @IsOptional() @IsArray() history?: { role: 'user' | 'assistant'; content: string }[];
}

@Controller('assistant')
@UseGuards(ThrottlerGuard)
@Throttle(ASSISTANT_LIMITS)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  // TODO: per-user daily limit (20 free, unlimited Gold) once accounts exist.
  @Post('chat')
  chat(@Body() dto: ChatDto) {
    const history = (dto.history ?? [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    return this.assistant.chat(dto.message, history);
  }
}
