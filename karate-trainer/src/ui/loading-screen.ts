// Loading screen shown while the camera warms up (permission + stream start
// can take a moment). Full-screen Front.jpg with a spinner + message.

export function renderLoadingScreen(root: HTMLElement, message = "じゅんび中…"): void {
  root.textContent = "";
  root.className = "screen loading";

  const spinner = document.createElement("div");
  spinner.className = "loading-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const msg = document.createElement("div");
  msg.className = "loading-message";
  msg.dataset.loadingMessage = "";
  msg.textContent = message;

  root.append(spinner, msg);
}
