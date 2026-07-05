import { redirect } from "next/navigation";

export default function AdminTrainerComplaintsPage() {
  redirect("/admin?board=staff&tab=ms_trainer_complaints");
}
