import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { TestDbService } from './test-db.service';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DbService)
    .useClass(TestDbService)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  await app.init();
  return app;
}

/** Extract the Set-Cookie header value for a given cookie name. */
export function extractCookie(res: any, name: string): string | undefined {
  const cookies: string[] = [].concat(res.headers['set-cookie'] ?? []);
  const entry = cookies.find((c: string) => c.startsWith(`${name}=`));
  return entry;
}
