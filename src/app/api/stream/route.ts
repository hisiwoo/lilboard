import { ensureHydrated, subscribe } from "@/lib/canvas";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureHydrated();
  const enc = new TextEncoder();
  let unsub = () => {};
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      unsub = subscribe(send);
      timer = setInterval(() => controller.enqueue(enc.encode(": ping\n\n")), 20000);
      req.signal.addEventListener("abort", () => { unsub(); clearInterval(timer); try { controller.close(); } catch {} });
    },
    cancel() { unsub(); clearInterval(timer); },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
