import { requireWallet } from "./auth";

const ADMINS = (process.env.ADMIN_WALLETS || "").split(",").map((s) => s.trim()).filter(Boolean);

export function isAdminWallet(wallet: string | null) { return !!wallet && ADMINS.includes(wallet); }

export async function requireAdmin() {
  const wallet = await requireWallet();
  if (!isAdminWallet(wallet)) throw new Error("not an admin");
  return wallet;
}
