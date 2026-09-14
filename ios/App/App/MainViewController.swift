import Capacitor
import UIKit

/// Capacitor only auto-registers plugins listed in capacitor.config.json's
/// packageClassList, which `npx cap sync` builds from npm packages. Plugins
/// that live in the app target itself — like KarateRecorderPlugin — never
/// appear there, so they have to be registered by hand once the bridge exists.
/// Without this, registerPlugin("KarateRecorder") in JS resolves to a stub
/// that rejects every call with "not implemented on ios".
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(KarateRecorderPlugin())
        // One line in the device log confirms the bridge can resolve the plugin by
        // its JS name, which is what registerPlugin("KarateRecorder") relies on.
        // print(), not NSLog: on recent iOS simulators NSLog only reaches the
        // unified log, while Capacitor's own ⚡️ messages (and this) go to stdout.
        print("⚡️  [KarateRecorder] capacitorDidLoad ran; registered: \(bridge?.plugin(withName: "KarateRecorder") != nil ? "yes" : "no")")
    }
}
