# CoStage CE

**Realtime interactive live & collaboration foundation — Community Edition v0.1.1**

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

## Highlights (v0.1.1)

- LiveKit SFU interaction plane + ZLMediaKit WHEP mass distribution, **zero transcoding**
  (per-identity WHIP relay, H264/opus passthrough)
- FloatStage layout: draggable floating mic windows, corner snap, mutual-exclusion swap;
  viewers mirror the host layout in real time
- Collaborative whiteboard on the data plane; read-only live mirror for viewers
- 15-second disconnect hold for on-mic participants
- Fixed quality tiers: 480p30 / 720p30 / 1080p30 / 1080p60
- Web deployment manager: install wizard, lifecycle, upgrade, rollback — no systemd,
  no container runtime required

## Known boundaries (v0.1.1)

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
