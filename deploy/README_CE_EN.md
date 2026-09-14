# CoStage CE (Community Edition) v0.2.1

A general-purpose realtime live/interactive/collaboration foundation — first scenario: online tutoring classrooms. Single-host Docker deployment.

## What it is

One class session looks like this: **1 teacher (host) + up to 4 students (mic participants) + unlimited audience (viewers / anonymous)**.

- The teacher creates a room and shares the room ID (or an invite link)
- Students enter with an ID; whitelisted students can request the mic, and once approved they go on air with audio+video
- Audience needs no account: open the room link and watch (teacher + participants + live whiteboard mirror), text chat available
- Participant videos float over the main video: draggable, swappable with the main slot; everyone's layout follows the teacher's in real time

## Features (v0.2.1)

- Realtime A/V mic (up to 4 students) with 15-second disconnect protection
- Embedded TURN relay (optional): browser media relay for cross-network / strict NAT; ICE credentials issued automatically (no build-time injection)
- Collaborative whiteboard: teacher/students co-draw in real time; viewers/anonymous get a read-only live mirror; auto-recovery after disconnects
- Multi-stream low-latency WHEP playback on the audience side; layout follows the host
- Chat (text + emoji), room-wide mute, speaker blacklist / kick
- Host controls: approve/deny mic requests, mute mic, force-leave, kick; camera switching, four fixed quality tiers (480p/720p/1080p/1080p60), microphone self-control
- Mic whitelist: editable in-page by the host; whitelisted students hold participant status (may request the mic)
- Distribution: per-track relay from SFU to ZLMediaKit; audience pulls native WebRTC (WHEP), zero transcoding
- **JavaScript SDK** (shipped in `sdk/`): `costage-sdk-<ver>.min.js` gives you the `CoStageJS` global from a single `<script>` tag; an ESM build and TypeScript declarations are included — embed live A/V, mic-up and whiteboard into any third-party app with zero dependencies

## JavaScript SDK (`sdk/`)

| File | Purpose |
|---|---|
| `costage-sdk-v0.2.1.min.js` | UMD single file (**obfuscated**); load via `<script src>` → global `CoStageJS` |
| `costage-sdk-v0.2.1.mjs` | ESM build (**obfuscated**) for bundlers (vite/webpack) |
| `types/**` | TypeScript declarations (not obfuscated) |
| `README.md` | SDK usage, endpoint config, topology A/B deployment notes |

```html
<script src="/sdk/costage-sdk-v0.2.1.min.js"></script>
<script>
  const ep = CoStageJS.resolveEndpoints({ rest: location.origin })   // omit for same-origin
  CoStageJS.initAnonymousViewer({ roomId: 'r-<hostID>', endpoints: ep, mount: document.body })
</script>
```

> A standalone asset `co-stage-sdk-<ver>.zip` is also published on the GitHub Release.
> Obfuscation profile: `scripts/build-sdk-dist.sh` (control-flow flattening, dead-code injection and self-defending disabled; string array kept).

## Fixes in v0.2.1

- **No media on domain + TLS deployments**: the manager rendered ZLM `[rtc] externIP` with the domain name,
  which ZLM copies verbatim into ICE candidates (must be an IP) — the relay bot could not open the stream and
  viewers got nothing. It now uses `PublicIP` (IP first, then DNS resolution) and falls back to empty so ZLM
  picks the NIC address.

## Known limitations (v0.2.1)

1. **At most 1 active room at a time** (server-side hard gate): end the current room before starting a new class
2. No access control: anyone with the room ID can watch (signed URLs / viewing codes / Webhook admission come in a later release)
3. No recording / playback
4. Per-participant whiteboard "deny drawing + one-click cleanup" not included
5. Paid speaking (speak) postponed
6. Single-host deployment assumption (no clustering)
7. Bring your own TLS for production (nginx 443 or an outer gateway)

> Beyond "1 active room" and "no recording/playback", CE is functionally identical to the full edition; future features will not be trimmed from CE.

## Quick start

Prerequisites: a Linux host (Docker + Docker Compose v2), clients able to reach it.

**Option A (recommended): deployment manager wizard** — the manager is a **separate release asset** (`co-stage-manager-*-linux-amd64.tar.gz` on GitHub Release, or `scripts/start-manager.sh fetch` from a source checkout). Unpack it on the host, run `./costage-manager`, and open `http://127.0.0.1:8900`; the wizard generates secrets and all config files, including health gating, and pulls this CE product package from GitHub automatically. See `README_MANAGER.md` inside the asset; systemd example at the end.

