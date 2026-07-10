import { redirect } from "next/navigation";

export default function RemoteWhiteboardCastRedirect() {
  redirect("/admin?board=staff&tab=remote_cast");
}
