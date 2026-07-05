import { redirect } from "next/navigation";

export default function AdminPackageCommissionsPage() {
  redirect("/admin?board=staff&tab=package_commissions");
}
