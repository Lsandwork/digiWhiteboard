import { redirect } from "next/navigation";

export default function LobbyCastDisplayPage() {
  redirect("/lobby/checkouts?display=tv&chromecast=1&castMode=1");
}
