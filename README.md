# Backtrack

Backing track generator served at https://backtrack.cfor.se. Static site (no build step);
all audio is synthesized in the browser with Web Audio.

- `index.html`, `style.css`, `app.js` — the app. Edit and reload the page; the container mounts them read-only.
- `docker-compose.yml` — `nginx:alpine` on `172.17.0.1:3050`, proxied by `~/git/cfor-infra/nginx_conf/backtrack.conf`.

Start: `docker compose up -d`
