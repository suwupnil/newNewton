import SafariServices
import Foundation
import os.log

public final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let appGroupIdentifier = "group.com.newton.enhancer"
    private let authTokenKey = "newton_auth_token"

    public func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(.default, "Received message from browser.runtime.sendNativeMessage: %@ (profile: %@)", String(describing: message), profile?.uuidString ?? "none")

        var responsePayload: [String: Any] = ["echo": message ?? [:], "status": "ok"]

        // If the Safari extension sends an auth token to native host, store it in the shared App Group
        if let dict = message as? [String: Any],
           let action = dict["action"] as? String {
            if action == "SYNC_AUTH_TOKEN", let token = dict["token"] as? String, !token.isEmpty {
                UserDefaults(suiteName: appGroupIdentifier)?.set(token, forKey: authTokenKey)
                UserDefaults.standard.set(token, forKey: authTokenKey)
                responsePayload["tokenSaved"] = true
            } else if action == "GET_AUTH_TOKEN" {
                let stored = UserDefaults(suiteName: appGroupIdentifier)?.string(forKey: authTokenKey)
                    ?? UserDefaults.standard.string(forKey: authTokenKey)
                responsePayload["token"] = stored ?? ""
            }
        }

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: responsePayload]
        } else {
            response.userInfo = ["message": responsePayload]
        }

        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
