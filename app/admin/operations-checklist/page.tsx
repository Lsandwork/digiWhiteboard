import { redirect } from "next/navigation";

export default function OperationsChecklistPage() {
  redirect("/admin?board=staff&tab=operations_checklist");
}
