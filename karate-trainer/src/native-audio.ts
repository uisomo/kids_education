// Native music and character-voice playback for the iOS build.
//
// Through the web page, iOS let only one sound play at a time — a character's
// voice paused the music — and ignored the page's volume. Both now play through
// the native AudioController (ios/App/App/KarateRecorder/AudioController.swift).
import type { BgmPlayer } from "./app";
import { karateRecorderPlugin, type KarateRecorderPluginLike } from "./native-recorder";

const warnOnFailure = (what: string) => (e: unknown) => console.warn(`native ${what} failed`, e);

// Same behaviour as the web BgmPlayer: play() starts from the top, muting pauses,
// unmuting resumes — or starts, if the session began muted.
export function makeNativeBgm(
  src: string,
  volume: number,
  plugin: KarateRecorderPluginLike = karateRecorderPlugin(),
): BgmPlayer {
  let muted = false;
  let active = false;
  let started = false;
  const start = () => {
    started = true;
    void plugin.playMusic({ src, volume }).catch(warnOnFailure("music"));
  };
  return {
    src,
    unlock() { /* native playback needs no user gesture */ },
    play() {
      active = true;
      started = false;
      if (!muted) start();
    },
    stop() {
      active = false;
      started = false;
      void plugin.stopMusic().catch(warnOnFailure("music stop"));
    },
    setMuted(next: boolean) {
      muted = next;
      if (!active) return;
      if (muted) void plugin.setMusicPaused({ paused: true }).catch(warnOnFailure("music pause"));
      else if (started) void plugin.setMusicPaused({ paused: false }).catch(warnOnFailure("music resume"));
      else start();
    },
    isMuted() {
      return muted;
    },
  };
}

export function playNativeClip(
  src: string,
  volume: number,
  plugin: KarateRecorderPluginLike = karateRecorderPlugin(),
): void {
  void plugin.playClip({ src, volume }).catch(warnOnFailure("cheer voice"));
}
