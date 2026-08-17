import { redirect } from "next/navigation";

export default function TlDigiBoardAdminPage() {
  redirect("/admin?board=staff&tab=tl_digi_board");
}
