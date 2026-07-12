import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://192.168.2.7:5173,http://nongsantot.netlify.app,https://nongsantot.netlify.app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT ?? 3000);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  const swaggerConfig = new DocumentBuilder()
    .setTitle('NongSanTot API')
    .setDescription('API docs for NongSanTot backend')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'firebase-bearer',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port, host);
  console.log('Link to Server: http://' + host + ':' + port);
  console.log('Swagger Docs: http://' + host + ':' + port + '/docs');
}
bootstrap();
