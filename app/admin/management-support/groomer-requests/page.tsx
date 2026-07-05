import { redirect } from "next/navigation";

export default function AdminGroomerRequestsPage() {
  redirect("/admin?board=staff&tab=ms_groomer_requests");
}
