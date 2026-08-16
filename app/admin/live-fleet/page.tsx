import { redirect } from "next/navigation";

export default function LiveFleetPage() {
  redirect("/admin?board=staff&tab=live_fleet");
}
