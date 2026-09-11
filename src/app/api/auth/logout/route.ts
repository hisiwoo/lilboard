import { logout } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST() {
  await logout();
  return json({ ok: true });
}
