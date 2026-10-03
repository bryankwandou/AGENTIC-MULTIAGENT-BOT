import { megapromptStats } from "@/lib/megaprompt";
import { describeEngine, localEnginesAllowed, serverEngine } from "@/lib/server/engine";

export const dynamic = "force-dynamic";

export function GET() {
  const engine = describeEngine(serverEngine());
  return Response.json(
    {
      ready: Boolean(engine),
      mode: engine ? "live" : "demo",
      engine,
      models: engine?.models ?? [],
      byok: process.env.ALLOW_BYOK !== "false",
      // Whether this server may proxy runtimes on the operator's machine (Ollama, LM Studio…).
      localEngines: localEnginesAllowed() && process.env.ALLOW_BYOK !== "false",
      megaprompt: megapromptStats(),
      version: "1.2.0",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
