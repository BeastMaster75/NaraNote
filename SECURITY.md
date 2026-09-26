# Security Policy

## Supported versions

NaraNote is deployed continuously from `main`. Security fixes are made there and are not
backported to older commits.

## Reporting a vulnerability

**Please don't report security issues in public issues, discussions or pull requests.**

Report them privately through GitHub instead:
[**Report a vulnerability**](https://github.com/BeastMaster75/NaraNote/security/advisories/new)
(the *Security* tab → *Report a vulnerability*).

Please include:

- what the issue is and what an attacker could do with it,
- steps or a proof of concept to reproduce it,
- the affected area (for example sign-in, sessions, file upload, the Anki export).

You can expect an acknowledgement within a few days. Once the issue is confirmed, a fix will be
prioritised and you'll be kept informed until it is released. With your permission, you'll be
credited in the advisory.

## Scope

In scope: this repository's code and its documented production setup
(`docker-compose.prod.yml`, `deploy/`).

Out of scope: vulnerabilities in third-party services and images (report those upstream), and
issues that need an already-compromised server or a user's unlocked device.
