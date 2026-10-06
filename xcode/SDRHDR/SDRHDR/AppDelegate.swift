//
//  AppDelegate.swift
//  SDRHDR
//
//  Created by 김민규 on 2026. 9. 30..
//

import Cocoa
import os

// MARK: - PureLogic BEGIN
// Foundation 외 의존 없음. scripts/test-swift.sh 가 이 구간(BEGIN~END)만 잘라 swiftc 로 검사한다 (FIX_GUIDE W1·W4).

enum LaunchKind: String {
    case user
    case system
}

struct LaunchSignals {
    /// 현재 Apple Event 가 kAEOpenApplication 이고 keyAEPropData 가 keyAELaunchedAsLogInItem.
    var loginItemEvent: Bool
    /// didFinishLaunching 알림 userInfo[launchIsDefaultUserInfoKey]. 키가 없으면 nil.
    var launchIsDefault: Bool?
    var debuggerAttached: Bool
}

/// W1 (a)(g): 시스템 실행이 확실할 때만 system. 애매하면 user(창을 띄운다).
func classifyLaunch(_ s: LaunchSignals) -> LaunchKind {
    if s.loginItemEvent { return .system }
    if s.launchIsDefault == false && !s.debuggerAttached { return .system }
    return .user
}

enum Signing: String {
    case signed
    case adhoc
    case unknown
}

struct CopyInfo {
    var path: String
    var version: String?
    var builtAt: Date?
    var signing: Signing
}

/// 점 구분 숫자 비교. 숫자가 아닌 조각은 0으로 본다.
func compareVersions(_ a: String, _ b: String) -> ComparisonResult {
    let pa = a.split(separator: ".").map { Int($0) ?? 0 }
    let pb = b.split(separator: ".").map { Int($0) ?? 0 }
    for i in 0..<max(pa.count, pb.count) {
        let x = i < pa.count ? pa[i] : 0
        let y = i < pb.count ? pb[i] : 0
        if x != y { return x < y ? .orderedAscending : .orderedDescending }
    }
    return .orderedSame
}

/// W4 (a)-4: 둘 다 버전이 있으면 버전, 같거나 하나라도 없으면 빌드 시각. 판정 불가면 nil.
func isNewer(_ a: CopyInfo, than b: CopyInfo) -> Bool? {
    if let va = a.version, let vb = b.version {
        let r = compareVersions(va, vb)
        if r != .orderedSame { return r == .orderedDescending }
    }
    if let ta = a.builtAt, let tb = b.builtAt {
        if ta == tb { return nil }
        return ta > tb
    }
    return nil
}

/// 가장 최신 사본의 인덱스. 하나라도 비교 불가이면 nil (삭제 제안 안 함).
func newestIndex(_ copies: [CopyInfo]) -> Int? {
    if copies.isEmpty { return nil }
    var best = 0
    for i in 1..<copies.count {
        guard let r = isNewer(copies[i], than: copies[best]) else { return nil }
        if r { best = i }
    }
    for i in 0..<copies.count where i != best {
        if isNewer(copies[best], than: copies[i]) != true { return nil }
    }
    return best
}

// MARK: - PureLogic END

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    private let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "io.github.tmtmtmtmtmt.SDRHDR", category: "launch")
    private var loginItemEvent = false
    private var windowController: NSWindowController?

    func applicationWillFinishLaunching(_ notification: Notification) {
        // 신호 1은 여기서만 읽을 수 있다. 참이면 Dock 아이콘이 생기기 전에 숨긴다.
        if let ev = NSAppleEventManager.shared().currentAppleEvent,
           ev.eventID == AEEventID(kAEOpenApplication),
           let prop = ev.paramDescriptor(forKeyword: AEKeyword(keyAEPropData)),
           prop.enumCodeValue == OSType(keyAELaunchedAsLogInItem) {
            loginItemEvent = true
            NSApp.setActivationPolicy(.accessory)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let signals = LaunchSignals(
            loginItemEvent: loginItemEvent,
            launchIsDefault: notification.userInfo?[NSApplication.launchIsDefaultUserInfoKey] as? Bool,
            debuggerAttached: AppDelegate.isDebuggerAttached()
        )
        let kind = classifyLaunch(signals)
        log.notice("launch kind=\(kind.rawValue, privacy: .public) loginItem=\(signals.loginItemEvent, privacy: .public) launchIsDefault=\(String(describing: signals.launchIsDefault), privacy: .public) debugger=\(signals.debuggerAttached, privacy: .public)")

        switch kind {
        case .system:
            // 창·점검·타이머 없음. 프로세스만 백그라운드에 남는다.
            NSApp.setActivationPolicy(.accessory)
        case .user:
            showMainWindow()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindow()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    private func showMainWindow() {
        NSApp.setActivationPolicy(.regular)
        if windowController == nil {
            let storyboard = NSStoryboard(name: "Main", bundle: nil)
            windowController = storyboard.instantiateController(withIdentifier: "MainWindow") as? NSWindowController
        }
        windowController?.showWindow(nil)
        windowController?.window?.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    private static func isDebuggerAttached() -> Bool {
        var info = kinfo_proc()
        var size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        let r = sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
        return r == 0 && (info.kp_proc.p_flag & P_TRACED) != 0
    }
}
