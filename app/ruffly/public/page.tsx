import Image from "next/image";
import Link from "next/link";
import Script from "next/script";

export const dynamic = "force-dynamic";

const WEBCHAT_SITE_KEY = process.env.RUFFLY_WEBCHAT_SITE_KEY?.trim() || "";
const WEBCHAT_API_BASE = (process.env.RUFFLY_API_BASE_URL?.trim() || "https://staff.ruffops.com").replace(/\/$/, "");

export default function RufflyPublicHomePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(160deg,#fff8f3_0%,#ffffff_45%,#f3f4f6_100%)] text-[#1f2933]">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <Image src="/ruffly/icon.svg" alt="Ruffly" width={64} height={64} className="mb-6" />
        <h1 className="font-serif text-5xl tracking-tight text-[#1f2933]">Ruffly</h1>
        <p className="mt-3 max-w-xl text-lg text-slate-600">
          Fitdog Customer Care — secure review links, feedback forms, chat, and campaign pages.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="rounded-xl bg-[#ff6f26] px-5 py-3 text-sm font-semibold text-white" href="https://staff.ruffops.com/ruffly">
            Staff sign-in
          </Link>
          <a className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700" href="/widget.js">
            Chat widget script
          </a>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          Prefer chatting now? Use the orange <strong>Chat with Fitdog</strong> button in the corner.
        </p>
      </div>

      {WEBCHAT_SITE_KEY ? (
        <>
          <Script id="ruffly-webchat-config" strategy="beforeInteractive">
            {`window.__RUFFLY_WIDGET__=${JSON.stringify({ key: WEBCHAT_SITE_KEY, api: WEBCHAT_API_BASE })};`}
          </Script>
          <Script src={`${WEBCHAT_API_BASE}/widget.js`} strategy="afterInteractive" />
        </>
      ) : null}
    </main>
  );
}
