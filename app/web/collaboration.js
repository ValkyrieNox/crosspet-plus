// SPDX-License-Identifier: AGPL-3.0-only
// Child counts come from Clawd's admitted lifecycle projection. They never
// create extra task cards or change the number of parent sessions.
;(function (root) {
  function count(live) {
    return live.reduce((sum, [, entry, kind]) => {
      const value = Number(entry.subagents)
      return sum + (kind === 'work' && Number.isSafeInteger(value) && value > 0 ? value : 0)
    }, 0)
  }
  function tier(count) { return count >= 3 ? 3 : count >= 2 ? 2 : count >= 1 ? 1 : 0 }
  function pose(count, side) {
    const level = tier(count)
    return level >= 3 ? `swamped_${side}` : level === 2 ? `busy_${side}` : 'delegating'
  }
  root.Collaboration = { count, tier, pose }
})(typeof window === 'undefined' ? globalThis : window)
