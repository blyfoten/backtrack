# Backtrack

Backing track generator served at https://backtrack.cfor.se. Static site (no build step);
chords are synthesized in the browser with Web Audio; drums and bass play recorded samples
(the synth versions are the fallback while they load).

- `index.html`, `style.css`, `app.js` — the app. Edit and reload the page; the container mounts them read-only.
- `samples/` — drum WAVs (16-bit, trimmed) generated from `~/git/drumsamples` by `python3 tools/convert_drums.py`.
- `samples/bass/` — electric bass, one note per semitone from B0 to B2 at two strengths (24 kHz mono,
  2 s each), from Karoryfer's Black And Blue Basses (CC0-1.0,
  https://github.com/sfzinstruments/karoryfer.black-and-blue-basses), made by `tools/fetch_bass.sh`
  (needs curl and ffmpeg). Rock, funk and four-on-the-floor use the harder take.
- `docker-compose.yml` — `nginx:alpine` on `172.17.0.1:3050`, proxied by `~/git/cfor-infra/nginx_conf/backtrack.conf`.

Start: `docker compose up -d`
