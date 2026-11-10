#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
swiftc app/mac/ClawdBridge.swift tests/macos_plus_bridge.swift -o "$out/bridge-tests"
"$out/bridge-tests"
