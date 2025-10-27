# Repository Guidelines

## Project Structure & Module Organization
- `app.py` starts the Flask server via `debtreduction.create_app()`.
- `debtreduction/` holds the application logic: `api.py` (REST endpoints), `simulation.py` (payoff engine), `models.py` (SQLAlchemy ORM), `views.py` (HTML route), and `static/` + `templates/` assets.
- `instance/` is created at runtime for the SQLite database (`data.db`). Keep it out of version control.
- `tests/` contains pytest suites; add new scenarios under `tests/` with descriptive filenames.

## Build, Test, and Development Commands
- `python3 app.py` — run the development server (defaults to `http://127.0.0.1:5000`).
- `flask --app app run --debug` — alternative run command with live reload.
- `python3 -m pytest` — execute unit tests for the simulation engine.
- `pip install -r requirements.txt` — install Flask, SQLAlchemy, pytest, and supporting packages.

## Coding Style & Naming Conventions
- Follow PEP 8 for Python; use 4-space indentation and descriptive snake_case for variables and functions.
- Keep monetary values as `Decimal` objects and round with `quantize` helpers (`debtreduction/simulation.py`).
- Front-end scripts live in `static/js` (ES modules) and styles in `static/css`; keep naming kebab-case.
- Do not commit Tailwind CLI artifacts—custom CSS is handcrafted in `static/css/styles.css`.

## Testing Guidelines
- Primary framework: `pytest` with plain asserts; place fixtures/helpers at the top of each test module (`tests/test_simulation.py`).
- Name tests with `test_<unit_of_work>_<expected_behavior>`; extend coverage with deterministic scenarios before touching the engine.
- Run `python3 -m pytest` before submitting changes; ensure new strategies or calculations include regression cases.

## Commit & Pull Request Guidelines
- Write commits in the present tense (e.g., `Add avalanche payoff regression test`), grouping related changes logically.
- Reference relevant spec items or issues in the commit or PR body when altering core logic.
- Pull requests should include: purpose summary, testing command output (e.g., pytest pass), and UI screenshots whenever front-end changes affect visuals.

## Security & Configuration Tips
- Secrets are not required; SQLite lives locally. If deploying, configure environment variables for `SQLALCHEMY_DATABASE_URI` outside the repo.
- Avoid sharing `instance/data.db`; collaborators can rebuild it by starting the app once.
