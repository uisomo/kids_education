// @vitest-environment jsdom
import {it,expect,vi} from "vitest";
import {openSavedVideoModal} from "../../karate-trainer/src/ui/saved-video-modal";
it("postpones finishing, waits for cancellation, then releases the screen",async()=>{
  vi.spyOn(HTMLMediaElement.prototype,"pause").mockImplementation(()=>{});
  let release!:()=>void;
  const stopped=new Promise<void>(r=>release=r);
  const postpone=vi.fn(()=>stopped),closed=vi.fn(),save=vi.fn();
  openSavedVideoModal(document.body,{saving:{progress:0.6,onProgress(){},done:new Promise(()=>{})},shareAllowed:false,onSave:save,onSend(){},onShown(){},onClose:closed,onPostpone:postpone});
  const button=[...document.querySelectorAll("button")].find(b=>b.textContent?.includes("仕上げずに"))!;
  button.click(); expect(postpone).toHaveBeenCalledOnce();expect(closed).not.toHaveBeenCalled();expect(button.disabled).toBe(true);
  release();await stopped;await Promise.resolve();
  expect(closed).toHaveBeenCalledOnce();expect(document.querySelector("[data-saved-video-modal]")).toBeNull();expect(save).not.toHaveBeenCalled();
});
it("keeps the exit choice usable if native cancellation fails",async()=>{
  const close=vi.fn();openSavedVideoModal(document.body,{saving:{progress:0.6,onProgress(){},done:new Promise(()=>{})},shareAllowed:false,onSave(){},onSend(){},onShown(){},onClose:close,onPostpone:async()=>{throw new Error("busy")}});
  const button=[...document.querySelectorAll("button")].find(b=>b.textContent?.includes("仕上げずに"))!;
  button.click();await Promise.resolve();await Promise.resolve();expect(button.disabled).toBe(false);expect(close).not.toHaveBeenCalled();
});
