import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type LobbyCastPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LobbyCastPage({ searchParams }: LobbyCastPageProps) {
  const params = await searchParams;
  const url = new URLSearchParams();

  url.set("display", "tv");
  url.set("castMode", "1");
  if (params.chromecast !== "0") {
    url.set("chromecast", "1");
  }

  const token = params.token;
  if (typeof token === "string" && token.trim()) {
    url.set("token", token.trim());
  }

  if (params.debugBoard === "1") {
    url.set("debugBoard", "1");
  }

  redirect(`/lobby/checkouts?${url.toString()}`);
}
