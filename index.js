require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus,
} = require('@discordjs/voice');

const play = require('play-dl');

const BOT_NAME = "hyPexBOT";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('ready', () => {
  console.log(`${BOT_NAME} aktif!`);
});

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const parts = message.content.trim().split(/\s+/);
    const cmd = parts.shift().toLowerCase();

    // TEST
    if (cmd === '!ping') {
      return message.reply('pong');
    }

    // PLAY
    if (cmd === '!play') {
      const query = parts.join(' ');
      if (!query) return message.reply(`${BOT_NAME}: link/arama yaz. Örn: !play <link>`);

      const voiceChannel = message.member?.voice?.channel;
      if (!voiceChannel) return message.reply(`${BOT_NAME}: önce bir ses kanalına gir.`);

      await message.reply(`${BOT_NAME}: hazırlanıyor...`);

      // Bağlan
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
      });

      // Bağlantı READY bekle
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

      // Stream al (play-dl)
      const stream = await play.stream(query);

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });

      const player = createAudioPlayer();

      player.on(AudioPlayerStatus.Playing, () => {
        console.log(`${BOT_NAME}: playing started`);
      });

      player.on('error', (err) => {
        console.log(`${BOT_NAME} player error:`, err?.message || err);
        message.channel.send(`${BOT_NAME}: oynatma hatası oluştu.`);
      });

      connection.subscribe(player);
      player.play(resource);

      return message.channel.send(`${BOT_NAME}: çalıyor 🎵`);
    }
  } catch (err) {
    console.log(`${BOT_NAME} hata:`, err?.message || err);
    try {
      await message.channel.send(`${BOT_NAME}: bir hata oldu, tekrar dene.`);
    } catch {}
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.log(`${BOT_NAME}: DISCORD_TOKEN bulunamadı!`);
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
