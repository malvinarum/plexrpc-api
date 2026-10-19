const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Standard Express CORS
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- ⚙️ CONFIGURATION ---
const SECURITY_MODE = process.env.SECURITY_MODE || "LOG_ONLY";
const LATEST_VERSION = process.env.LATEST_CLIENT_VERSION || "2.4.0";
const UPDATE_URL = "https://github.com/malvinarum/Plex-Rich-Presence/releases";
const UPDATE_IMAGE = "https://raw.githubusercontent.com/malvinarum/Plex-Rich-Presence/refs/heads/main/assets/icon.png";

// --- 🚦 RATE LIMIT CONFIGURATION ---
const RATE_LIMIT_WINDOW = 60 * 1000;                                   // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX, 10) || 20;   // Max requests per window per client
const BAN_DURATION = 5 * 60 * 1000;                                    // 5 minutes ban if limit exceeded

// --- 🧠 CACHE CONFIGURATION ---
const TTL_FOUND = 24 * 60 * 60 * 1000;  // Successful lookups
const TTL_NOT_FOUND = 60 * 60 * 1000;   // Upstream answered, nothing matched
const TTL_ERROR = 5 * 60 * 1000;        // Upstream failed, rate limited or timed out
const MAX_CACHE_ENTRIES = 5000;         // Hard cap so a long-running process can't grow without bound

// Upstream request timeout. The client gives up after ~3s, so don't wait much longer than that.
const UPSTREAM_TIMEOUT = 5000;

// Global in-memory state
const clients = new Map();
const apiCache = new Map();

const http = axios.create({
    timeout: UPSTREAM_TIMEOUT,
    headers: { "User-Agent": "PlexRPC-API/2.4 (metadata)" }
});

// Middleware
app.use(express.json());
app.use(cors());

// --- 🧹 HOUSEKEEPING ---
// Unlike a Worker isolate, this process runs indefinitely, so prune expired state periodically.
setInterval(() => {
    const now = Date.now();
    for (const [uuid, client] of clients) {
        if (client.bannedUntil < now && now - client.windowStart > RATE_LIMIT_WINDOW) clients.delete(uuid);
    }
    for (const [key, entry] of apiCache) {
        if (entry.expires < now) apiCache.delete(key);
    }
}, 10 * 60 * 1000).unref();

function cacheSet(key, data, ttl) {
    if (apiCache.size >= MAX_CACHE_ENTRIES) {
        // Map preserves insertion order: drop the oldest entry
        apiCache.delete(apiCache.keys().next().value);
    }
    apiCache.set(key, { data, expires: Date.now() + ttl });
}

function updateRequiredPayload() {
    return {
        found: true,
        title: `Update to v${LATEST_VERSION}`,
        line1: "⚠️ Update Required",
        line2: `Please install v${LATEST_VERSION}`,
        image: UPDATE_IMAGE,
        url: UPDATE_URL
    };
}

// --- 🛡️ SECURITY & ANALYTICS MIDDLEWARE ---
app.use((req, res, next) => {
    const clientVersion = req.headers['x-app-version'] || "UNKNOWN";
    const clientUuid = req.headers['x-client-uuid'] || "UNKNOWN";
    const path = req.path;
    const isMetadataRoute = path.startsWith('/api/metadata/');

    // 1. Analytics Log (no IP addresses or location, by design)
    console.log(`[${SECURITY_MODE}] Path: ${path} | Ver: ${clientVersion} | UUID: ${clientUuid}`);

    // Security checks and caching only apply to metadata lookups.
    // The config route stays open so clients can always fetch the Discord ID and latest version.
    if (!isMetadataRoute) {
        return next();
    }

    // --- STRICT MODE ENFORCEMENT ---
    if (SECURITY_MODE === "STRICT") {

        // A. HANDLE OLD CLIENTS (Missing UUID)
        // Instead of blocking, we send the "Update Required" payload.
        if (clientUuid === "UNKNOWN") {
            return res.json(updateRequiredPayload());
        }

        // B. Rate Limiting (Only for valid UUIDs)
        const now = Date.now();
        let client = clients.get(clientUuid) || { count: 0, windowStart: now, bannedUntil: 0 };

        if (client.bannedUntil > now) {
            const remainingSeconds = Math.ceil((client.bannedUntil - now) / 1000);
            console.warn(`[BLOCKED] UUID: ${clientUuid} is banned for ${remainingSeconds}s`);
            return res.status(429).json({ error: `Too many requests. Banned for ${remainingSeconds}s` });
        }

        if (now - client.windowStart > RATE_LIMIT_WINDOW) {
            client.count = 1;
            client.windowStart = now;
            client.bannedUntil = 0;
        } else {
            client.count++;
        }

        if (client.count > MAX_REQUESTS) {
            client.bannedUntil = now + BAN_DURATION;
            console.warn(`[BANNING] UUID: ${clientUuid} exceeded limit (${MAX_REQUESTS}/min)`);
            clients.set(clientUuid, client);
            return res.status(429).json({ error: "Rate limit exceeded. Banned for 5 minutes." });
        }
        clients.set(clientUuid, client);

        // C. Enforce Version (For clients that HAVE a UUID but are outdated)
        if (clientVersion !== "UNKNOWN" &&
            clientVersion.localeCompare(LATEST_VERSION, undefined, { numeric: true, sensitivity: 'base' }) < 0) {
            return res.json(updateRequiredPayload());
        }
    }

    // --- 🧠 EDGE CACHE (Intercept Before Upstream) ---
    const cacheKey = req.originalUrl;
    const cached = apiCache.get(cacheKey);
    if (cached) {
        if (Date.now() < cached.expires) return res.json(cached.data);
        apiCache.delete(cacheKey);
    }
    res.locals.cacheKey = cacheKey;

    next();
});

