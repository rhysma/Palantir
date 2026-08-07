const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');

require('dotenv').config();

const TOKEN_FILE = '.env.token';

// Load a cached access token if one exists. Don't crash startup if it doesn't -
// refreshAccessToken() will populate it on first use.
let accessToken = null;
if (fs.existsSync(TOKEN_FILE)) {
    try {
        const buffer = fs.readFileSync(TOKEN_FILE);
        const config = dotenv.parse(buffer);
        accessToken = config.ACCESS_TOKEN || null;
    } catch (err) {
        console.error(`Could not read ${TOKEN_FILE}, will fetch a fresh token:`, err.message);
    }
} else {
    console.log(`${TOKEN_FILE} not found, will fetch a fresh token on first request.`);
}

async function refreshAccessToken() {
    // oauth credentials
    const clientSecret = process.env['valinor_token'];
    const clientId = process.env['valinor_clientID'];
    const username = process.env['reddit_username'];
    const password = process.env['reddit_password'];

    const missing = ['valinor_token', 'valinor_clientID', 'reddit_username', 'reddit_password']
        .filter(key => !process.env[key]);
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    const data = { grant_type: 'password', username, password };
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
        const response = await axios.post('https://www.reddit.com/api/v1/access_token', data, {
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Valinor/1.0 by HighFlyingSquirrel',
            },
        });

        if (!response.data || !response.data.access_token) {
            // Reddit can return 200 with an error body (e.g. bad credentials, 2FA required)
            throw new Error(`Reddit did not return an access token: ${JSON.stringify(response.data)}`);
        }

        accessToken = response.data.access_token;
        console.log('New access token acquired at', new Date().toISOString());

        try {
            fs.writeFileSync(TOKEN_FILE, `ACCESS_TOKEN=${accessToken}\n`, { flag: 'w' });
        } catch (writeErr) {
            // Non-fatal - we still have the token in memory for this run.
            console.error(`Warning: could not persist ${TOKEN_FILE}:`, writeErr.message);
        }

        return accessToken;
    } catch (error) {
        const detail = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error('Error refreshing access token:', detail);
        throw new Error(`Failed to refresh access token: ${detail}`);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestContributors(after, token) {
    const url = 'https://oauth.reddit.com/r/LuxeLife/about/contributors?limit=100'
        + (after ? `&after=${after}` : '');

    const response = await axios.get(url, {
        headers: {
            'User-Agent': 'Valinor/1.0 by HighFlyingSquirrel',
            'Authorization': `Bearer ${token}`,
        },
    });
    return response.data.data;
}

module.exports = async (after = null) => {
    // If we've never gotten a token at all, get one before trying.
    if (!accessToken) {
        accessToken = await refreshAccessToken();
        await delay(1000);
    }

    try {
        return await requestContributors(after, accessToken);
    } catch (err) {
        const status = err.response ? err.response.status : null;

        if (status === 403 || status === 401) {
            console.log(`Got ${status} fetching contributors, refreshing access token...`);
            accessToken = await refreshAccessToken();
            await delay(2000);

            try {
                return await requestContributors(after, accessToken);
            } catch (err2) {
                const errorMessage = err2.response ? JSON.stringify(err2.response.data) : err2.message;
                console.error(`Error getting contributors after token refresh: ${errorMessage}`);
                throw new Error(`Error getting contributors after token refresh: ${errorMessage}`);
            }
        } else {
            // Covers network errors (no err.response), 429 rate limiting, 5xx, etc.
            const errorMessage = err.response ? JSON.stringify(err.response.data) : err.message;
            console.error(`Error getting contributors (status: ${status}): ${errorMessage}`);
            throw new Error(`Error getting contributors (status: ${status}): ${errorMessage}`);
        }
    }
};