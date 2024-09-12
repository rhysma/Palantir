const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');  // Import dotenv
const request = require('request-promise');


require('dotenv').config();
let buffer = fs.readFileSync(".env.token");
let config = dotenv.parse(buffer);
let accessToken = config.ACCESS_TOKEN;

async function refreshAccessToken() {
    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const data = 'grant_type=client_credentials';

    try {
        const response = await axios.post('https://www.reddit.com/api/v1/access_token', data, {
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        accessToken = response.data.access_token;
        console.log('New Access Token:', accessToken);

        // Update .env file
        fs.writeFileSync('.env.token', `ACCESS_TOKEN=${accessToken}\n`, { flag: 'w' });
        console.log('Token updated successfully!');
        return accessToken;
    } catch (error) {
        console.error('Error refreshing access token:', error.response ? error.response.data : error.message);
        throw new Error('Failed to refresh access token');
    }
}

module.exports = async (username, interaction) => {
    try {
        const body = await request({
            url: `https://oauth.reddit.com/user/${username}/about.json`,
            headers: {
                'User-Agent': 'PALANTIR-DISCORD-BOT',
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        return JSON.parse(body).data;
    } catch (err) {
        if (err.statusCode === 403 || err.statusCode === 401) {
            // Access token expired, refresh it
            accessToken = await refreshAccessToken();
            console.log('New Access Token:', accessToken);
    
            // Retry the original request with the new token
            try {
                const body = await request({
                    url: `https://oauth.reddit.com/user/${username}/about.json`,
                    headers: {
                        'User-Agent': 'PALANTIR-DISCORD-BOT',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                });
                return JSON.parse(body).data;
            } catch (err2) {
                const errorMessage = err.response?.data || err.message;
                console.error(`Error checking Reddit profile: ${errorMessage}`);
                throw new Error(message=interaction.editReply({content: "Error checking reddit profile! Please open a ticket", ephemeral: true}));
            } 
        } else if (err.statusCode === 404) {;
            throw new Error(message=interaction.editReply({content: "This Reddit profile doesn't exist!", ephemeral: true}));
        } else {
            const errorMessage = err.response?.data || err.message;
            console.error(`Error checking Reddit profile: ${errorMessage}`);
            throw new Error(message=interaction.editReply({content: "Error checking reddit profile! Please open a ticket", ephemeral: true}));
        }
    }
}