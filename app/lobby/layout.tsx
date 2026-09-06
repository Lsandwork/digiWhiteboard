import type { Metadata, Viewport } from "next";
import { lobbyAssets } from "@/lib/lobby/assets";

export const metadata: Metadata = {
  title: "Fitdog Lobby Checkout Board",
  description: "Lobby display for dogs currently checking out at Fitdog Health & Social Club.",
  icons: {
    icon: lobbyAssets.appIcon192,
    apple: lobbyAssets.appIcon192
  }
};

/**
 * Match `app/display/layout.tsx`: lock page zoom at the document level so Fully
 * Kiosk / TV WebViews do not paint a zoomed first frame before the TV canvas
 * hook runs. Cast-TV does not need this because it is fluid `inset:0` media.
 */
export const viewport: Viewport = {
  themeColor: "#f7f9fc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

/** Runs before React — reset Fully page zoom as early as casttv's full-bleed paint. */
const LOBBY_TV_ZOOM_BOOT_SCRIPT = `(function(){try{var f=window.fully;if(f){try{if(typeof f.setScale==="function")f.setScale(1);}catch(e0){}try{if(typeof f.resetScale==="function")f.resetScale();}catch(e1){}}try{document.documentElement.style.zoom="1";}catch(e2){}try{if(document.body)document.body.style.zoom="1";}catch(e3){}try{window.scrollTo(0,0);}catch(e4){}}catch(e){}})();`;

export default function LobbyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: LOBBY_TV_ZOOM_BOOT_SCRIPT }} />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Montserrat:wght@700;800;900&display=swap"
      />
      <div
        className="lobby-root lobby-root--light"
        style={
          {
            "--font-lobby-display": '"Montserrat", sans-serif',
            "--font-lobby-script": '"Caveat", cursive'
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </>
  );
}
