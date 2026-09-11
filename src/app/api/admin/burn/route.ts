import { requireAdmin } from "@/lib/admin";
import { handle } from "@/lib/api";
import { GET as runBurn } from "../../cron/burn/route";

/** Admin-triggered burn: same logic as the cron, authorized by admin session instead of CRON_SECRET. */
export async function POST() {
  return handle(async () => {
    await requireAdmin();
    return runBurn(new Request("http://internal/api/cron/burn", { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } }));
  });
}
