import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module';
import { ValidationPipe } from '@nestjs/common';
import serverlessExpress from 'serverless-http';
import { AllExceptionsFilter } from '../dist/shared/filters/all-exceptions.filter';
import { ExpressAdapter } from '@nestjs/platform-express';
const express = require('express');

let cachedServer: any;

async function bootstrap() {
  if (!cachedServer) {
    const expressApp = express();
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));
    
    app.enableCors();
    app.setGlobalPrefix('api/v1');

    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
    }));

    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
    cachedServer = serverlessExpress(expressApp);
  }
  return cachedServer;
}

export default async (req: any, res: any) => {
  const server = await bootstrap();
  return server(req, res);
};
