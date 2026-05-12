import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { OrdersModule } from '@/modules/orders/orders.module';
import { ChatActivityBus } from './chat-activity.bus';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [MessagingController],
  providers: [MessagingService, ChatActivityBus],
})
export class MessagingModule {}
