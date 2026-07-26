import { redirect } from "next/navigation";

export default function RouteGeneratorRedirectPage() {
  redirect("/admin?board=staff&tab=route_generator");
}
