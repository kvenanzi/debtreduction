# Debt Reduction Planner

Interactive web app for modelling and tracking debt payoff strategies. Enter each creditor, choose Avalanche, Snowball, Entered Order, or Custom priority, and see timelines, charts, and month-by-month schedules that update instantly.

## Highlights
- Strategy-aware ordering with editable currency/percent fields and persistent storage (SQLite).
- Monthly simulation with cumulative balance trend, snowball growth, current balance per debt, payoff dates, and an editable payment grid for extra contributions.
- HTMX/Alpine-powered UI styled with Tailwind; charts rendered via Chart.js.
- Named Docker volume keeps data between container restarts.

## Stack
- **Backend:** Flask + SQLAlchemy (SQLite persistence)
- **Frontend:** HTMX, Alpine.js, Tailwind CSS, Chart.js
- **Tests:** pytest

## Getting Started

### Local Development
```bash
pip install -r requirements.txt
python3 app.py  # http://127.0.0.1:5000
```

The first run creates `instance/data.db` (ignored by git) to hold settings, debts, and overrides.

### Run Tests
```bash
python3 -m pytest
```

## Docker & Compose

Build locally:
```bash
docker build -t ghcr.io/kvenanzi/debtreduction:latest .
```

Or pull a published image and run via compose:
```bash
docker compose pull
docker compose up -d  # http://localhost:5000
```

The compose file mounts a named volume `instance-data:/app/instance` so the SQLite database survives container restarts.

To publish to your own registry, build/tag the image and push with your registry credentials, then update `docker-compose.yml` to reference that image.

## Project Structure
- `app.py` – Flask entry point.
- `debtreduction/` – API routes, simulation engine, models, templates, static assets.
- `tests/` – pytest coverage for the payoff engine and ordering rules.
- `docker-compose.yml` / `Dockerfile` – container configuration.
- `instance/` – runtime data folder (contains `data.db`, ignored by git).

## Configuration Notes
- Simulation starts from the saved balance date; adjust strategy, monthly budget, or additional payments to see immediate recalculations.
- All monetary values are handled as `Decimal` in the backend; the UI enforces currency/percent formatting when editing.

## Contributing
Pull requests and issues are welcome. Please add/update tests for simulation logic, run `python3 -m pytest`, and include screenshots for UI changes when relevant.

## License
MIT License © 2025 Kevin Venanzi
