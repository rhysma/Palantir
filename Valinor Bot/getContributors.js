const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');  // Import dotenv

require('dotenv').config();
let buffer = fs.readFileSync(".env.token");
let config = dotenv.parse(buffer);
let accessToken = config.ACCESS_TOKEN;

async function refreshAccessToken() {
    
    // oauth token credidentials
    const token = process.env['valinor_token'];
    const clientId = process.env['valinor_clientID'];
    const username = process.env['reddit_username'];
    const password = process.env['reddit_password'];

    // request setup
    const data = {grant_type: 'password', username: username, password: password};
    const authString = Buffer.from(`${clientId}:${token}`).toString('base64');

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

// Function to delay execution to respect rate limits
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  

module.exports = async (after = null) => {
    url = "https://oauth.reddit.com/r/LuxeLife/about/contributors?limit=100" + (after ? `&after=${after}` : "")
    try{
        // get contributors and return the data
        const body = await axios.get(url, {
            headers: {
                'User-Agent': 'Valinor/1.0 by HighFlyingSquirrel',
                'Authorization': `Bearer ${accessToken}`,
            }
        })
        return body.data.data
    } catch(err) {
        // check if access issue if so refresh token and try again
        if (err.response.status === 403 || err.response.status === 401) {
            // Access token expired, refresh it
            accessToken = await refreshAccessToken();    
            
            // Wait 2 seconds
            await delay(2000);

            // Retry the original request with the new token
            try {
                const body = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Valinor/1.0 by HighFlyingSquirrel',
                        'Authorization': `Bearer ${accessToken}`,
                    }
                })
                return body.data.data;
            } catch (err2) {
                const errorMessage = err2.response?.data || err2.message;
                console.error(`Error getting contibutors: ${errorMessage}`);
                throw new Error(message="Error getting contibutors!");
            } 
        } else {
            const errorMessage = err.response?.data || err.message;
            console.error(`Error getting contibutors: ${errorMessage}`);
            throw new Error(message="Error getting contibutors!");
        }
    }
}