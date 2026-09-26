<img src=".github/assets/banner.svg" alt="NaraNote — Collect the Japanese You Meet" width="100%">

<p align="center">
  <a href="https://github.com/BeastMaster75/NaraNote/actions/workflows/ci.yml"><img src="https://github.com/BeastMaster75/NaraNote/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <img src="https://img.shields.io/badge/Java-21-c9506b?logo=openjdk&logoColor=white" alt="Java 21">
  <img src="https://img.shields.io/badge/Spring_Boot-4.1-6e8351?logo=springboot&logoColor=white" alt="Spring Boot 4.1">
  <img src="https://img.shields.io/badge/React-19-c08a2e?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/PostgreSQL-16-b8433a?logo=postgresql&logoColor=white" alt="PostgreSQL 16">
  <img src="https://img.shields.io/badge/Docker-ready-7a6169?logo=docker&logoColor=white" alt="Docker ready">
</p>

<p align="center">
  <a href="#what-you-do-with-it">Features</a> ·
  <a href="#how-its-built">How It's Built</a> ·
  <a href="#project-structure">Project Structure</a> ·
  <a href="#running-it-locally">Running It Locally</a> ·
  <a href=".github/CONTRIBUTING.md">Contributing</a>
</p>

---

Anki is very good at reviewing flashcards and quite bad at making them. Looking a word up,
finding a sentence it lives in, typing it all into a card — it's slow enough that most people
just don't, and the word gets forgotten instead. NaraNote is the other half of that: the part
where you collect what you meet, so reviewing it later is easy.

## What You Do With It

**Mine what you read.** Paste in Japanese from anywhere — a manga page, a news article,
subtitles, a class handout. It comes back split into words with their readings and meanings.
Save the ones you don't know, and the sentence they came from is saved with them, because a
word without context is much harder to remember. Words you've already saved appear dimmed, so
any text you paste quietly shows you how much of it you already know.

**Read aloud and get checked.** Paste a passage or drop in a `.txt`, `.pdf` or `.epub`, read it
out loud, and see which parts came out right. Words have natural Japanese audio one tap away,
here and in review.

**Look up any kanji — even one you can't type.** Search by English meaning or by reading, or go
straight to a character. You get readings, meanings, stroke count, JLPT level, and a
stroke-order diagram with every stroke numbered and animated. Each character shows what it's
built from, and those components link onward — so 待 opens into 彳, 土 and 寸.

It also shows what's true of *you*: the words in your collection that contain it, how you've
been getting on writing it, and which other characters you're studying are built the same way.

**Practise writing by hand.** You're shown a meaning and its readings; you draw the character
from memory. Then the real one appears with every stroke numbered — and your own strokes are
numbered too, in the order you made them, so you can see not just whether you got it right but
exactly where your stroke order went wrong. Flashcard apps can't check handwriting; you have to
mark yourself, and marking yourself is how bad habits set in.

**Review, if you want to.** Words and characters come back when they're due, using
[FSRS](https://github.com/open-spaced-repetition), the same scheduling algorithm Anki uses. You
don't have to review here — but you shouldn't need a second app just to be useful.

**Take it to Anki whenever you like.** Everything you've collected exports as a real `.apkg`
deck, each word carrying the sentence you met it in. Re-exporting updates the same cards rather
than duplicating them, so nothing you've already reviewed is lost. The export is a door, not a
requirement.

**See what you actually did.** The home page is a calendar that fills itself in — characters
drawn, words reviewed, things added — with no streaks and nothing carried forward. Beside it
sits a short list of what's worth doing right now, worked out from your own collection rather
than typed in by you. You can add your own tasks too, and give them a day or a character.

**Start without signing up.** Try it as a guest and keep everything you collect by adding an
email later, or sign in with Google. You can delete your account and everything in it from
Settings at any time.

## How It's Built

| Layer        | Technology                                                                 |
| ------------ | -------------------------------------------------------------------------- |
| Frontend     | React 19, TypeScript, Vite, React Router                                   |
| Backend      | Spring Boot 4.1, Java 21, Maven                                            |
| Database     | PostgreSQL 16, schema managed by Flyway                                    |
| Japanese NLP | Lucene Kuromoji tokenizer, JMdict, KANJIDIC2, KRADFILE, KanjiVG            |
| Scheduling   | FSRS                                                                       |
| Speech       | Self-hosted [VOICEVOX](https://voicevox.hiroshiba.jp/) engine              |
| Translation  | Google Gemini, using each user's own API key (encrypted at rest)           |
| Delivery     | One Docker image behind Caddy (automatic HTTPS), GitHub Actions CI         |

A few things worth a look if you're reading the source:

- **The Anki export is written in plain Java.** `.apkg` files are generated directly with
  SQLite, matched field by field against the reference Python implementation, and keep stable
  card IDs so re-exporting updates cards instead of duplicating them.
- **Handwriting is marked stroke by stroke** in the browser against KanjiVG's reference strokes:
  each one is judged correct, out of order, drawn backwards, misshapen or wrong, wherever in the
  box the character was drawn.
- **Suggestions are never stored.** The "worth doing now" list is computed from your collection
  on every request, so it can't go stale.
- **One container in production.** The frontend is built into the backend jar and served by
  Spring Boot, with Caddy in front for HTTPS. See [how it's deployed](docs/deployment.md).

The reasoning behind these and other decisions is in
[docs/development.md → Things worth knowing](docs/development.md#things-worth-knowing).

## Project Structure

```
NaraNote/
├── backend/          Spring Boot API — one package per feature (kanji, mining, review, export…)
│   └── src/main/resources/db/migration/   Flyway migrations
├── frontend/         React single-page app — one folder per page
├── .github/          CI, Dependabot, issue templates, contributing and security docs
├── deploy/           Caddyfile, backup and restore scripts for production
├── docs/             Development and deployment guides
├── Dockerfile        Production image: frontend built into the backend jar
├── docker-compose.yml        Local development stack
└── docker-compose.prod.yml   Production stack
```

## Running It Locally

```bash
git clone https://github.com/BeastMaster75/NaraNote.git
cd NaraNote
docker compose up
```

Then open <http://localhost:5173>. Emails the app sends (verification, password reset) are
caught by Mailpit at <http://localhost:8025>.

The dictionary, kanji and stroke-order data are third-party and aren't committed. The one-off
download and import step, and running the backend and frontend without Docker, are in
**[docs/development.md](docs/development.md)**.

## Roadmap

- Your own card designs for the Anki export
- More ways to organise a collection into decks

Ideas and bug reports are welcome in [Issues](https://github.com/BeastMaster75/NaraNote/issues).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](.github/CONTRIBUTING.md) before opening a pull
request, and report security issues privately as described in [SECURITY.md](.github/SECURITY.md).

## Acknowledgements

Dictionary data from [JMdict](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project),
[KANJIDIC2](https://www.edrdg.org/wiki/index.php/KANJIDIC_Project) and KRADFILE (EDRDG,
CC BY-SA). Stroke-order diagrams from [KanjiVG](https://kanjivg.tagaini.net/) © Ulrich Apel,
CC BY-SA 3.0. Modern JLPT levels from
[davidluzgouveia/kanji-data](https://github.com/davidluzgouveia/kanji-data) (MIT). Speech by
[VOICEVOX](https://voicevox.hiroshiba.jp/).
