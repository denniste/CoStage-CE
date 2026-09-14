# CoStage CE

**Realtime interactive live & collaboration foundation — Community Edition v0.2.2**

An open-architecture realtime live, mic-interaction and collaboration foundation
(first scenario: online tutoring classrooms). One host, up to 4 on-mic participants,
unlimited viewers — self-hosted on a single Linux box.

> ⚠ **This repository does not contain source code.**
> CoStage CE is distributed as compiled artifacts only (see [Releases](../../releases)).
> This repo holds the documentation, the deployment assets, and the project site.

## What a session looks like

- The **host** opens a room and shares the room number.
- **Participants** (≤4) join with an ID and apply for the mic; the host approves, they go on stage.
- **Viewers / anonymous** open the room link and watch instantly — a live mirror of the
  host's layout with sub-second WHEP streams, read-only whiteboard, and text chat.

## Highlights (v0.2.2)

- LiveKit SFU interaction plane + ZLMediaKit WHEP mass distribution, **zero transcoding**
  (per-identity WHIP relay, H264/opus passthrough)
- FloatStage layout: draggable floating mic windows, corner snap, mutual-exclusion swap;
  viewers mirror the host layout in real time
- Collaborative whiteboard on the data plane; read-only live mirror for viewers
- 15-second disconnect hold for on-mic participants
- Fixed quality tiers: 480p30 / 720p30 / 1080p30 / 1080p60
- Web deployment manager: install wizard, lifecycle, upgrade, rollback — no systemd,
  no container runtime required
- **JavaScript SDK** (asset `sdk/`): obfuscated single-file `costage-sdk-<ver>.min.js` exposes the `CoStageJS` global from one `<script>` tag, plus an ESM build and TypeScript types — embed live A/V, mic-up and whiteboard into third-party apps with zero dependencies

## Fixes in v0.2.2

- **No media on domain + TLS deployments**: the manager rendered ZLM `[rtc] externIP` with the domain name,
  which ZLM copies verbatim into ICE candidates (must be an IP) - the relay bot could not open the stream and
  viewers got nothing. It now uses `PublicIP` (IP first, then DNS resolution) and falls back to empty so ZLM
  picks the NIC address.

## Changes in v0.2.2

- **Licensing compliance**: the release ships `THIRD-PARTY.md` plus `third-party/NOTICE.livekit.txt`
  (Apache-2.0 §4(d) requires reproducing the upstream NOTICE) and `third-party/LICENSE.tldraw.txt`
  (tldraw license text; production use requires a commercial licence).

## Known boundaries (v0.2.2)

1. **At most 1 active room at a time** (server-side hard gate): end the current room
   before starting a new class
2. No access gate — anyone with the room number can watch (signed URLs / watch codes
   land in a later release)
3. No recording or playback
4. Host-side per-participant whiteboard deny & clear: not included
5. Paid-speech ("speak") feature: postponed
6. Single-machine deployment assumption

> Beyond "1 active room" and "no recording/playback", CE is functionally identical to
> the full edition; future features will not be trimmed from CE.

## Source & subscription / 源码与订阅

- **Binaries are free** for anyone (this repository ships artifacts only).
- **Source**: the full engineering source is **MIT-licensed** and delivered to **subscribers** through a
  private repository — commit history, build scripts, tests, design docs and every subsequent iteration.
  *Source available to subscribers.*
- **Subscriber benefits**: private-repo read access · every new version · **priority issue handling** and
  feature voting · design/engineering notes · support channel.
- **Versioning**: each `vX.Y.Z` tag here corresponds to the same tag in the source repository; CE builds are
  produced with `-tags ce`.
- **Verify a download**: `SHA256SUMS-<ver>.txt` is attached to every release; binaries embed their build
  revision (`go version -m costage-server | grep vcs.revision`).
- ⚠ **Not open source**: the source is not publicly distributed (does not meet the OSI definition). Please
  describe the project as a *free binary distribution with MIT-licensed source for subscribers*.
- ⚠ **Whiteboard engine**: the bundled tldraw engine is **not** MIT and must not be used in production
  without a commercial licence from tldraw Inc.; a self-developed engine is replacing it.

## Deploy

Two ways, both documented:

- **Deployment manager (recommended)** — [`deploy/manager.js`](deploy/manager.js),
  zero npm dependencies, browser wizard. See the
  [deployment guide](guides/deploy-en.md).
- **Docker Compose** — [`deploy/docker-compose.yml`](deploy/docker-compose.yml)
  one-command stack. See the [deployment guide](guides/deploy-en.md).

## Repository layout

| Path | Content |
|---|---|
| [`guides/`](guides) | Bilingual deployment guide & feature notes |
| [`deploy/`](deploy) | Manager, dashboard UI, compose stack, config templates |
| [`docs/`](docs) | Static project site (EN/中文) — served via GitHub Pages from this folder |

## License

Compiled artifacts and documentation only — **all rights reserved**.
See [LICENSE](LICENSE).
