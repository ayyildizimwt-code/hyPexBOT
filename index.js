require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const BOT_NAME = "hyPexBOT";

client.once("ready", () => {
  console.log(`${BOT_NAME} aktif!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    message.reply("pong");
  }
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("DISCORD_TOKEN bulunamadı! .env dosyasını kontrol et.");
  process.exit(1);
}

client.login(token);