// src/lib/auth.ts
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

/**
 * Returns the role of the currently authenticated user.
 * Expected roles: "admin" | "staff" | null (no role / not found).
 * This function works client‑side; server‑side routes should verify the ID token
 * and then call the same logic via the Admin SDK (not included in the MVP).
 */
export async function getUserRole(): Promise<string | null> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return null;
  const roleDoc = await getDoc(doc(db, "adminUsers", user.uid));
  if (!roleDoc.exists()) return null;
  const data = roleDoc.data();
  return data.role ?? null;
}