**Option B: manual Compose**

```bash
# 1. Unpack the release (or clone and enter deploy/)
cd deploy

# 2. Configure
cp .env.example .env
#    set COSTAGE_LIVEKIT_URL=ws://<host-IP>:7880
vi configs/zlm.ini
#    set externIP= to <host-IP>; change the secret (also update ZLM_SECRET in docker-compose.yml)

# 3. Start
docker compose up -d

# 4. Open
#    Panel: http://<host-IP>/
#    Teacher creates a room; students join with an ID; audience opens /room/<roomID> directly
```

> **HTTPS and calls**: camera/mic capture requires a secure context (HTTPS or localhost) — the `http://<IP>` quickstart supports **viewing/whiteboard only**. Teaching and student calls must go through a domain with TLS (see the `configs/nginx-costage.conf` sample; recommended for production) or `http://localhost` for local debugging.

## Ports

Host ports differ by form: option B (compose) maps fixed 80/8080 (bound by the Docker daemon, no root needed); option A (deployment manager, native) defaults to 7860/7900 (no root binding required), all configurable.

| Port | Purpose |
|---|---|
| 80 (compose) / 7860 (manager default) | Single entry: panel + API/WS + WHEP same-origin (Go binary with embedded panel & ZLM reverse proxy) |
| 7880/tcp | LiveKit signaling WebSocket (direct from browsers) |
| 7881/tcp, 50000-50100/udp | LiveKit media (fixed; part of the port-matrix check) |
| 8100/udp, 8100/tcp | ZLMediaKit WebRTC media (configurable in manager form) |
| 8080 (compose) / 7900 (manager default)/tcp | ZLMediaKit HTTP (debugging; keep off public networks) |
| 554/tcp, 1935/tcp, 9000/udp | ZLMediaKit RTSP/RTMP/SRT broadcast (default disabled = 0; configurable in manager form — enabled ports auto-transmux WHIP streams) |
| 3478/udp, 3479/tcp | TURN signaling (configurable; defaults 3478/udp + 3479/tcp) |
| 49160-49999/udp | TURN relay port range (configurable; must avoid LiveKit 50000-50100) |
| (8091) | Backend API (served same-origin on the entry port; map only for debugging) |

## Cross-network / strict NAT

Same-network clients connect directly. For cross-network deployment, set `TURN_SECRET` (any strong random string) and `PUBLIC_IP` (host IP reachable by clients, same as `COSTAGE_LIVEKIT_URL` / `externIP` in zlm.ini) in `.env`, then `docker compose up -d` to restart the server container — TURN is embedded in the backend service (3478/udp + 3479/tcp + relay range 49160-49999/udp), browsers fetch short-lived credentials from `/api/ice-servers` automatically, **no image rebuild needed**. With the deployment manager (option A), enabling "TURN relay" in its TURN tab is equivalent.

## Architecture in one line

The interactive plane runs on a LiveKit SFU (mic A/V + whiteboard data channel); a relay bot pushes each track to ZLMediaKit; the audience pulls each stream via WHEP and assembles them in-page; chat / whiteboard ops / layout commands travel over WebSocket and LiveKit data channels and are never burned into video.

## systemd (optional)

    # /etc/systemd/system/costage-manager.service
    [Unit]
    Description=CoStage Deployment Manager
    After=network.target docker.service

    [Service]
    WorkingDirectory=/opt/costage
    ExecStart=/opt/costage/costage-manager --dir /opt/costage --addr 0.0.0.0:8900 --password <your-password>
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target

## Third-party components & licenses

CoStage CE is distributed as compiled artifacts only (see `LICENSE`). Attribution and full license texts
for the bundled third-party components ship with every release:

- `third-party/LICENSE.livekit.txt` + `third-party/NOTICE.livekit.txt` — **LiveKit server**, Apache-2.0
  (Apache-2.0 §4(d) requires reproducing the upstream NOTICE on distribution)
- `third-party/LICENSE.zlmediakit.txt` — **ZLMediaKit** (`MediaServer`), MIT
- `third-party/LICENSE.tldraw.txt` — **tldraw** (whiteboard engine inside the panel / JS SDK),
  **tldraw license**: ⚠ not open source — **production use requires a commercial license from tldraw Inc.**
  (development/testing is permitted), and any distribution must carry the verbatim license text
- Full component list (incl. Go/Pion/React dependencies) and details: **`THIRD-PARTY.md`** at the package root

## License & source

Shipped as compiled artifacts only (no source, no License mechanism, no feature flags). Feedback channel is provided by the publisher.
