// scripts/test-swift.sh 가 AppDelegate.swift 의 PureLogic 구간과 이 파일을 합쳐 컴파일·실행한다.
import Foundation

var failures = 0
func check(_ cond: Bool, _ name: String) {
    if !cond {
        failures += 1
        print("FAIL: \(name)")
    }
}

let t0 = Date(timeIntervalSince1970: 1_000_000)
let t1 = t0.addingTimeInterval(60)

func copy(_ v: String?, _ t: Date?) -> CopyInfo {
    CopyInfo(path: "/x", version: v, builtAt: t, signing: .unknown)
}

// classifyLaunch (W1)
check(classifyLaunch(LaunchSignals(loginItemEvent: true, launchIsDefault: true, debuggerAttached: false)) == .system, "login item")
check(classifyLaunch(LaunchSignals(loginItemEvent: false, launchIsDefault: false, debuggerAttached: false)) == .system, "restore relaunch")
check(classifyLaunch(LaunchSignals(loginItemEvent: false, launchIsDefault: false, debuggerAttached: true)) == .user, "debugger => user")
check(classifyLaunch(LaunchSignals(loginItemEvent: false, launchIsDefault: true, debuggerAttached: false)) == .user, "normal launch")
check(classifyLaunch(LaunchSignals(loginItemEvent: false, launchIsDefault: nil, debuggerAttached: false)) == .user, "ambiguous => user")

// compareVersions
check(compareVersions("1.3.2", "1.3.10") == .orderedAscending, "1.3.2 < 1.3.10")
check(compareVersions("1.3", "1.3.0") == .orderedSame, "1.3 == 1.3.0")
check(compareVersions("2.0", "1.9.9") == .orderedDescending, "2.0 > 1.9.9")

// isNewer
check(isNewer(copy("1.3.2", t0), than: copy("1.0.1", t1)) == true, "version wins over mtime")
check(isNewer(copy("1.0.1", t1), than: copy("1.3.2", t0)) == false, "older version loses")
check(isNewer(copy("1.3.2", t1), than: copy("1.3.2", t0)) == true, "same version -> mtime")
check(isNewer(copy("1.3.2", t0), than: copy("1.3.2", t0)) == nil, "same version same mtime -> nil")
check(isNewer(copy(nil, t1), than: copy("1.3.2", t0)) == true, "missing version -> mtime")
check(isNewer(copy(nil, nil), than: copy("1.3.2", t0)) == nil, "no info -> nil")
check(isNewer(copy("1.4", nil), than: copy("1.3", nil)) == true, "versions without mtime")

// newestIndex
check(newestIndex([]) == nil, "empty")
check(newestIndex([copy("1.3.2", t1)]) == 0, "single")
check(newestIndex([copy("1.3.2", t1), copy("1.0.1", t0)]) == 0, "self newest")
check(newestIndex([copy("1.0.1", t0), copy("1.3.2", t1)]) == 1, "other newest")
check(newestIndex([copy("1.3.2", t1), copy(nil, t0)]) == 0, "self newest vs unreadable")
check(newestIndex([copy("1.3.2", t0), copy(nil, t1)]) == 1, "unreadable newer by mtime")
check(newestIndex([copy("1.3.2", t0), copy(nil, nil)]) == nil, "ambiguous")
check(newestIndex([copy("1.3.2", t1), copy("1.0.1", t0), copy(nil, t0)]) == 0, "three copies")

if failures == 0 { print("OK") } else { print("\(failures) failure(s)"); exit(1) }
