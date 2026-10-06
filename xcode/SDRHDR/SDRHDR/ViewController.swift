//
//  ViewController.swift
//  SDRHDR
//
//  Created by 김민규 on 2026. 9. 30..
//

import Cocoa
import SafariServices
import Security
import UniformTypeIdentifiers
import WebKit
import os

let extensionBundleIdentifier = "io.github.tmtmtmtmtmt.SDRHDR.Extension"

private let setupDoneVersionKey = "setupDoneVersion"
private let youtubeConfirmedKey = "youtubeConfirmed"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    private let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "io.github.tmtmtmtmtmt.SDRHDR", category: "setup")
    /// 이전 사본(자기 제외). JS 는 인덱스만 보낸다 (FIX_GUIDE W4 (e)).
    private var others: [(url: URL, info: CopyInfo)] = []
    private var selfIsNewest = false
    private var newestOtherIndex: Int?
    /// 더 새로워 보이는 다른 사본이 있지만 같은 서명 팀임을 확인할 수 없는 경우 (FIX_GUIDE Y1).
    private var newestUnverified = false
    private var notice: String?
    private var pageLoaded = false

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)

        NotificationCenter.default.addObserver(self, selector: #selector(appBecameActive), name: NSApplication.didBecomeActiveNotification, object: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        recheck()
    }

    @objc private func appBecameActive() {
        if pageLoaded { recheck() }
    }

    // MARK: - JS -> Swift

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String else { return }

        if body == "open-preferences" {
            // 설정을 연 뒤에도 앱은 종료하지 않는다. 다시 활성화되면 재점검한다.
            SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in }
        } else if body == "recheck" {
            recheck()
        } else if body == "open-newest" {
            openNewest()
        } else if body == "done" {
            finish()
        } else if body.hasPrefix("youtube:") {
            UserDefaults.standard.set(body == "youtube:1", forKey: youtubeConfirmedKey)
            recheck()
        } else if body.hasPrefix("reveal:"), let i = Int(body.dropFirst("reveal:".count)), others.indices.contains(i) {
            NSWorkspace.shared.activateFileViewerSelecting([others[i].url])
        } else if body.hasPrefix("trash:"), let i = Int(body.dropFirst("trash:".count)), others.indices.contains(i) {
            trash(index: i)
        }
    }

    // MARK: - 점검

    private func recheck() {
        let selfCopy = Self.describe(appURL: Bundle.main.bundleURL)
        let selfURL = Bundle.main.bundleURL.standardizedFileURL.resolvingSymlinksInPath()

        var found: [(url: URL, info: CopyInfo)] = []
        if let bid = Bundle.main.bundleIdentifier {
            for u in NSWorkspace.shared.urlsForApplications(withBundleIdentifier: bid) {
                let std = u.standardizedFileURL.resolvingSymlinksInPath()
                if std == selfURL { continue }
                if !FileManager.default.fileExists(atPath: u.path) { continue } // 유령 등록 제외
                if found.contains(where: { $0.url.standardizedFileURL.resolvingSymlinksInPath() == std }) { continue }
                found.append((u, Self.describe(appURL: u)))
            }
        }
        others = found

        let all = [selfCopy] + found.map { $0.info }
        let newest = newestIndex(all)
        selfIsNewest = (newest == 0) || found.isEmpty
        newestOtherIndex = nil
        newestUnverified = false
        if let n = newest, n > 0 {
            if canOfferOpen(selfTeam: selfCopy.teamID, otherTeam: found[n - 1].info.teamID) {
                newestOtherIndex = n - 1
            } else {
                newestUnverified = true
            }
        }
        log.notice("setup copies=\(found.count, privacy: .public) selfIsNewest=\(self.selfIsNewest, privacy: .public) ambiguous=\(newest == nil && !found.isEmpty, privacy: .public)")

        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { [weak self] (state, error) in
            DispatchQueue.main.async {
                guard let self = self else { return }
                let enabled: Bool? = (error == nil) ? state?.isEnabled : nil
                self.push(selfCopy: selfCopy, extEnabled: enabled, ambiguous: newest == nil && !found.isEmpty)
            }
        }
    }

    private func push(selfCopy: CopyInfo, extEnabled: Bool?, ambiguous: Bool) {
        let formatter = ISO8601DateFormatter()
        let defaults = UserDefaults.standard
        let doneVersion = defaults.string(forKey: setupDoneVersionKey)
        let state: [String: Any] = [
            "signed": selfCopy.signing == .signed,
            "selfVersion": selfCopy.version ?? "",
            "firstRun": doneVersion == nil,
            "versionChanged": doneVersion != nil && doneVersion != selfCopy.version,
            "selfIsNewest": selfIsNewest,
            "ambiguous": ambiguous,
            "newestOtherIndex": newestOtherIndex.map { $0 as Any } ?? NSNull(),
            "newestUnverified": newestUnverified,
            "copies": others.enumerated().map { (i, c) -> [String: Any] in
                [
                    "id": i,
                    "path": c.url.path,
                    "version": c.info.version ?? NSNull(),
                    "builtAt": c.info.builtAt.map { formatter.string(from: $0) } ?? NSNull(),
                    "signing": c.info.signing.rawValue,
                ]
            },
            "extEnabled": extEnabled.map { $0 as Any } ?? NSNull(),
            "youtubeConfirmed": defaults.bool(forKey: youtubeConfirmedKey),
            "notice": notice.map { $0 as Any } ?? NSNull(),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: state, options: [.withoutEscapingSlashes]),
              var json = String(data: data, encoding: .utf8) else { return }
        json = json.replacingOccurrences(of: "\u{2028}", with: "\\u2028").replacingOccurrences(of: "\u{2029}", with: "\\u2029")
        webView.evaluateJavaScript("render(\(json))")
    }

    // MARK: - 사본 정보 수집

    private static func describe(appURL: URL) -> CopyInfo {
        let appex = appURL.appendingPathComponent("Contents/PlugIns/SDRHDR Extension.appex")
        var version: String?
        let manifest = appex.appendingPathComponent("Contents/Resources/manifest.json")
        if let data = try? Data(contentsOf: manifest),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            version = obj["version"] as? String
        }
        let exe = appURL.appendingPathComponent("Contents/MacOS/SDRHDR")
        let builtAt = (try? FileManager.default.attributesOfItem(atPath: exe.path))?[.modificationDate] as? Date

        let (a, aTeam) = signingInfo(of: appURL)
        let (e, eTeam) = signingInfo(of: appex)
        let combined: Signing = (a == .signed && e == .signed) ? .signed : ((a == .adhoc || e == .adhoc) ? .adhoc : .unknown)
        let team: String? = (combined == .signed && aTeam != nil && aTeam == eTeam) ? aTeam : nil
        return CopyInfo(path: appURL.path, version: version, builtAt: builtAt, signing: combined, teamID: team)
    }

    private static func signingInfo(of url: URL) -> (Signing, String?) {
        var code: SecStaticCode?
        guard SecStaticCodeCreateWithPath(url as CFURL, [], &code) == errSecSuccess, let sc = code else { return (.unknown, nil) }
        var infoRef: CFDictionary?
        guard SecCodeCopySigningInformation(sc, SecCSFlags(rawValue: kSecCSSigningInformation), &infoRef) == errSecSuccess,
              let info = infoRef as? [String: Any] else { return (.unknown, nil) }
        let flags = (info[kSecCodeInfoFlags as String] as? UInt32) ?? 0
        if flags & 0x2 != 0 { return (.adhoc, nil) } // kSecCodeSignatureAdhoc
        if let team = info[kSecCodeInfoTeamIdentifier as String] as? String { return (.signed, team) }
        return (.adhoc, nil)
    }

    // MARK: - 조치

    private func trash(index: Int) {
        guard selfIsNewest else { return }
        let target = others[index].url
        let panel = NSOpenPanel()
        panel.directoryURL = target.deletingLastPathComponent()
        panel.message = "휴지통으로 옮길 이전 SDR HDR 사본을 선택하세요"
        panel.prompt = "휴지통으로 이동"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.applicationBundle]
        guard panel.runModal() == .OK, let chosen = panel.url else { return }

        guard chosen.standardizedFileURL.resolvingSymlinksInPath() == target.standardizedFileURL.resolvingSymlinksInPath() else {
            notice = "선택한 앱이 제안한 사본과 다릅니다. 아무것도 옮기지 않았습니다."
            recheck()
            return
        }
        do {
            try FileManager.default.trashItem(at: chosen, resultingItemURL: nil)
            notice = "이전 사본을 휴지통으로 옮겼습니다. Safari를 완전히 종료(⌘Q)한 뒤 다시 여세요."
        } catch {
            log.error("trash failed code=\((error as NSError).code, privacy: .public)")
            notice = "휴지통으로 옮기지 못했습니다. ‘Finder에서 보기’로 직접 옮겨 주세요."
        }
        recheck()
    }

    private func openNewest() {
        guard let i = newestOtherIndex, others.indices.contains(i) else { return }
        // 실행 직전에 다시 확인한다. 사본이 바뀌었을 수 있다 (FIX_GUIDE Y1 (e)).
        let selfTeam = Self.describe(appURL: Bundle.main.bundleURL).teamID
        let target = Self.describe(appURL: others[i].url)
        guard canOfferOpen(selfTeam: selfTeam, otherTeam: target.teamID) else {
            notice = "같은 개발자 서명인지 확인할 수 없어 열지 않았습니다. Finder에서 확인해 주세요."
            recheck()
            return
        }
        let config = NSWorkspace.OpenConfiguration()
        config.createsNewApplicationInstance = true
        NSWorkspace.shared.openApplication(at: others[i].url, configuration: config) { _, error in
            DispatchQueue.main.async {
                if error == nil { NSApplication.shared.terminate(nil) }
            }
        }
    }

    private func finish() {
        let selfCopy = Self.describe(appURL: Bundle.main.bundleURL)
        let allGood = selfCopy.signing == .signed && others.isEmpty && UserDefaults.standard.bool(forKey: youtubeConfirmedKey)
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { [weak self] (state, error) in
            DispatchQueue.main.async {
                if allGood, error == nil, state?.isEnabled == true, let v = selfCopy.version {
                    UserDefaults.standard.set(v, forKey: setupDoneVersionKey)
                }
                self?.view.window?.close()
            }
        }
    }

}
