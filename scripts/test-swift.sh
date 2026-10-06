#!/usr/bin/env bash
# 앱의 순수 판정 로직(AppDelegate.swift PureLogic 구간)을 swiftc 로 컴파일해 tests/swift/logic_test.swift 를 실행한다. (FIX_GUIDE W1·W4)
set -euo pipefail
cd "$(dirname "$0")/.."
src="xcode/SDRHDR/SDRHDR/AppDelegate.swift"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sed -n '/MARK: - PureLogic BEGIN/,/MARK: - PureLogic END/p' "$src" > "$tmp/extract.swift"
if [ ! -s "$tmp/extract.swift" ]; then echo "오류: PureLogic 구간을 찾지 못했습니다." >&2; exit 1; fi
{ echo "import Foundation"; cat "$tmp/extract.swift"; } > "$tmp/Logic.swift"
cp tests/swift/logic_test.swift "$tmp/main.swift"
swiftc -o "$tmp/logic_test" "$tmp/Logic.swift" "$tmp/main.swift"
"$tmp/logic_test"
