import { redirect } from "next/navigation";

export default function AdminTrainerRequestsPage() {
  redirect("/admin?board=staff&tab=ms_trainer_requests");
}
