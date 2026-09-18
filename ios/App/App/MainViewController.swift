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
        hideKeyboardAccessoryBar()
        // One line in the device log confirms the bridge can resolve the plugin by
        // its JS name, which is what registerPlugin("KarateRecorder") relies on.
        // print(), not NSLog: on recent iOS simulators NSLog only reaches the
        // unified log, while Capacitor's own ⚡️ messages (and this) go to stdout.
        print("⚡️  [KarateRecorder] capacitorDidLoad ran; registered: \(bridge?.plugin(withName: "KarateRecorder") != nil ? "yes" : "no")")
    }

    /// iOS puts a ^ ⌄ ✓ bar above the keyboard for every text box in a web
    /// view. The app has one box at a time (工夫), so the bar only eats the room
    /// the video needs on the done screen. The web view's content view is
    /// swapped for a subclass whose inputAccessoryView is nil — the same trick
    /// as Capacitor's Keyboard plugin (setAccessoryBarVisible).
    private func hideKeyboardAccessoryBar() {
        guard let content = webView?.scrollView.subviews.first(where: {
            String(describing: type(of: $0)).hasPrefix("WKContent")
        }) else { return }
        let base: AnyClass = type(of: content)
        let name = "\(NSStringFromClass(base))_NoAccessoryBar"
        var subclass: AnyClass? = NSClassFromString(name)
        if subclass == nil, let made = objc_allocateClassPair(base, name, 0) {
            let getter = #selector(getter: UIResponder.inputAccessoryView)
            let nothing: @convention(block) (AnyObject) -> AnyObject? = { _ in nil }
            if let method = class_getInstanceMethod(base, getter) {
                class_addMethod(made, getter, imp_implementationWithBlock(nothing), method_getTypeEncoding(method))
            }
            objc_registerClassPair(made)
            subclass = made
        }
        if let subclass { object_setClass(content, subclass) }
    }
}
