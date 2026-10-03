import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { EngineError, listEngineModels, requestEngine } from "@/lib/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lists the models the operator's engine offers (GET {base}/models). Nothing is stored. */
export async function GET(request: Request) {
  const limit = rateLimit(`models:${clientKey(request)}`, 20);
  if (!limit.ok) return Response.json({ ok: false, error: `Slow down — retry in ${limit.retryAfter}s.` }, { status: 429 });
  const { engine, error } = requestEngine(request);
  if (error) return Response.json({ ok: false, error }, { status: 400 });
  if (!engine) return Response.json({ ok: false, error: "No engine configured." }, { status: 400 });
  try {
    const models = await listEngineModels(engine, AbortSignal.timeout(15_000));
    return Response.json({ ok: true, models });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof EngineError || err instanceof Error ? err.message : "Could not list models." });
  }
}
