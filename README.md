# PlexRPC API (Backend)

The official backend service for **[PlexRPC](https://github.com/malvinarum/Plex-Rich-Presence)**.

Please Refer to **[PlexRPC API (Cloudflare Worker)](https://github.com/malvinarum/PlexRPC-API-Cloudflare-Worker)** if you wanna set it up serverless.

This Node.js application acts as a secure middleware between the PlexRPC Windows client and various third-party metadata APIs (Spotify, TMDB, Google Books). Its primary purpose is to secure API keys serverside and provide a unified endpoint for rich metadata.

## 🚀 Features

* **🎵 Music Metadata:** Authenticates with **Spotify** (Client Credentials Flow) to fetch high-res album art and track links.
* **🎬 Movie/TV Metadata:** Queries **TMDB** for movie posters and show details.
* **📖 Audiobook Metadata:** Searches **Google Books** for cover art and author info.
* **🔐 Security:** Keeps all sensitive API keys (Spotify Secret, TMDB Key, etc.) on the server, keeping the client "configless" and secure.
* **⚙️ Dynamic Config:** Serves global configuration (like the Discord App ID) to allow client updates without re-compiling.

## 🛠️ Prerequisites

* **Node.js** (v14 or higher)
* **NPM**
* API Keys for:
    * [Spotify for Developers](https://developer.spotify.com/)
    * [The Movie Database (TMDB)](https://www.themoviedb.org/documentation/api)
    * [Google Books API](https://developers.google.com/books)

## 📥 Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/malvinarum/plexrpc-api.git](https://github.com/malvinarum/plexrpc-api.git)
    cd plexrpc-api
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory:
    ```env
    PORT=3000
    
    # Metadata Providers
    SPOTIFY_CLIENT_ID=your_spotify_client_id
    SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
    TMDB_API_KEY=your_tmdb_api_key
    GOOGLE_BOOKS_KEY=your_google_books_key
    
    # Client Config
    DISCORD_CLIENT_ID=your_discord_application_id
    ```

4.  **Start the Server:**
    ```bash
    # For development
    node server.js
    
    # For production (recommended)
    pm2 start server.js --name "plexrpc-api"
    ```

## 📡 API Endpoints

### Metadata Lookups
* `GET /api/metadata/music?q={query}` - Returns Spotify track info & art.
* `GET /api/metadata/movie?q={query}` - Returns TMDB movie poster.
* `GET /api/metadata/tv?q={query}` - Returns TMDB TV show poster.
* `GET /api/metadata/book?q={query}` - Returns Google Books cover.

### Configuration
* `GET /api/config/discord-id` - Returns the active Discord Client ID.

## 📜 License

This project is open-source. Feel free to fork, modify, and distribute.

## Disclaimer

**PlexRPC** is a community-developed, open-source project. It is **not** affiliated, associated, authorized, endorsed by, or in any way officially connected with **Plex, Inc.**, **Discord Inc.**, or any of their subsidiaries or affiliates.

* The official Plex website can be found at [https://www.plex.tv](https://www.plex.tv).
* The official Discord website can be found at [https://discord.com](https://discord.com).

The names "Plex", "Discord", as well as related names, marks, emblems, and images are registered trademarks of their respective owners. This application is intended for personal, non-commercial use only.
