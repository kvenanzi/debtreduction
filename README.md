# Debt Reduction Planner

Plan and visualise your debt payoff using Avalanche, Snowball, Entered Order, or Custom strategies. The app simulates monthly interest, minimum payments, snowball rollovers, and exposes charts for total balance remaining, snowball growth, and detailed schedules.

## Features
- Creditor table with strategy-aware ordering, currency/percent formatting, and persistent storage (SQLite).
- Simulation shows cumulative balance trend, snowball growth, current balance per debt, payoff timelines, and a month-by-month payment grid with extra payment support.
- Responsive UI styled with Tailwind and Chart.js visualisations.
- REST API (Flask) powers the HTMX/Alpine front end; results recompute on every change.
- Named Docker volume keeps data safe across container restarts.

## Getting Started

### Local Setup
```bash
pip install -r requirements.txt
python3 app.py  # http://127.0.0.1:5000
```

### Run Tests
```bash
python3 -m pytest
```

## Docker & Compose

Build locally:
```bash
docker build -t ghcr.io/kvenanzi/debtreduction:latest .
```

Or pull the published image and run via compose:
```bash
docker compose pull
docker compose up -d  # http://localhost:5000
```

The compose file mounts a named volume `instance-data:/app/instance` so the SQLite database survives container restarts.

## Publish to GHCR
```bash
echo $GH_PAT | docker login ghcr.io -u kvenanzi --password-stdin
docker build -t ghcr.io/kvenanzi/debtreduction:latest .
docker push ghcr.io/kvenanzi/debtreduction:latest
```

## Project Structure
- `app.py` – Flask entry point.
- `debtreduction/` – blueprints, models, simulation engine, static assets, templates.
- `tests/` – pytest coverage for strategy ordering and amortisation.
- `docker-compose.yml` / `Dockerfile` – container and deployment configuration.

## Configuration Notes
- Settings, debts, and schedule overrides persist in `instance/data.db`.
- Default simulation starts from the saved balance date; edit strategy, monthly budget, or additional payments to see immediate recalculations.

## Contributing
- Open issues/PRs welcome. Please add or update tests for simulation logic, run `python3 -m pytest`, and include screenshots for UI changes when possible.

## License
MIT License © 2025 Kevin Venanzi
