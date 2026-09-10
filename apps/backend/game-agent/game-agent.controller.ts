import { Body } from "@nestjs/common";
import { Controller } from "@nestjs/common";
import { Get } from "@nestjs/common";
import { HttpCode } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { Post } from "@nestjs/common";
import { UseGuards } from "@nestjs/common";
import { GAME_AGENT_API_PATH } from "../../../shared/game-agent-protocol/game-agent-protocol";
import type { GameAgentRoutes } from "../../../shared/game-agent-protocol/game-agent-protocol";
import type { GameAgentStatusReply } from "../../../shared/game-agent-protocol/game-agent-protocol";
import { bodyDto } from "../common/validation/body-dto";
import { GameAgentAnalyzeDto } from "./dto/game-agent-analyze.dto";
import { GameAgentCreateSessionDto } from "./dto/game-agent-create-session.dto";
import { GameAgentFeedbackDto } from "./dto/game-agent-feedback.dto";
import { GameAgentSessionDto } from "./dto/game-agent-session.dto";
import { GameAgentWriteGuard } from "./guards/game-agent-write.guard";
import { GameAgentService } from "./services/game-agent/game-agent.service";

@Controller(GAME_AGENT_API_PATH)
@UseGuards(GameAgentWriteGuard)
export class GameAgentController {
  constructor(@Inject(GameAgentService) private readonly gameAgent: GameAgentService) {}

  // Reports whether a model key is configured.
  @Get("status")
  public status(): GameAgentStatusReply {
    return this.gameAgent.status();
  }

  // Opens a new game session.
  @Post("sessions")
  @HttpCode(200)
  public create(
    @Body(bodyDto(GameAgentCreateSessionDto))
    input: GameAgentRoutes["sessions"]["request"],
  ): Promise<GameAgentRoutes["sessions"]["response"]> {
    return this.gameAgent.createSession(input);
  }

  // Returns the current session reply.
  @Post("sync")
  @HttpCode(200)
  public sync(
    @Body(bodyDto(GameAgentSessionDto))
    input: GameAgentRoutes["sync"]["request"],
  ): GameAgentRoutes["sync"]["response"] {
    return this.gameAgent.sync(input);
  }

  // Reads a board snapshot for a session.
  @Post("analyze")
  @HttpCode(200)
  public analyze(
    @Body(bodyDto(GameAgentAnalyzeDto))
    input: GameAgentRoutes["analyze"]["request"],
  ): Promise<GameAgentRoutes["analyze"]["response"]> {
    return this.gameAgent.analyze(input);
  }

  // Saves a player-corrected board.
  @Post("feedback")
  @HttpCode(200)
  public feedback(
    @Body(bodyDto(GameAgentFeedbackDto))
    input: GameAgentRoutes["feedback"]["request"],
  ): Promise<GameAgentRoutes["feedback"]["response"]> {
    return this.gameAgent.feedback(input);
  }
}
