"use client";

import { memo, useEffect } from "react";
import Image from "next/image";
import { CastLiteClock } from "@/components/cast-lite/CastLiteClock";
import { CastLiteDebugPanel } from "@/components/cast-lite/CastLiteDebugPanel";
import { CastLiteDogCard } from "@/components/cast-lite/CastLiteDogCard";
import { useSearchParams } from "next/navigation";
import { CastDisplaySession } from "@/components/cast-lite/CastDisplaySession";
import { CastKeeperProvider, useCastKeeperContext } from "@/hooks/useCastKeeper";
import { useWhiteboardCastState } from "@/hooks/useWhiteboardCastState";
import { lobbyAssets } from "@/lib/lobby/assets";
import type { CastLiteOptions } from "@/lib/whiteboard/cast-options";
import type { LobbyCheckoutDog } from "@/lib/lobby/types";
import type { LobbyWhiteboardStatePayload } from "@/lib/whiteboard/state";

type LobbyCastLiteBoardProps = {
  options: CastLiteOptions;
  embeddedDisplayToken?: string;
};

function toCastDog(dog: LobbyCheckoutDog) {
  return {
    id: dog.id,
    gingr_animal_id: dog.gingr_animal_id,
    animal_name: dog.dog_name,
    owner_name: null,
    photo_url: dog.dog_photo_url,
    room: dog.checkout_status,
    display_status: "checking_out" as const,
    status_started_at: dog.prompted_at,
    display_until: dog.display_until
  };
}

const LobbyCheckoutPanels = memo(function LobbyCheckoutPanels({
  payload,
  lowMotion
}: {
  payload: LobbyWhiteboardStatePayload;
  lowMotion: boolean;
}) {
  const dogs = [payload.featured, ...payload.queue].filter(Boolean) as LobbyCheckoutDog[];

  if (!dogs.length) {
    return (
      <section className="cast-lite-lobby-idle">
        <p>{payload.settings.lobby_message ?? "Thank you for letting us play, care & connect!"}</p>
      </section>
    );
  }

  return (
    <section className="cast-lite-lobby-checkouts">
      {payload.featured ? (
        <CastLiteDogCard dog={toCastDog(payload.featured)} mode="out" lowMotion={lowMotion} />
      ) : null}
      <div className="cast-lite-lobby-queue">
        {payload.queue.map((dog) => (
          <CastLiteDogCard key={dog.id} dog={toCastDog(dog)} mode="out" lowMotion={lowMotion} />
        ))}
      </div>
    </section>
  );
});

function LobbyCastLiteContent({
  options,
  chromecastReceiver
}: LobbyCastLiteBoardProps & { chromecastReceiver: boolean }) {
  const castKeeper = useCastKeeperContext();
  const { state, health, showReconnecting } = useWhiteboardCastState({
    board: "lobby",
    noVideo: true,
    enabled: true,
    debug: options.debugBoard
  });

  useEffect(() => {
    if (state?.updatedAt) {
      castKeeper?.markDataFresh();
    }
  }, [castKeeper, state?.updatedAt, state?.version]);

  useEffect(() => {
    document.documentElement.classList.add("cast-lite-mode", "lobby-tv-display");
    if (options.lowMotion) document.documentElement.classList.add("cast-lite-low-motion");
    return () => {
      document.documentElement.classList.remove("cast-lite-mode", "lobby-tv-display", "cast-lite-low-motion");
    };
  }, [options.lowMotion]);

  const payload = state?.payload.boardType === "lobby" ? state.payload : null;

  return (
    <main className="cast-lite-shell cast-lite-shell--lobby">
      <CastDisplaySession receiver={chromecastReceiver} />
      <Image src={lobbyAssets.background} alt="" fill priority className="cast-lite-lobby-bg" unoptimized />

      <header className="cast-lite-header cast-lite-header--lobby">
        <div className="cast-lite-brand">
          <Image src={lobbyAssets.appIcon192} alt="Fitdog" width={40} height={40} />
          <div>
            <p className="cast-lite-brand__title">Lobby Checkout Board</p>
            <p className="cast-lite-brand__subtitle">Cast Mode</p>
          </div>
        </div>
        <CastLiteClock />
      </header>

      {showReconnecting ? <p className="cast-lite-reconnect">Reconnecting…</p> : null}

      {payload ? <LobbyCheckoutPanels payload={payload} lowMotion={options.lowMotion} /> : null}

      {payload?.settings.footer_message ? (
        <footer className="cast-lite-lobby-footer">{payload.settings.footer_message}</footer>
      ) : null}

      {options.debugBoard ? <CastLiteDebugPanel health={health} showReconnecting={showReconnecting} /> : null}
    </main>
  );
}

export function LobbyCastLiteBoard({ options, embeddedDisplayToken }: LobbyCastLiteBoardProps) {
  void embeddedDisplayToken;
  const searchParams = useSearchParams();
  const chromecastReceiver =
    searchParams.get("chromecast") === "1" || searchParams.get("display") === "tv";

  return (
    <CastKeeperProvider
      displayType="lobby_whiteboard"
      route="/lobby-cast"
      enabled
      allowStaleReload={!chromecastReceiver}
    >
      <LobbyCastLiteContent options={options} chromecastReceiver={chromecastReceiver} />
    </CastKeeperProvider>
  );
}
