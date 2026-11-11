#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail

task_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
task_assets="$(cd -- "${1:-release-assets}" && pwd)"
task_version="$(tr -d '\r\n' < "$task_root/VERSION")"
task_tag="${GITHUB_REF_NAME:-${2:-}}"
task_repo="${GITHUB_REPOSITORY:-ValkyrieNox/crosspet-plus}"
if [[ "$task_tag" != "v$task_version" || ! "$task_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-plus\.[0-9]+$ ]]; then
  echo 'Release tag must exactly match the Plus version in VERSION.' >&2
  exit 1
fi

task_packages=(
  CrossPet-Windows.zip
  "CrossPet-Plus-$task_version-macOS-arm64.zip"
  "CrossPet-Plus-$task_version-macOS-x64.zip"
)
for task_package in "${task_packages[@]}"; do
  if [[ ! -s "$task_assets/$task_package" ]]; then
    echo "Missing native package: $task_package" >&2
    exit 1
  fi
done
task_notes="$task_root/docs/releases/$task_version.md"
if [[ ! -f "$task_notes" ]]; then
  echo "Missing reviewed release notes: $task_notes" >&2
  exit 1
fi
(
  cd -- "$task_assets"
  sha256sum -- "${task_packages[@]}" > SHA256SUMS
)

# Upload a complete draft first. The original updater only sees it after every
# package is uploaded. Published versions are immutable: no --clobber here.
if gh release view "$task_tag" --repo "$task_repo" >/dev/null 2>&1; then
  echo 'This release already exists. Inspect it before publishing a new version.' >&2
  exit 1
fi
task_uploads=()
for task_package in "${task_packages[@]}" SHA256SUMS; do
  task_uploads+=("$task_assets/$task_package")
done
gh release create "$task_tag" "${task_uploads[@]}" --repo "$task_repo" \
  --verify-tag --draft --prerelease --title "CrossPet Plus $task_version" --notes-file "$task_notes"
gh release edit "$task_tag" --repo "$task_repo" --draft=false --prerelease --latest=false
