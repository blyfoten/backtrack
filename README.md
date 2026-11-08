# Backtrack

Backing track generator served at https://backtrack.cfor.se. Static site (no build step);
bass and chords are synthesized in the browser with Web Audio; drums play recorded samples
(synth drums are the fallback while they load).

- `index.html`, `style.css`, `app.js` — the app. Edit and reload the page; the container mounts them read-only.
- `samples/` — drum WAVs (16-bit, trimmed) generated from `~/git/drumsamples` by `python3 tools/convert_drums.py`.
- `docker-compose.yml` — `nginx:alpine` on `172.17.0.1:3050`, proxied by `~/git/cfor-infra/nginx_conf/backtrack.conf`.

Start: `docker compose up -d`
