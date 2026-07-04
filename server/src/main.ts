import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { WsService } from './ws/ws.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.enableCors({ origin: true, credentials: true });

  const port = Number(process.env.PORT) || 3000;
  const server = await app.listen(port);
  app.get(WsService).attach(server);
  // eslint-disable-next-line no-console
  console.log(`Fable server listening on :${port}`);
}
bootstrap();
