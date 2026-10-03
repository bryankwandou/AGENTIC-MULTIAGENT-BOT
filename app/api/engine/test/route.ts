import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { EngineError, openEngineStream, requestEngine } from "@/lib/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** One tiny round-trip to prove a key + model actually answer. Nothing is stored. */
export async function POST(request: Request) {
  const limit = rateLimit(`test:${clientKey(request)}`, 10);
  if (!limit.ok) return Response.json({ ok: false, error: `Slow down — retry in ${limit.retryAfter}s.` }, { status: 429 });

  const { engine, error } = requestEngine(request);
  if (error) return Response.json({ ok: false, error }, { status: 400 });
  if (!engine) return Response.json({ ok: false, error: "No key given and no server engine configured — the station is in demo mode." }, { status: 400 });

  const started = Date.now();
  try {
    const { model, tokens } = await openEngineStream(engine, {
      system: "You are a connection check. Reply with exactly: AXIOM ONLINE",
      messages: [{ role: "user", content: "Status?" }],
      temperature: 0,
      maxTokens: 24,
      signal: request.signal,
    });
    let reply = "";
    for await (const t of tokens) {
      reply += t;
      if (reply.length > 80) break;
    }
    return Response.json({ ok: true, provider: engine.provider, name: engine.name, model, ms: Date.now() - started, reply: reply.trim().slice(0, 80) });
  } catch (err) {
    const status = err instanceof EngineError ? err.status : 502;
    return Response.json({ ok: false, status, error: err instanceof Error ? err.message : "Engine failed." }, { status: 200 });
  }
}