// Shared response helpers for metadata routes
function sendFound(res, payload) {
    cacheSet(res.locals.cacheKey, payload, TTL_FOUND);
    return res.json(payload);
}

function sendNotFound(res) {
    const payload = { found: false };
    cacheSet(res.locals.cacheKey, payload, TTL_NOT_FOUND);
    return res.json(payload);
}

function sendUpstreamError(res, source, query, error) {
    const status = error.response?.status || error.code || "unknown";
    console.warn(`[${source}] lookup failed (${status}) for query "${query}"`);
    const payload = { found: false };
    cacheSet(res.locals.cacheKey, payload, TTL_ERROR);
    return res.json(payload);
}

// --- 🎧 ROUTE: MUSIC (Deezer) ---
app.get('/api/metadata/music', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "No query provided" });

    const targetAlbum = (req.query.album || "").toString();

    try {
        const response = await http.get('https://api.deezer.com/search', {
            params: { q: query, limit: 25 }
        });
        const data = response.data;

        // Deezer signals quota errors as a 200 with an {error:{code:4,...}} body
        if (data.error) {
            return sendUpstreamError(res, "Deezer", query, { code: `deezer-${data.error.code}` });
        }

        if (!data.data || data.data.length === 0) return sendNotFound(res);

        let bestMatch = data.data[0];
        if (targetAlbum) {
            const targetLower = targetAlbum.toLowerCase();
            const albumMatch = data.data.find(t => t.album?.title?.toLowerCase().includes(targetLower));
            if (albumMatch) bestMatch = albumMatch;
        }

        return sendFound(res, {
            found: true,
            title: bestMatch.title,
            artist: bestMatch.artist?.name,
            album: bestMatch.album?.title,
            image: bestMatch.album?.cover_xl || bestMatch.album?.cover_big,
            url: bestMatch.link
        });
    } catch (error) {
        return sendUpstreamError(res, "Deezer", query, error);
    }
});

// --- 🎬 ROUTE: MOVIES (TMDB) ---
app.get('/api/metadata/movie', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ found: false });

    // Optional release year to disambiguate same-titled films
    const yearParam = (req.query.year || "").toString();
    const year = /^\d{4}$/.test(yearParam) ? yearParam : null;

    const searchMovies = (withYear) => http.get('https://api.themoviedb.org/3/search/movie', {
        params: {
            api_key: process.env.TMDB_API_KEY,
            query,
            include_adult: false,
            ...(withYear ? { year: withYear } : {})
        }
    });

    try {
        let response = await searchMovies(year);

        // Plex and TMDB years can disagree (festival vs. theatrical release), so fall back to a plain search
        if (year && (!response.data.results || response.data.results.length === 0)) {
            response = await searchMovies(null);
        }

        const result = response.data.results?.[0];
        if (result && result.poster_path) {
            return sendFound(res, {
                found: true,
                title: result.title,
                image: `https://image.tmdb.org/t/p/w500${result.poster_path}`,
                url: `https://www.themoviedb.org/movie/${result.id}`
            });
        }
        return sendNotFound(res);
    } catch (error) {
        return sendUpstreamError(res, "TMDB", query, error);
    }
});

// --- 📺 ROUTE: TV SHOWS (TMDB) ---
app.get('/api/metadata/tv', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ found: false });

    try {
        const response = await http.get('https://api.themoviedb.org/3/search/tv', {
            params: {
                api_key: process.env.TMDB_API_KEY,
                query,
                include_adult: false
            }
        });

        const result = response.data.results?.[0];
        if (result && result.poster_path) {
            return sendFound(res, {
                found: true,
                title: result.name,
                image: `https://image.tmdb.org/t/p/w500${result.poster_path}`,
                url: `https://www.themoviedb.org/tv/${result.id}`
            });
        }
        return sendNotFound(res);
    } catch (error) {
        return sendUpstreamError(res, "TMDB", query, error);
    }
});

// --- 📚 ROUTE: BOOKS (Google Books) ---
app.get('/api/metadata/book', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ found: false });

    try {
        // Support both old and new env var names
        const apiKey = process.env.GOOGLE_BOOKS_API_KEY || process.env.GOOGLE_BOOKS_KEY;
        const response = await http.get('https://www.googleapis.com/books/v1/volumes', {
            params: { q: query, key: apiKey, maxResults: 1 }
        });

        const result = response.data.items?.[0]?.volumeInfo;
        if (result && result.imageLinks?.thumbnail) {
            return sendFound(res, {
                found: true,
                title: result.title,
                image: result.imageLinks.thumbnail.replace('http://', 'https://'),
                url: result.infoLink
            });
        }
        return sendNotFound(res);
    } catch (error) {
        return sendUpstreamError(res, "GoogleBooks", query, error);
    }
});

// --- ⚙️ ROUTE: CONFIG ---
app.get('/api/config/discord-id', (req, res) => {
    res.json({
        client_id: process.env.DISCORD_CLIENT_ID || "MISSING_ID",
        latest_version: LATEST_VERSION
    });
});

// --- 404 FALLBACK ---
app.use((req, res) => {
    res.status(404).json({ error: "Not Found" });
});

// --- START ---
app.listen(PORT, () => {
    console.log(`🚀 PlexRPC Backend running on port ${PORT}`);
    console.log(`🛡️ Security Mode: ${SECURITY_MODE} (rate limit: ${MAX_REQUESTS}/min)`);
    console.log(`📲 Enforcing Version: v${LATEST_VERSION}+`);
});
