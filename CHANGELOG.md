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
