import "server-only";
import { openEngineStream, type Engine } from "@/lib/server/engine";
import type { Opener } from "./orchestrator";

/** Server-side opener: one streamed completion through the configured engine. */
export function engineOpener(engine: Engine): Opener {
  return (req) =>
    openEngineStream(engine, {
      system: req.system.slice(0, 100_000),
      messages: [{ role: "user", content: req.user }],
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
    });
}
