/**
 * Display keepalive ref-counting and teardown safety.
 * Run with: npx tsx scripts/test-display-keepalive.ts
 */

import assert from "node:assert/strict";

function installMinimalDom() {
  const bodyChildren: Array<{ remove: () => void }> = [];

  class FakeVideo {
    muted = false;
    defaultMuted = false;
    playsInline = false;
    autoplay = false;
    loop = false;
    volume = 1;
    paused = true;
    ended = false;
    src = "";
    style = { cssText: "" };
    setAttribute(_name?: string, _value?: string) {}
    removeAttribute() {}
    load() {}
    pause() {
      this.paused = true;
    }
    async play() {
      this.paused = false;
    }
    remove() {
      const index = bodyChildren.indexOf(this);
      if (index >= 0) bodyChildren.splice(index, 1);
    }
  }

  class FakeCanvas {
    width = 0;
    height = 0;
    style = { cssText: "" };
    setAttribute(_name?: string, _value?: string) {}
    getContext() {
      return {
        fillStyle: "#000",
        fillRect() {}
      };
    }
    remove() {
      const index = bodyChildren.indexOf(this);
      if (index >= 0) bodyChildren.splice(index, 1);
    }
  }

  const documentStub = {
    visibilityState: "visible",
    body: {
      appendChild(node: { remove: () => void }) {
        bodyChildren.push(node);
        return node;
      }
    },
    createElement(tag: string) {
      if (tag === "video") return new FakeVideo();
      if (tag === "canvas") return new FakeCanvas();
      throw new Error(`Unexpected createElement(${tag})`);
    },
    addEventListener() {},
    removeEventListener() {}
  };

  const windowStub = {
    document: documentStub,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    addEventListener() {},
    removeEventListener() {}
  };

  Object.assign(globalThis, {
    window: windowStub,
    document: documentStub,
    HTMLVideoElement: FakeVideo,
    HTMLCanvasElement: FakeCanvas
  });
}

async function main() {
  installMinimalDom();

  const {
    startDisplayKeepaliveFallback,
    stopDisplayKeepaliveFallback,
    __displayKeepaliveActiveForTests,
    __displayKeepaliveConsumerCountForTests
  } = await import("../lib/display-keepalive-fallback");

  assert.equal(__displayKeepaliveActiveForTests(), false);
  assert.equal(__displayKeepaliveConsumerCountForTests(), 0);

  const stopA = startDisplayKeepaliveFallback();
  assert.equal(__displayKeepaliveActiveForTests(), true);
  assert.equal(__displayKeepaliveConsumerCountForTests(), 1);

  const stopB = startDisplayKeepaliveFallback();
  assert.equal(__displayKeepaliveConsumerCountForTests(), 2);
  assert.equal(__displayKeepaliveActiveForTests(), true);

  // Stopping one consumer must not tear down the shared engine (renew-safe).
  stopA();
  assert.equal(__displayKeepaliveConsumerCountForTests(), 1);
  assert.equal(__displayKeepaliveActiveForTests(), true);

  stopA(); // idempotent
  assert.equal(__displayKeepaliveConsumerCountForTests(), 1);

  stopB();
  assert.equal(__displayKeepaliveConsumerCountForTests(), 0);
  assert.equal(__displayKeepaliveActiveForTests(), false);

  const stopC = startDisplayKeepaliveFallback();
  assert.equal(__displayKeepaliveActiveForTests(), true);
  stopDisplayKeepaliveFallback();
  assert.equal(__displayKeepaliveConsumerCountForTests(), 0);
  assert.equal(__displayKeepaliveActiveForTests(), false);
  stopC(); // safe after force-stop

  console.log("display-keepalive: all tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
