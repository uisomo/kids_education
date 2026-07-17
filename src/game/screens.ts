export type ScreenName = "setup" | "subjects" | "units" | "arena";

export class ScreenRouter {
  current: ScreenName = "setup";
  show(name: ScreenName): void {
    document.querySelectorAll<HTMLElement>(".screen").forEach((el) =>
      el.classList.toggle("active", el.id === `screen-${name}`),
    );
    this.current = name;
  }
}
