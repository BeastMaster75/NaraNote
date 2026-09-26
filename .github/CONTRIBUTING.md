# Contributing to NaraNote

Thanks for your interest in improving NaraNote. Bug reports, ideas and pull requests are all
welcome.

## Before you start

- **Bugs and ideas** go in [Issues](https://github.com/BeastMaster75/NaraNote/issues). For
  anything larger than a small fix, please open an issue first so we can agree on the approach
  before you spend time on it.
- **Security issues** must not be reported publicly — see [SECURITY.md](SECURITY.md).

## Setting up

Everything you need to run the app locally, including the one-off reference-data import, is in
[docs/development.md](../docs/development.md). The short version is `docker compose up` and
<http://localhost:5173>.

That guide's *Things worth knowing* section explains the decisions that aren't obvious from the
code — Flyway owning the schema, the Anki export format, the Japanese typography rules. Please
read it before changing those areas.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Keep each pull request to one change. Small, focused PRs are reviewed much faster.
3. Run the same checks CI runs:

   ```bash
   # frontend/
   npm run lint
   npm run build

   # backend/ (needs the database from docker compose running)
   ./mvnw verify
   ```

4. Open a pull request and fill in the template.

## Conventions

- **Commits** use the imperative mood with an optional
  [Conventional Commits](https://www.conventionalcommits.org/) prefix — `feat: add stroke
  animation`, `fix: keep furigana aligned on wrap`.
- **Database changes** always go in a new migration in
  `backend/src/main/resources/db/migration`. Never edit a migration that has already been
  merged.
- **Frontend** code is TypeScript, formatted like the surrounding code, and must pass `oxlint`.
  Design values come from `frontend/src/styles/tokens.css` rather than being hard-coded.
- **Backend** code is organised by feature (`kanji`, `mining`, `review`, …), not by layer. New
  code goes in the package for the feature it belongs to.
- **Third-party data** is never committed. It's downloaded into the gitignored `data/` folder.

## Licensing of data

The dictionary and stroke-order data are CC BY-SA, and their attribution is a licence condition.
Don't remove or hide the credits in the app or the README.
