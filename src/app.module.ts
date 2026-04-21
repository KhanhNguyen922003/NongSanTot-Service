import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { ShopsModule } from './modules/shops/shops.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, ShopsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
