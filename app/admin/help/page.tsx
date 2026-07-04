import { redirect } from "next/navigation";

export default function AdminHelpRedirectPage() {
  redirect("/admin?tab=help");
}
