import { verifyLogin } from "@/lib/auth";
import { handle, json } from "@/lib/api";

export async function POST(req: Request) {
  return handle(async () => {
    const { wallet, nonce, signature } = await req.json();
    await verifyLogin(String(wallet), String(nonce), String(signature));
    return json({ ok: true, wallet });
  });
}
