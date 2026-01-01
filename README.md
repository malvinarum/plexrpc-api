# PlexRPC API (Node.js)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square)](LICENSE)

<a href="https://github.com/sponsors/malvinarum">
  <img src="https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?style=flat-square&logo=github&logoColor=white" alt="Sponsor on GitHub" />
</a>
<a href="https://www.patreon.com/malvinarum">
  <img src="https://img.shields.io/badge/Patreon-Support-f96854?style=flat-square&logo=patreon&logoColor=white" alt="Support on Patreon" />
</a>
<a href="https://www.buymeacoffee.com/malvinarum">
  <img src="https://img.shields.io/badge/Buy_Me_A_Coffee-Donate-FFDD00?style=flat-square&logo=buymeacoffee&logoColor=black" alt="Buy Me A Coffee" />
</a>

---

The official backend service for **[PlexRPC](https://github.com/malvinarum/Plex-Rich-Presence)**.

This Node.js application acts as a secure middleware between the PlexRPC Windows client and various third-party metadata APIs (Spotify, TMDB, Google Books). It secures API keys server-side, provides a unified endpoint for rich metadata, and enforces client versioning.
## 🚀 Features

* **🎵 Music Metadata:** Authenticates with **Spotify** (Client Credentials Flow) to fetch high-res album art and track links.
* **🎬 Movie/TV Metadata:** Queries **TMDB** for movie posters and show details.
* **📖 Audiobook Metadata:** Searches **Google Books** for cover art and author info.
* **🛡️ Active Defense:** Includes in-memory **Rate Limiting** and **Auto-Banning** to protect API quotas from abusive clients.
* **🔐 Security:** Keeps all sensitive API keys (Spotify Secret, TMDB Key, etc.) on the server, keeping the client "configless" and secure.
* **📲 Version Enforcement:** Can "soft-block" obsolete clients by remotely injecting an "Update Required" notification into their Rich Presence.

## 🛠️ Prerequisites

* **Node.js** (v16 or higher recommended)
* **NPM**
* API Keys for:
    * [Spotify for Developers](https://developer.spotify.com/dashboard)
    * [The Movie Database (TMDB)](https://www.themoviedb.org/documentation/api)
    * [Google Books API](https://developers.google.com/books)

## 📥 Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/malvinarum/plexrpc-api.git](https://github.com/malvinarum/plexrpc-api.git)
    cd plexrpc-api
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment:**
    Rename `.env.example` to `.env` and fill in your details:
    ```bash
    cp .env.example .env
    ```
    
    **Required Variables:**
    ```ini
    PORT=3000
    SPOTIFY_CLIENT_ID=your_id
    SPOTIFY_CLIENT_SECRET=your_secret
    TMDB_API_KEY=your_key
    GOOGLE_BOOKS_KEY=your_key
    DISCORD_CLIENT_ID=your_discord_app_id
    
    # Security Configuration
    SECURITY_MODE=LOG_ONLY      # "LOG_ONLY" or "STRICT"
    LATEST_CLIENT_VERSION=2.1.0 # Minimum supported version
    ```

4.  **Start the Server:**
    ```bash
    npm start
    ```

## ⚙️ Configuration & Security Modes

You can control the behavior of the API by changing the `SECURITY_MODE` variable in your `.env` file and restarting the server.

| Mode | Description |
| :--- | :--- |
| **`LOG_ONLY`** | **Default.** Logs Client UUIDs and Versions to the console for analytics but allows all traffic. Rate limiting is disabled. Use this for testing/rollouts. |
| **`STRICT`** | **Active Defense.** Enforces UUID checks, enables Rate Limiting (30 req/min), and blocks old versions. |

### Passive Update Notification System
When in `STRICT` mode, if an outdated client (older than `LATEST_CLIENT_VERSION`) requests metadata, the server will **not** fetch real data. Instead, it returns a placeholder metadata payload containing an "Update Required" image and text. This naturally prompts the user to update by displaying the notification directly in their Rich Presence status.

## 📡 API Endpoints

### Metadata Lookups
* `GET /api/metadata/music?q={query}` - Returns Spotify track info & art.
* `GET /api/metadata/movie?q={query}` - Returns TMDB movie poster.
* `GET /api/metadata/tv?q={query}` - Returns TMDB TV show poster.
* `GET /api/metadata/book?q={query}` - Returns Google Books cover.

**Headers Required (Strict Mode):**
* `x-client-uuid`: A unique UUID v4 string.
* `x-app-version`: The semantic version of the client (e.g., "2.1.0").

### Configuration
* `GET /api/config/discord-id` 
  * Returns: `{ "client_id": "...", "latest_version": "2.1.0" }`
  * Used by the client to initialize Discord RPC and check for updates.

## 📜 License

This project is open-source. Feel free to fork, modify, and distribute.

## Disclaimer

**PlexRPC** is a community-developed, open-source project. It is **not** affiliated, associated, authorized, endorsed by, or in any way officially connected with **Plex, Inc.**, **Discord Inc.**, or any of their subsidiaries or affiliates.
