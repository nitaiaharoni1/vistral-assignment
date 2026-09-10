import { IsOptional } from "class-validator";
import type { CreateSessionRequest } from "../../../../shared/game-agent-protocol/game-agent-protocol";
import { IsGameAgentUuid } from "./dto.decorators";

export class GameAgentCreateSessionDto implements CreateSessionRequest {
  @IsOptional()
  @IsGameAgentUuid({ message: "Invalid request." })
  profile?: string;
}
