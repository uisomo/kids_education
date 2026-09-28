import Foundation
import Security

/// アランの アプリ ぜんぶで おなじ App User ID（RevenueCat）。SERIES_GUIDE 5.8b。
///
/// キーチェーンの 共有グループ `5PBG36CV85.com.alan.shared` に 1つ だけ おく。
/// どの アプリが さきに 開いても おなじ ID を つかうので、1つの アプリで スイートを 買うと
/// ほかの アプリでも entitlement `alan_suite` が 見える。アプリを けしても のこる（キーチェーン）。
/// iCloud キーチェーンが オンなら おなじ Apple ID の ほかの 端末にも。
///
/// アプリの Entitlements に 必要：
///   keychain-access-groups = [ "$(AppIdentifierPrefix)com.alan.shared" ]
/// ない ときは nil（RevenueCat の 匿名 ID に なる。スイートは その アプリの 中だけ）。
///
/// Capacitor の アプリへは packages/billing/ios/AlanSuitePlugin.swift と いっしょに sync する（手で 直さない）。
public enum AlanSharedAccount {
    public static let accessGroup = "5PBG36CV85.com.alan.shared"
    static let service = "com.alan.suite"
    static let account = "appUserId"

    /// 共有の ID。なければ つくる（`alan_` ＋ UUID）。共有グループが つかえなければ nil。
    public static func userId() -> String? {
        if let id = read() { return id }
        let id = "alan_" + UUID().uuidString.lowercased()
        return write(id) ? id : read() // ほかの アプリと 同時に つくった ときは さきの ほう
    }

    static func read() -> String? {
        var q = base()
        q[kSecAttrSynchronizable as String] = kSecAttrSynchronizableAny
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data, let id = String(data: data, encoding: .utf8), !id.isEmpty else { return nil }
        return id
    }

    static func write(_ id: String) -> Bool {
        var q = base()
        q[kSecAttrSynchronizable as String] = true
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        q[kSecValueData as String] = Data(id.utf8)
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func base() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }
}
