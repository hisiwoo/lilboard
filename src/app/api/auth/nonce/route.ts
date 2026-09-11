import { issueNonce, loginMessage } from "@/lib/auth";
import { json } from "@/lib/api";

export async function POST() {
  const nonce = issueNonce();
  return json({ nonce, message: loginMessage(nonce) });
}
