import { redirect } from "next/navigation";

export default function AdminLobbyRedirectPage() {
  redirect("/admin?board=lobby");
}
