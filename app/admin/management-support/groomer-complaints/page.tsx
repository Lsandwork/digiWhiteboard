import { redirect } from "next/navigation";

export default function AdminGroomerComplaintsPage() {
  redirect("/admin?board=staff&tab=ms_groomer_complaints");
}
