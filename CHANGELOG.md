# 更新记录

## 0.1.0 — 2026-09-18

- 首次公开发布：浏览器直播播放器，运行时读取 CCSH 与 TVAPP 的 TXT / M3U 目录。
- 分步加载、频道合并、地址去重、分类置顶；CCTV5 与 CCTV5+ 保持独立。
- 当前频道的 HTTP 连通性与直播画面验证，自动恢复及本机上次成功线路优先。
- HTTP HLS 转发、重定向、签名子资源、公网地址检查及 D1 分块目录缓存。
- 线路每页 20 条，手动切换与原始地址入口，收藏、最近观看和移动端布局。
- 海外置顶顺序为 Bloomberg、CNBC、CNN、BBC、日本；日本名称匹配含“日语”。

- Unify the top-left website logo with the favicon and README icon.

- Move catalog update notices into the footer beside synchronization controls.

## Shared source availability

- Share anonymous per-source success/failure timestamps after actual playback verification.
- Prioritize shared successes; mark failures unstable and move them last, with seven-day freshness.
- Hide shared unstable lines when hide-failed is enabled; preserve unchecked lines and local successful preference.
- Clear reports when a source disappears from a successful catalog update.
- Exclude pause/offline/permission events from failure reports and preserve URL identity in reordered pagination.

- Hide manual catalog refresh in the live site by default; document NEXT_PUBLIC_SHOW_CATALOG_REFRESH=true for self-hosted interfaces.

## Channel list visibility

- Defer sparse and symbol-prefixed channels behind More; search can still find them. Preserve source-count exceptions for prioritized Phoenix and overseas news channels.

## Mobile playback and source identity

- Start native playback without making browser-fetch access a prerequisite; distinguish unconfirmed playback from verified live success.
- Give mobile playback priority over background checks.
- Keep PC and mobile health reports separate, with asymmetric sharing of useful results.
- Preserve source numbers when availability changes their display order.
- Add the device health database migration.

- Reduce GitHub catalog cache freshness from six hours to one hour.

- Separate cross-device display priority from current-device automatic attempt order; place web-direct unsupported sources last.

- Improve native HLS relay compatibility: complete playlist responses, media types, inconclusive live checks and playback diagnostics.

- Apply device-specific instability filtering consistently to channels and source cards.

- Add protected shared success with distinct-browser failure quorum, persistent local verification until local failure, and a shared-playable channel view.

- Correct ambiguous BD-prefixed domestic categories and Japanese station recognition; exempt Japanese channels from the source-count threshold.

## 播放状态与信号

- 成功记录区分24小时内“近期可播”和更早的“可播”，不因时间自动失效。
- 分别判断线路排序、当前设备选源与频道信号，保留本机／他人及PC／手机的差异。
- 同域名或IP的成功提供“可能可播”提示，忽略端口，不覆盖失败或当成真实成功。
- 增加状态融合与信号图标说明图。

## Availability browsing and channel links

- Correct quality-prefixed domestic classifications; add the Japan shortcut and compact, naturally wrapping category buttons.
- Include possible-playback hints in both playable views; borrow the other device’s recent/older success tier only when this device is unknown.
- Group weak hints by registrable domain across subdomains/ports or full IP, preserving suffix and hosted-tenant boundaries.
- Add three display modes; hide raw address actions and compact source cards without changing source numbers.
- Add deterministic reversible channel keys and optional stable source-number links, with progressive catalog resolution.
- Refresh the original five-panel state diagram wording to match the implemented behavior.

- Make the full source card a single radio selection target, retaining disabled and keyboard behavior.

## Japan browsing and source hosts

- Prioritize Latin/kana station names within Japan, without pinning Japanese channels in Overseas.
- Show source hostname/IP alongside device evaluations, keeping full URLs and address actions hidden.
- Keep local-playable viewing history ahead of possible-playback entries, including in availability-priority mode.
- Preserve possible-playback labels on an untested device after the other device succeeds; keep explicit failures and verification facts separate.
- Let the desktop workspace and player expand across wide screens instead of leaving capped side margins.

## Shared success protection

- Require ten distinct other browser failures to revoke shared success after its 24-hour protection period. Local failure remains immediate; PC/mobile votes stay separate.
- Refresh previously aggregated instability under the new threshold without discarding newer reports.

## Shared evidence in line ordering

- Rank locally unstable lines with same-platform shared success before those with opposite-platform shared success or no shared success, preserving local failure, filters and source numbers.
- Hide web-direct restricted sources and channels with no remaining visible lines in the hide-failed mode.

## Country-tagged channel visibility

- Exempt 「 alongside [ from leading-punctuation deferral, so 「US」 Bloomberg TV+2 retains its priority. Source-count rules and channel identities remain unchanged.

## Local station classification

- Use a versioned province/prefecture place-name dictionary, including autonomous prefectures, leagues and common short names, instead of a partial city list.
- Recognize VGA quality prefixes and correct imported local-station categories.

## Channel variants and line quality

- Merge quality-only, ASCII case and whitespace channel variants; preserve distinct CCTV5/CCTV5+ and time-shift suffixes.
- Retain catalog quality metadata as compact source-card badges, including metadata on duplicate URLs.
- Normalize cached catalogs, shared-health lookup and saved viewing preferences consistently; preserve canonical source numbers and allocate free numbers for merge collisions.

## Catalog labels and bounded native live verification

- Move BD quality markers onto source cards for recognized foreign stations and Chinese station names; remove the unsupported generic-local exception.
- Merge country-tagged equivalents with the same base station name, keeping per-source region badges and unmatched display labels.
- Preserve Japan filtering, source URL deduplication, fixed source numbers and distinct time-shift channels.
- Retry inconclusive native live manifests for up to three target-duration reloads; fixed playlists are never promoted solely because video frames move.

## Unstable signal indicator

- Distinguish recent/older success by four/three bars in the same green, possible by two amber bars, and unstable by one orange bar; keep offline/restricted slash indicators distinct. Stationary native playlists follow the existing local-failure/shared-vote rules.
