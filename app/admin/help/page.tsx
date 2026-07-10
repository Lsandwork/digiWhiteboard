import { redirect } from "next/navigation";

export default function AdminHelpRedirectPage() {
  redirect("/admin?board=staff&tab=help");
}
