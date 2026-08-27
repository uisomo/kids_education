import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ushimaru.karatetrainer",
  appName: "空手稽古",
  webDir: "dist",
  server: {
    // getUserMedia / MediaRecorder / IndexedDB は secure context 必須。
    iosScheme: "https",
  },
};

export default config;
