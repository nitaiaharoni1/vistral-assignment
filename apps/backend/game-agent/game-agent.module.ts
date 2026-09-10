import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { GameAgentController } from "./game-agent.controller";
import { GameAgentWriteGuard } from "./guards/game-agent-write.guard";
import { GameAgentBoardService } from "./services/game-agent-board/game-agent-board.service";
import { GameAgentService } from "./services/game-agent/game-agent.service";
import { GameAgentStorageService } from "./services/game-agent-storage/game-agent-storage.service";
import { GameAgentAnalyzeService } from "./services/game-agent-analyze/game-agent-analyze.service";

@Module({
  imports: [CommonModule],
  controllers: [GameAgentController],
  providers: [GameAgentService, GameAgentBoardService, GameAgentStorageService, GameAgentAnalyzeService, GameAgentWriteGuard],
})
export class GameAgentModule {}
