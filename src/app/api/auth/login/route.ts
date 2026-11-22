import { cookies } from "next/headers";
import { signIn } from "@/lib/server/auth";

export async function POST(req: Request) {
  return signIn("login", req, await cookies());
}
