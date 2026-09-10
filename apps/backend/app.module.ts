import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { CommonModule } from "./common/common.module";
import { GameAgentModule } from "./game-agent/game-agent.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";

@Module({
  imports: [CommonModule, GameAgentModule],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
