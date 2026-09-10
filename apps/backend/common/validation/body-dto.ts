import { HttpException } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import type { Type } from "@nestjs/common";
import type { ValidationError } from "@nestjs/common";

// tsx does not emit design:paramtypes, so the pipe must be told the DTO class.
export function bodyDto(dto: Type<object>) {
  return new ValidationPipe({
    expectedType: dto,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    stopAtFirstError: true,
    exceptionFactory: (errors) => new HttpException({ error: dtoMessage(errors) }, 400),
  });
}

// Picks a client-safe validation message, or a generic fallback.
function dtoMessage(errors: ValidationError[]): string {
  const text = firstConstraint(errors);
  if (!text || text.includes("should not exist")) return "Invalid request.";
  return text;
}

// Returns the first constraint text from a validation tree.
function firstConstraint(errors: ValidationError[]): string | undefined {
  const error = errors[0];
  if (!error) return undefined;
  const messages = error.constraints ? Object.values(error.constraints) : [];
  return messages[0] ?? firstConstraint(error.children ?? []);
}
