#!/bin/sh
# libnoraneko_menu.dylib を、arm64 と x86_64 の両方で作って、ad-hoc 署名する(Swift の標準ライブラリは OS のもの)。
# x86_64 は macOS 13 以上(それより古いと、Swift の互換ライブラリが要って、このビルドではリンクできない)。
# 読み込めない環境では、JS 側(std-actor の macMenu.ts)が、何もせず諦める。
set -e
cd "$(dirname "$0")"
build() { # 名前 target
  swiftc -emit-library -O -module-name NoranekoAppMenu -target "$2" -o "libnoraneko_menu.$1.dylib" NoranekoAppMenu.swift
}
build arm64 arm64-apple-macos11
build x86_64 x86_64-apple-macos13
lipo -create libnoraneko_menu.arm64.dylib libnoraneko_menu.x86_64.dylib -output libnoraneko_menu.dylib
rm -f libnoraneko_menu.arm64.dylib libnoraneko_menu.x86_64.dylib
codesign -s - -f libnoraneko_menu.dylib
echo built
