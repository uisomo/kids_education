import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.alan.karate",
  appName: "アランの空手",
  webDir: "karate-trainer/dist",
  // No server.iosScheme: WKWebView can't serve "https" from the app, so
  // Capacitor silently used its default capacitor://localhost anyway. That
  // origin is where localStorage and IndexedDB live — changing the scheme or
  // hostname later would make every user's saved data disappear.
};

export default config;
