import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

/** Shortcut to the logged-in brother's own profile. */
export default async function MyProfilePage() {
  const user = await requireUser();
  redirect(`/members/${user.id}`);
}
