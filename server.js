const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Standard Express CORS
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- ⚙️ CONFIGURATION ---
const SECURITY_MODE = process.env.SECURITY_MODE || "LOG_ONLY"; 
const LATEST_VERSION = process.env.LATEST_CLIENT_VERSION || "2.1.0";
const UPDATE_URL = "https://github.com/malvinarum/Plex-Rich-Presence/releases";

// --- 🚦 RATE LIMIT CONFIGURATION ---
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30;             // Max requests per window
const BAN_DURATION = 5 * 60 * 1000;  // 5 minutes ban if limit exceeded

// Global state for rate limiting (In-Memory)
const clients = new Map();

// Middleware
app.use(express.json());
app.use(cors());

// --- 🛡️ SECURITY & ANALYTICS MIDDLEWARE ---
app.use((req, res, next) => {
    const clientVersion = req.headers['x-app-version'] || "UNKNOWN";
    const clientUuid = req.headers['x-client-uuid'] || "UNKNOWN";
    const path = req.path;
    const isConfigRoute = path.startsWith('/api/config/');

    // 1. Analytics Log
    console.log(`[${SECURITY_MODE}] Path: ${path} | Ver: ${clientVersion} | UUID: ${clientUuid}`);

    // Skip security checks for Config Route (so clients can fetch the latest version)
    if (isConfigRoute) {
        return next();
    }

    // --- STRICT MODE ENFORCEMENT ---
    if (SECURITY_MODE === "STRICT") {
        
        // A. HANDLE OLD CLIENTS (Missing UUID)
        // Instead of blocking, we send the "Update Required" payload.
        if (clientUuid === "UNKNOWN") {
             return res.json({
               found: true,
               title: `Update to v${LATEST_VERSION}`,
               line1: "⚠️ Update Required",
               line2: `Please install v${LATEST_VERSION}`,
               image: "https://raw.githubusercontent.com/malvinarum/Plex-Rich-Presence/refs/heads/main/assets/icon.png", 
               url: UPDATE_URL
             });
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
        // Compare versions: if client < LATEST, send update payload
        if (clientVersion !== "UNKNOWN" && 
            clientVersion.localeCompare(LATEST_VERSION, undefined, { numeric: true, sensitivity: 'base' }) < 0) {
            
             return res.json({
               found: true,
               title: `Update to v${LATEST_VERSION}`,
               line1: "⚠️ Update Required",
               line2: `Please install v${LATEST_VERSION}`,
               image: "https://raw.githubusercontent.com/malvinarum/Plex-Rich-Presence/refs/heads/main/assets/icon.png", 
               url: UPDATE_URL
             });
        }
    }

    next();
});

// --- 🎧 ROUTE: MUSIC (iTunes) ---
app.get('/api/metadata/music', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "No query provided" });

    try {
        const response = await axios.get('https://itunes.apple.com/search', {
            params: { term: query, entity: 'song', limit: 1 }
        });

        const track = response.data.results[0];

        if (track) {
            return res.json({
                found: true,
                title: track.trackName,
                artist: track.artistName,
                album: track.collectionName,
                image: track.artworkUrl100?.replace('100x100bb', '600x600bb'), 
                url: track.trackViewUrl   
            });
        }
        return res.json({ found: false });
    } catch (error) {
        return res.status(500).json({ error: "Search failed" });
    }
});

// --- 🎬 ROUTE: MOVIES (TMDB) ---
app.get('/api/metadata/movie', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ found: false });

    try {
        const response = await axios.get(`https://api.themoviedb.org/3/search/movie`, {
            params: {
                api_key: process.env.TMDB_API_KEY,
                query: query,
                include_adult: false
            }
        });
        
        const result = response.data.results[0];
        if (result && result.poster_path) {
            return res.json({
                found: true,
                title: result.title,
                image: `https://image.tmdb.org/t/p/w500${result.poster_path}`,
                url: `https://www.themoviedb.org/movie/${result.id}`
            });
        }
        return res.json({ found: false });
    } catch (error) {
        return res.json({ found: false });
    }
});

// --- 📺 ROUTE: TV SHOWS (TMDB) ---
app.get('/api/metadata/tv', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ found: false });

    try {
        const response = await axios.get(`https://api.themoviedb.org/3/search/tv`, {
            params: {
                api_key: process.env.TMDB_API_KEY,
                query: query,
                include_adult: false
            }
        });

        const result = response.data.results[0];
        if (result && result.poster_path) {
            return res.json({
                found: true,
                title: result.name,
                image: `https://image.tmdb.org/t/p/w500${result.poster_path}`,
                url: `https://www.themoviedb.org/tv/${result.id}`
            });
        }
        return res.json({ found: false });
    } catch (error) {
        return res.json({ found: false });
    }
});

// --- 📚 ROUTE: BOOKS (Google Books) ---
app.get('/api/metadata/book', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ found: false });

    try {
        // Support both old and new env var names just in case
        const apiKey = process.env.GOOGLE_BOOKS_API_KEY || process.env.GOOGLE_BOOKS_KEY;
        const response = await axios.get(`https://www.googleapis.com/books/v1/volumes`, {
            params: {
                q: query,
                key: apiKey,
                maxResults: 1
            }
        });

        const result = response.data.items?.[0]?.volumeInfo;
        if (result && result.imageLinks?.thumbnail) {
            const img = result.imageLinks.thumbnail.replace('http://', 'https://');
            return res.json({
                found: true,
                title: result.title,
                image: img,
                url: result.infoLink
            });
        }
        return res.json({ found: false });
    } catch (error) {
        return res.json({ found: false });
    }
});

// --- ⚙️ ROUTE: CONFIG ---
app.get('/api/config/discord-id', (req, res) => {
    // Send Latest Version for System Tray update checks
    res.json({ 
        client_id: process.env.DISCORD_CLIENT_ID,
        latest_version: LATEST_VERSION
    });
});

// --- START ---
app.listen(PORT, () => {
    console.log(`🚀 PlexRPC Backend running on port ${PORT}`);
    console.log(`🛡️ Security Mode: ${SECURITY_MODE}`);
    console.log(`📲 Enforcing Version: v${LATEST_VERSION}+`);
});
