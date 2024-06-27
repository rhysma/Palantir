require("dotenv").config();
const fs = require('fs');
const Discord = require('discord.js');
const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const mongoose = require('mongoose');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildVoiceStates
	],
});

const token = process.env['token'];
const clientId = process.env['clientId'];

// Create command collection and array from commands folder
let commands = [];
client.commands = new Discord.Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for(const file of commandFiles){
    const command = require(`./commands/${file}`);
	if (!command?.data) continue;
	client.commands.set(command.data.name, command);
	commands.push(command.data.toJSON());
}

// Create event collection from events folder
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for(const file of eventFiles){
    const event = require(`./events/${file}`);
    client.on(event.name, (...args) => event.execute(...args, client));
}	

const rest = new REST({ version: '10' }).setToken(token);
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	}
	catch (error) {
		console.error(error);
	}
})();

// Connect to MongoDB for server and user database
mongoose.set('strictQuery', false);
(async () => {
	await mongoose.connect(process.env['mongoURL'], {
		socketTimeoutMS: 100000,
		keepAlive: true,
	})
	.catch(err => console.error(err));
	console.log("Connected to database!");

	client.once('ready', () => console.log(`\nPalantir is now online! ${new Date().toLocaleString()}\n`));
	client.login(token);
})();


