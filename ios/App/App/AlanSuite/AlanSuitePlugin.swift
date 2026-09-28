import Capacitor
import Foundation

/// JS の alan-billing.js の sharedUserId() が よぶ。アランの アプリ ぜんぶで おなじ RevenueCat の App User ID。
/// 正本は アランの基盤/packages/billing/ios/（sync で 入る。手で 直さない）。
/// MainViewController の capacitorDidLoad で bridge?.registerPluginInstance(AlanSuitePlugin()) する。
@objc(AlanSuitePlugin)
public class AlanSuitePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AlanSuitePlugin"
    public let jsName = "AlanSuite"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sharedUserId", returnType: CAPPluginReturnPromise),
    ]

    @objc func sharedUserId(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            if let id = AlanSharedAccount.userId() {
                call.resolve(["id": id])
            } else {
                call.resolve([:]) // 共有グループが ない → 匿名
            }
        }
    }
}
