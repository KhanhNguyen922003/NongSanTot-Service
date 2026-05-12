import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Sse,
  type MessageEvent,
  UseGuards,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { FirebaseAuthGuard } from '@/modules/auth/firebase-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/interfaces/authenticated-user.interface';
import { CreateNegotiationOfferDto } from './dto/create-offer.dto';
import { CreateOrderFromNegotiationDto } from './dto/create-order-from-offer.dto';
import { OpenProductConversationDto } from './dto/open-conversation.dto';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { MessagingService } from './messaging.service';

@Controller('conversations')
@UseGuards(FirebaseAuthGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Post('open-product')
  openProductConversation(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() body: OpenProductConversationDto,
  ) {
    return this.messaging.openProductConversation(currentUser, body);
  }

  @Get('me')
  listMine(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.messaging.listMyConversations(currentUser);
  }

  @Sse(':conversationId/events')
  conversationActivity(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ): Observable<MessageEvent> {
    return this.messaging.activityEventStream(currentUser, conversationId);
  }

  @Get(':conversationId')
  detail(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messaging.getConversationDetail(currentUser, conversationId);
  }

  @Get(':conversationId/messages')
  messages(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messaging.listMessages(currentUser, conversationId);
  }

  @Patch(':conversationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
  ) {
    return this.messaging.markConversationRead(currentUser, conversationId);
  }

  @Post(':conversationId/messages')
  sendMessage(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() body: SendChatMessageDto,
  ) {
    return this.messaging.sendTextMessage(currentUser, conversationId, body);
  }

  @Post(':conversationId/offers')
  createOffer(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Body() body: CreateNegotiationOfferDto,
  ) {
    return this.messaging.createNegotiationOffer(currentUser, conversationId, body);
  }

  @Patch(':conversationId/offers/:offerId/accept')
  acceptOffer(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('offerId') offerId: string,
  ) {
    return this.messaging.acceptNegotiationOffer(currentUser, conversationId, offerId);
  }

  @Patch(':conversationId/offers/:offerId/decline')
  declineOffer(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('offerId') offerId: string,
  ) {
    return this.messaging.declineNegotiationOffer(currentUser, conversationId, offerId);
  }

  @Post(':conversationId/offers/:offerId/create-order')
  createOrderFromOffer(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('conversationId') conversationId: string,
    @Param('offerId') offerId: string,
    @Body() body: CreateOrderFromNegotiationDto,
  ) {
    return this.messaging.createOrderFromNegotiatedOffer(
      currentUser,
      conversationId,
      offerId,
      body,
    );
  }
}
