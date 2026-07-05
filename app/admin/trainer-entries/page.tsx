import { redirect } from "next/navigation";

export default function AdminTrainerEntriesPage() {
  redirect("/admin?board=staff&tab=admin_trainer_entries");
}
