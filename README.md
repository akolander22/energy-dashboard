# Energy Dashboard v2

Home energy monitoring dashboard — Xcel + Emporia Vue + APSystems (Everlight Solar).

## Stack
- **Backend**: Node.js + Express
- **Frontend**: Vanilla JS + Chart.js (no build step)
- **Data**: Three live connectors, each gracefully falls back to placeholder data if not yet configured

## Quick Start

```bash
npm install
cp .env.example .env
# fill in .env with your credentials (see below)
npm start
# → http://localhost:3030
```

---

## Configuring Each Connector

### 1. Xcel Itron Smart Meter (real-time local kW draw)

Reads directly from your Gen 5 Riva meter over your home network. **Most effort, best data.**

```bash
npm run setup:xcel       # generates TLS certs, prints your LFDI
```

Then:
1. Log into xcelenergy.com → **Meters & Devices → Launchpad** (enroll — takes a few days)
2. Once enrolled, click **Add Device** and paste the LFDI from the script
3. Connect your meter to Wi-Fi (Launchpad → Edit → enter Wi-Fi credentials)
4. Find the meter's IP in your router's DHCP table (hostname: `xcel-meter`, MAC prefix: `B4:23:30`)
5. Set `XCEL_METER_IP=192.168.x.x` in your `.env`

```env
XCEL_METER_IP=192.168.1.42
XCEL_CERT_PATH=./certs/xcel.crt
XCEL_KEY_PATH=./certs/xcel.key
```

---

### 2. Emporia Vue (circuit-level breakdown + history)

Uses the unofficial Emporia cloud API — same credentials as the Emporia app.

```env
EMPORIA_EMAIL=your@email.com
EMPORIA_PASSWORD=yourpassword
```

Tokens are cached in `emporia_tokens.json` and auto-refreshed. Circuit names come from
whatever you named them in the Emporia app.

---

### 3. APSystems EMA — Everlight Solar (solar production)

No password needed — just your ECU ID.

**Find your ECU ID:**
- Open the EMA app → select your system → ECU ID shown at the top
- OR: apsystemsema.com → login → your system → Settings → ECU Information

```env
APSYSTEMS_ECU_ID=2021234567890   # 13-digit number
```

---

## Deploy on Unraid

```bash
# SSH into Unraid
cd /mnt/user/appdata
unzip energy-dashboard.zip
cd energy-dashboard
cp .env.example .env
nano .env                        # fill in your values
npm run setup:xcel               # if using Xcel connector
touch emporia_tokens.json        # create empty file for token cache
docker compose up -d
```

Access at `http://UNRAID_IP:3030`

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/status` | Which connectors are live vs. placeholder |
| `GET /api/stats` | Summary cards (current kW, solar kW, net, costs) |
| `GET /api/hourly` | Hour-by-hour usage today |
| `GET /api/history?days=30` | Daily kWh for past N days |
| `GET /api/circuits` | Per-circuit breakdown (Emporia) |
| `GET /api/solar` | Solar time-series today + monthly history |

---

## Config Reference

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `RATE_PER_KWH` | Utility rate in $/kWh | `0.13` |
| `XCEL_METER_IP` | Local IP of Itron meter | — |
| `XCEL_METER_PORT` | Meter port | `8081` |
| `XCEL_CERT_PATH` | Path to TLS cert | `./certs/xcel.crt` |
| `XCEL_KEY_PATH` | Path to TLS key | `./certs/xcel.key` |
| `EMPORIA_EMAIL` | Emporia app email | — |
| `EMPORIA_PASSWORD` | Emporia app password | — |
| `EMPORIA_TOKEN_FILE` | Token cache path | `./emporia_tokens.json` |
| `APSYSTEMS_ECU_ID` | Your ECU ID from EMA app | — |
