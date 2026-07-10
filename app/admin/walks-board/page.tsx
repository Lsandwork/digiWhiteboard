import { redirect } from "next/navigation";

export default function WalksBoardPage() {
  redirect("/admin?board=staff&tab=walks_board");
}
