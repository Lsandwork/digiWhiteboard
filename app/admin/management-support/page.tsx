import { redirect } from "next/navigation";

export default function AdminManagementSupportPage() {
  redirect("/admin?board=staff&tab=ms_hub");
}
