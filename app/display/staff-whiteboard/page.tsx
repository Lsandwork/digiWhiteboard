import { redirect } from "next/navigation";

export default function StaffCastDisplayPage() {
  redirect("/?display=tv&chromecast=1&castMode=1");
}
