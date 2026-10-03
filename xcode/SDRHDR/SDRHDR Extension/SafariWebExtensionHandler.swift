//
//  SafariWebExtensionHandler.swift
//  SDRHDR Extension
//
//  Created by 김민규 on 2026. 9. 30..
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    // 설정 백업 (FIX_GUIDE U1). 키 1개, JSON 문자열, 최대 16 KB.
    private static let backupDefaultsKey = "sdrhdr.settingsBackup"
    private static let backupMaxBytes = 16384

    private func handle(_ message: Any?) -> [String: Any] {
        guard let dict = message as? [String: Any], let type = dict["type"] as? String else {
            os_log(.default, "native message: invalid")
            return ["ok": false]
        }
        os_log(.default, "native message type: %{public}@", type)

        switch type {
        case "backup:set":
            guard let data = dict["data"] as? [String: Any],
                  JSONSerialization.isValidJSONObject(data),
                  let bytes = try? JSONSerialization.data(withJSONObject: data),
                  bytes.count <= Self.backupMaxBytes,
                  let json = String(data: bytes, encoding: .utf8) else {
                return ["ok": false]
            }
            UserDefaults.standard.set(json, forKey: Self.backupDefaultsKey)
            return ["ok": true]
        case "backup:get":
            if let json = UserDefaults.standard.string(forKey: Self.backupDefaultsKey),
               let bytes = json.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] {
                return ["ok": true, "data": obj]
            }
            return ["ok": true, "data": NSNull()]
        default:
            return ["ok": false]
        }
    }

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        let result = handle(message)

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [ SFExtensionMessageKey: result ]
        } else {
            response.userInfo = [ "message": result ]
        }

        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

}
