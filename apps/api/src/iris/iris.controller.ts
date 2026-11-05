import { Body, Controller, ForbiddenException, Get, Post, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { IrisService, type ChatTurn } from './iris.service';

interface ChatBody {
  message: string;
  history?: ChatTurn[];
}

@Controller('iris')
@UseGuards(ClerkAuthGuard)
export class IrisController {
  constructor(private readonly iris: IrisService) {}

  @Post('chat')
  chat(@Body() body: ChatBody, @CurrentUser() user: AuthUser) {
    // Iris answers from conjunto-wide data (cartera, mora, visitor names, all PQRs),
    // so it is an admin tool. A resident must not be able to ask it about neighbours.
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const message = String(body.message ?? '').slice(0, 2000);
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .slice(-10)
      .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }));
    return this.iris.chat(user.conjuntoId, message, history);
  }

  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthUser) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    return this.iris.suggestions(user.conjuntoId);
  }
}
