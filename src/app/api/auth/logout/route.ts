import { cookies } from "next/headers";
import { signOut } from "@/lib/server/auth";

export async function POST(req: Request) {
  return signOut(req, await cookies());
}
