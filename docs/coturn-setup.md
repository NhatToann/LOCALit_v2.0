# coturn TURN server setup

**Why we need this**: WebRTC voice calls need an ICE server. STUN-only
configurations work on permissive networks (~70% of cases) but fail
on symmetric NAT, mobile carriers with CGNAT, and strict corporate
firewalls. A TURN server relays media through itself when direct
peer-to-peer fails — it must be reachable on a public IP from both
sides, with credentials that authenticate the user.

**What this doc covers**:
- [Local dev](#local-dev-docker-compose)
- [Production on a $5 VPS](#production-on-a-vps)
- [Production on Fly.io](#production-on-flyio)
- [Vercel env vars](#vercel-environment-variables)
- [Verification](#verification)

---

## Local dev (docker-compose)

The `docker-compose.yml` at the repo root starts a self-contained
coturn on `localhost:3478` with the dev shared secret
`dev-coturn-secret-change-me`.

```bash
docker compose up -d coturn
docker compose ps          # should show localit-coturn "Up"
docker compose logs coturn # "coturn ... started, listening on ..."
```

The Next.js app's `/api/webrtc/turn` route does **not** need any env
vars for local dev if you only want STUN — the coturn block is only
activated when `TURN_URL`, `TURN_REALM`, `TURN_SHARED_SECRET` are set.

To exercise the TURN path locally, add to `.env.local`:

```
TURN_URL=turn:127.0.0.1:3478
TURN_REALM=LOCAL
TURN_SHARED_SECRET=dev-coturn-secret-change-me
TURN_TTL_SECONDS=3600
```

Note: a single-machine TURN is only useful for testing the credential
plumbing. A real call between two laptops on different networks still
needs a public IP.

---

## Production on a VPS

Assumes a fresh Debian 12 / Ubuntu 24.04 box with a static public IP
(e.g. from Hetzner, Vultr, DigitalOcean — ~$4–5/mo).

### 1. Provision

```bash
ssh root@<turn.localit.dev>
apt update && apt install -y coturn certbot
# Open firewall ports
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp   # turns://
ufw allow 5349/udp
ufw allow 49160:49200/udp  # relay range (matches turnserver.conf)
```

### 2. Issue a Let's Encrypt cert for the realm

```bash
certbot certonly --standalone -d turn.localit.dev
# Copies certs to /etc/letsencrypt/live/turn.localit.dev/
```

### 3. Configure coturn

```bash
cp infra/coturn/turnserver.conf /etc/turnserver.conf
# Edit /etc/turnserver.conf: replace <PLACEHOLDER_SHARED_SECRET> with:
openssl rand -hex 32
# Replace realm=turn.locality.example with realm=turn.localit.dev
# Uncomment the cert= / pkey= lines pointing at the Let's Encrypt paths
sed -i 's|# cert=|cert=|; s|# pkey=|pkey=|' /etc/turnserver.conf
```

### 4. Enable + start

```bash
# Debian: edit /etc/default/coturn to set TURNSERVER_ENABLED=1
systemctl enable --now coturn
systemctl status coturn
# Look for: "coturn ... started"
```

### 5. Add DNS A record

In your DNS provider:
- `turn.localit.dev` A → `<public IP>`

### 6. Set Vercel env vars

See [next section](#vercel-environment-variables).

---

## Production on Fly.io

Fly.io is the cheapest option if you don't already have a VPS —
~$3.50/mo for a shared-cpu-1x box.

### 1. Create app

```bash
fly apps create localit-turn
fly ips release
fly ips allocate shared   # or `allocate-v6` if you need IPv6
```

### 2. `fly.toml` (drop at repo root)

```toml
app = "localit-turn"
primary_region = "sin"  # Singapore — closest to Da Nang audience

[build]
  image = "coturn/coturn:4.6"

[[services]]
  protocol = "udp"
  internal_port = 3478
  [[services.ports]]
    port = 3478
  [[services.ports]]
    port_range_start = 49160
    port_range_end = 49200

  [services.concurrency]
    type = "connections"

  [[services.tcp_checks]]
    interval = "15s"
    timeout = "2s"
    grace_period = "10s"

[[services]]
  protocol = "tcp"
  internal_port = 3478
  [[services.ports]]
    port = 3478

[[services]]
  protocol = "tcp"
  internal_port = 5349
  [[services.ports]]
    port = 5349
```

### 3. Configure

```bash
fly secrets set TURN_REALM=turn.localit.dev TURN_SHARED_SECRET=$(openssl rand -hex 32)
# TURN_URL is built into the client by reading fly.app + secrets
fly secrets set TURN_URL="turn:$(fly info --name localit-turn | awk '/Hostname/ {print $2}'):3478"
```

### 4. Deploy

```bash
fly deploy --dockerfile - <<'DOCKERFILE'
FROM coturn/coturn:4.6
ENV TURN_USERNAME=localit
# entrypoint overridden by [build] image defaults
DOCKERFILE
```

> Fly.io has limitations on UDP port ranges; if 49160-49200 isn't
> allowed, use a smaller range like 49160-49170 in turnserver.conf.

---

## Vercel environment variables

In the Vercel dashboard (or `vercel env add`):

| Name | Value | Notes |
|---|---|---|
| `TURN_URL` | `turn:turn.localit.dev:3478,turns:turn.localit.dev:5349?transport=tcp` | Comma-separated for redundancy. Include `?transport=tcp` for symmetric NAT. |
| `TURN_REALM` | `turn.localit.dev` | MUST match `realm=` in turnserver.conf. |
| `TURN_SHARED_SECRET` | `<the hex string you set in coturn>` | Same value as `static-auth-secret=`. |
| `TURN_TTL_SECONDS` | `3600` | Optional. 1h matches Twilio NTS. |

Then redeploy so the env is available at request time:
```bash
vercel --prod --yes
```

---

## Verification

After deploy, hit the TURN endpoint:

```bash
curl -X POST https://localit-nhattoann.vercel.app/api/webrtc/turn
```

Expected response (truncated):

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    ...
    {
      "urls": ["turn:turn.localit.dev:3478"],
      "username": "1738000000:abc123def456",
      "credential": "<base64-hmac>"
    }
  ],
  "source": "coturn",
  "ttl": 3600,
  "realm": "turn.localit.dev"
}
```

Then run `scripts/verify-voice-call.mjs` from the repo root. If you
see `pending_calls.status` transition `ringing -> accepted -> ended`
AND a `call_event` row in `messages`, the TURN credentials are being
issued and consumed correctly.

For a real cross-network test, open `/chat` in two browsers on two
different ISPs (e.g. WiFi + mobile hotspot). The call should:
1. Reach `connected` state in <5 seconds
2. Play audio in both directions

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `curl /api/webrtc/turn` returns `source: "stun-only"` | One of `TURN_URL` / `TURN_REALM` / `TURN_SHARED_SECRET` not set on Vercel. |
| `401 Unauthorized` from coturn | `static-auth-secret` on coturn ≠ `TURN_SHARED_SECRET` on Vercel. |
| `TURN REST API` 403 "wrong credentials" in coturn logs | `realm` mismatch. Username issued by route says `turn.localit.dev`; coturn expects the realm in turnserver.conf to match. |
| ICE candidates only show `host` and `srflx`, never `relay` | TURN is unreachable. Likely firewall or wrong port. |
| Calls connect over STUN on LAN but fail cross-network | TURN not deployed yet or DNS not pointing to it. |

For real-time coturn logs:
```bash
journalctl -u coturn -f
# or in docker:
docker compose logs -f coturn
```