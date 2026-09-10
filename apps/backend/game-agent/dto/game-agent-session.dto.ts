import { IsInt } from "class-validator";
import type { SessionRequest } from "../../../../shared/game-agent-protocol/game-agent-protocol";
import { IsGameAgentUuid } from "./dto.decorators";

export class GameAgentSessionDto implements SessionRequest {
  @IsGameAgentUuid()
  sessionId!: string;

  @IsInt({ message: "Invalid session." })
  revision!: number;
}
