# Energy Dashboard

Home energy dashboard for an Emporia Vue Gen 2 and an APSystems solar ECU.
Node 20 + Express, with history in SQLite.

- **Live:** current draw per circuit, solar output, net from the grid
- **History:** daily kWh and solar Wh, 7-day circuit averages
- **Alerts:** ntfy push when draw goes over `ALERT_KW_THRESHOLD`

## Setup

```bash
cp .env.example .env    # fill in Emporia and APSystems
node --env-file=.env scripts/test-emporia.js   # check the Emporia login
docker compose up -d --build
```

Open http://SERVER:3030. `/api/stats/status` shows which connectors are configured.

## Unraid

Deploy from `/mnt/user/appdata/energy-dashboard`. The compose file mounts
`./data` to `/data`, so the database is `/mnt/user/appdata/energy-dashboard/data/energy.db`
and survives rebuilds. `TZ` sets the local day used for daily totals.

## API

| Route | What it returns |
| --- | --- |
| `GET /api/stats` | Live kW, solar kW, net kW, today's kWh and cost |
| `GET /api/stats/daily?days=30` | Stored daily totals |
| `GET /api/stats/status` | Which connectors are configured |
| `GET /api/circuits` | Live circuit breakdown |
| `GET /api/circuits/averages` | 7-day averages per circuit |
| `GET /api/history?days=14` | Daily kWh |
| `GET /api/solar` | Today's solar Wh |
