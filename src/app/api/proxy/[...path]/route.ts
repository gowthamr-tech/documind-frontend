// Thin adapter: the proxy logic lives in @/lib/server/proxy (unit-tested without Next).
import { cookies } from "next/headers";
import { proxy } from "@/lib/server/proxy";

export const dynamic = "force-dynamic";

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(req, path, await cookies());
}

export { handle as GET, handle as POST, handle as DELETE, handle as PUT, handle as PATCH };
