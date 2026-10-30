# PlexRPC API (Node.js)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square)](LICENSE)

<a href="https://github.com/sponsors/malvinarum">
  <img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=flat-square&logo=github&logoColor=white" alt="Sponsor on GitHub" />
</a>
<a href="https://www.buymeacoffee.com/malvinarum">
  <img src="https://img.shields.io/badge/Buy_Me_A_Coffee-Donate-FFDD00?style=flat-square&logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee" />
</a>

---

The self-hostable Node.js backend for **[PlexRPC](https://github.com/malvinarum/Plex-Rich-Presence)**.

This Node.js application acts as a secure middleware between the PlexRPC Windows client and various third-party metadata APIs (Deezer, TMDB, Google Books). It secures API keys server-side, provides a unified endpoint for rich metadata, and enforces client versioning.

> 💡 Prefer serverless? The **[Cloudflare Worker version](https://github.com/malvinarum/PlexRPC-API-Cloudflare-Worker)** offers the same API and runs on Cloudflare's free tier. Both backends are kept feature-compatible.

## 🚀 Features

* **🎵 Music Metadata:** Queries **Deezer** for high-res album art and track links, using the album name to pick the right release.
* **🎬 Movie/TV Metadata:** Queries **TMDB** for movie and show posters. Movies are matched by title and release year.
* **📖 Audiobook Metadata:** Searches **Google Books** for cover art and author info.
* **🧠 Response Caching:** Caches lookups in memory (hits for 24h, misses for 1h, upstream errors for 5 min) to protect API quotas and keep responses fast.
* **⏱️ Upstream Timeouts:** Slow or hanging upstream APIs are cut off after 5 seconds instead of tying up the server.
* **🛡️ Active Defense:** Includes in-memory **Rate Limiting** and **Auto-Banning** to protect API quotas from abusive clients.
* **🔐 Security:** Keeps all sensitive API keys (TMDB Key, Google Books Key, etc.) on the server, keeping the client "configless" and secure.
* **📲 Version Enforcement:** Can "soft-block" obsolete clients by remotely injecting an "Update Required" notification into their Rich Presence.

## 🛠️ Prerequisites

* **Node.js** v18 or higher (required by Express 5)
* **NPM**
* API Keys for:
  * [The Movie Database (TMDB)](https://www.themoviedb.org/documentation/api)
  * [Google Books API](https://developers.google.com/books)
  * *(Deezer's public search API needs no key)*

## 📥 Installation & Setup

1. **Clone the repository:**

```
git clone https://github.com/malvinarum/plexrpc-api.git
cd plexrpc-api
```

2. **Install dependencies:**

```
npm install
```

3. **Configure Environment:** Copy `.env.example` to `.env` and fill in your details:

```
cp .env.example .env
```

   **Variables:**

```
PORT=3000
TMDB_API_KEY=your_key
GOOGLE_BOOKS_KEY=your_key
DISCORD_CLIENT_ID=your_discord_app_id

# Security Configuration
SECURITY_MODE=LOG_ONLY      # "LOG_ONLY" or "STRICT"
LATEST_CLIENT_VERSION=2.4.0 # Minimum supported client version
RATE_LIMIT_MAX=20           # Max metadata requests per client per minute (STRICT mode)
```

4. **Start the Server:**

```
npm start
```

## ⚙️ Configuration & Security Modes

You can control the behavior of the API by changing the `SECURITY_MODE` variable in your `.env` file and restarting the server.

| Mode | Description |
| --- | --- |
| **`LOG_ONLY`** | **Default.** Logs client UUIDs and versions to the console for analytics but allows all traffic. Rate limiting is disabled. Use this for testing/rollouts. |
| **`STRICT`** | **Active Defense.** Enforces UUID checks, enables Rate Limiting (`RATE_LIMIT_MAX` requests/min per client, default 20, with a 5-minute ban when exceeded), and blocks old versions. |

Security checks only apply to `/api/metadata/*` routes. The config route always stays open so outdated clients can still fetch the latest version.

### Passive Update Notification System

When in `STRICT` mode, if an outdated client (older than `LATEST_CLIENT_VERSION`) requests metadata, the server will **not** fetch real data. Instead, it returns a placeholder metadata payload containing an "Update Required" image and text. This naturally prompts the user to update by displaying the notification directly in their Rich Presence status.

## 📡 API Endpoints

### Metadata Lookups

* `GET /api/metadata/music?q={query}&album={album}` - Returns Deezer track info & art. `album` is optional and used to disambiguate re-releases/compilations.
* `GET /api/metadata/movie?q={query}&year={year}` - Returns TMDB movie poster. `year` is optional and used to disambiguate same-titled films; if nothing matches with the year, the server retries without it.
* `GET /api/metadata/tv?q={query}` - Returns TMDB TV show poster.
* `GET /api/metadata/book?q={query}` - Returns Google Books cover.

**Headers Required (Strict Mode):**

* `x-client-uuid`: A unique UUID v4 string.
* `x-app-version`: The semantic version of the client (e.g., "2.4.0").

### Configuration

* `GET /api/config/discord-id`
  * Returns: `{ "client_id": "...", "latest_version": "2.4.0" }`
  * Used by the client to initialize Discord RPC and check for updates.

## 🔒 Privacy

The server logs only the request path, client app version and the client's random install ID (UUID) to the console. It does not log IP addresses or location data. Logs stay wherever your console output goes; nothing is sent to third parties beyond the metadata lookups themselves.

## 📜 License

This project is licensed under the [GPL-3.0 license](LICENSE). Feel free to fork, modify, and distribute it, as long as derivative works are also released as open source under GPL-3.0.

## Disclaimer

**PlexRPC** is a community-developed, open-source project. It is **not** affiliated, associated, authorized, endorsed by, or in any way officially connected with **Plex, Inc.**, **Discord Inc.**, or any of their subsidiaries or affiliates.
