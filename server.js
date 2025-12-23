const express = require('express');
const axios = require('axios');
// const querystring = require('querystring'); // Removed to fix deprecation warning
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// --- 🎵 SPOTIFY TOKEN MANAGER (The "Pro" Logic) ---
let spotifyToken = null;
let tokenExpiresAt = 0;

async function getSpotifyToken() {
    // Return cached token if still valid (with 5min buffer)
    if (spotifyToken && Date.now() < tokenExpiresAt - 300000) {
        return spotifyToken;
    }

    try {
        const auth = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
        
        // Modern approach using URLSearchParams (No deprecation warning)
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');

        const response = await axios.post('https://accounts.spotify.com/api/token', 
            params, {
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        spotifyToken = response.data.access_token;
        // Set expiration (usually 1 hour, convert to ms)
        tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
        console.log("🔑 New Spotify Token Acquired");
        return spotifyToken;
    } catch (error) {
        console.error("Spotify Auth Failed:", error.response?.data || error.message);
        return null;
    }
}

// --- 🎧 ROUTE: MUSIC (Spotify) ---
app.get('/api/metadata/music', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "No query provided" });

    try {
        const token = await getSpotifyToken();
        if (!token) return res.status(500).json({ error: "Service unavailable" });

        // Search for the track (limit 1 for best match)
        const response = await axios.get('https://api.spotify.com/v1/search', {
            params: { q: query, type: 'track', limit: 1 },
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const track = response.data.tracks.items[0];

        if (track) {
            // Send back high-res album art (640x640)
            return res.json({
                found: true,
                title: track.name,
                artist: track.artists[0].name,
                album: track.album.name,
                image: track.album.images[0]?.url, 
                url: track.external_urls.spotify   
            });
        } else {
            return res.json({ found: false });
        }
    } catch (error) {
        console.error("Spotify Search Error:", error.response?.data || error.message);
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
        console.error("TMDB Error:", error.message);
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
        console.error("TMDB TV Error:", error.message);
        return res.json({ found: false });
    }
});

// --- 📚 ROUTE: BOOKS (Google Books) ---
app.get('/api/metadata/book', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ found: false });

    try {
        const response = await axios.get(`https://www.googleapis.com/books/v1/volumes`, {
            params: {
                q: query,
                key: process.env.GOOGLE_BOOKS_KEY,
                maxResults: 1
            }
        });

        const result = response.data.items?.[0]?.volumeInfo;
        if (result && result.imageLinks?.thumbnail) {
            // Fix http/https mixed content issues by forcing https
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
        console.error("Google Books Error:", error.message);
        return res.json({ found: false });
    }
});

// --- ⚙️ ROUTE: CONFIG ---
app.get('/api/config/discord-id', (req, res) => {
    res.json({ client_id: process.env.DISCORD_CLIENT_ID });
});

// --- START ---
app.listen(PORT, () => {
    console.log(`🚀 PlexRPC Backend running on port ${PORT}`);
    console.log(`🎵 Music Support: Enabled (Spotify)`);
});
