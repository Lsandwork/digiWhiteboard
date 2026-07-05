import { redirect } from "next/navigation";

export default function AdminYardLinksPage() {
  redirect("/admin?board=staff&tab=yard_links");
}
