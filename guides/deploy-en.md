# CoStage CE (Community Edition) v0.1.1

A general-purpose realtime live/interactive/collaboration foundation — first scenario: online tutoring classrooms. Single-host Docker deployment.

## What it is

One class session looks like this: **1 teacher (host) + up to 4 students (mic participants) + unlimited audience (viewers / anonymous)**.

- The teacher creates a room and shares the room ID (or an invite link)
- Students enter with an ID; whitelisted students can request the mic, and once approved they go on air with audio+video
- Audience needs no account: open the room link and watch (teacher + participants + live whiteboard mirror), text chat available
- Participant videos float over the main video: draggable, swappable with the main slot; everyone's layout follows the teacher's in real time

## Features (v0.1)

- Realtime A/V mic (up to 4 students) with 15-second disconnect protection
- Collaborative whiteboard: teacher/students co-draw in real time; viewers/anonymous get a read-only live mirror; auto-recovery after disconnects
- Multi-stream low-latency WHEP playback on the audience side; layout follows the host
- Chat (text + emoji), room-wide mute, speaker blacklist / kick
- Host controls: approve/deny mic requests, mute mic, force-leave, kick; camera switching, four fixed quality tiers (480p/720p/1080p/1080p60), microphone self-control
- Mic whitelist: editable in-page by the host; whitelisted students hold participant status (may request the mic)
- Distribution: per-track relay from SFU to ZLMediaKit; audience pulls native WebRTC (WHEP), zero transcoding

## Known limitations (v0.1.1)

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

**Option A (recommended): deployment manager wizard** — after unpacking run `./costage-manager` and open `http://127.0.0.1:8900`; the wizard generates secrets and all config files, including health gating. systemd example at the end.

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

## Ports

| Port | Purpose |
|---|---|
| 80 | Single entry: panel + API/WS + WHEP same-origin (Go binary with embedded panel & ZLM reverse proxy) |
| 7880/tcp | LiveKit signaling WebSocket (direct from browsers) |
| 7881/tcp, 50000-50100/udp | LiveKit media |
| 8100/udp, 8100/tcp | ZLMediaKit WebRTC media |
| 8080/tcp | ZLMediaKit HTTP (debugging; keep off public networks) |
| 3478/udp+tcp | TURN (optional, for cross-network clients) |
| (8091) | Backend API (served same-origin on 80; map only for debugging) |

## Cross-network / strict NAT

Same-network clients connect directly. For cross-network deployment enable the coturn service and inject TURN into the build (`VITE_TURN_URLS` etc., see server.Dockerfile and .env.example), then `docker compose build server`.

## Architecture in one line

The interactive plane runs on a LiveKit SFU (mic A/V + whiteboard data channel); a relay bot pushes each track to ZLMediaKit; the audience pulls each stream via WHEP and assembles them in-page; chat / whiteboard ops / layout commands travel over WebSocket and LiveKit data channels and are never burned into video.

## systemd (optional)

    # /etc/systemd/system/costage-manager.service
    [Unit]
    Description=CoStage Deployment Manager
    After=network.target docker.service

    [Service]
    WorkingDirectory=/opt/costage
    ExecStart=/opt/costage/manager --dir /opt/costage --addr 0.0.0.0:8900 --password <your-password>
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target

## License & source

Shipped as compiled artifacts only (no source, no License mechanism, no feature flags). Feedback channel is provided by the publisher.
