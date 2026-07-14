import { redirect } from "next/navigation";

export default function AdminCastTvPage() {
  redirect("/admin?board=marketing&tab=cast_tv");
}
