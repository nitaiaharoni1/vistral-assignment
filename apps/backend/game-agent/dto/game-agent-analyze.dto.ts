import { IsIn } from "class-validator";
import { IsOptional } from "class-validator";
import { ANALYZE_TRIGGERS } from "../../../../shared/game-agent-protocol/game-agent-protocol";
import type { AnalyzeRequest } from "../../../../shared/game-agent-protocol/game-agent-protocol";
import type { AnalyzeTrigger } from "../../../../shared/game-agent-protocol/game-agent-protocol";
import { IsGameAgentUuid } from "./dto.decorators";
import { IsJpegImage } from "./dto.decorators";
import { GameAgentSessionDto } from "./game-agent-session.dto";

export class GameAgentAnalyzeDto extends GameAgentSessionDto implements AnalyzeRequest {
  @IsGameAgentUuid({ message: "Invalid request." })
  requestId!: string;

  @IsJpegImage()
  image!: string;

  @IsOptional()
  @IsIn(ANALYZE_TRIGGERS, { message: "Invalid request." })
  trigger?: AnalyzeTrigger;
}
