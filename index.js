require('dotenv').config();

const { 
    Client, 
    GatewayIntentBits 
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus
} = require('@discordjs/voice');

const play = require('play-dl');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.once('ready', () => {
    console.log(`Bot aktif: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.split(" ");
    const command = args.shift()?.toLowerCase();

    // TEST
    if (command === "!ping") {
        message.reply("pong");
    }

    // PLAY KOMUTU
    if (command === "!play") {
        const url = args[0];
        if (!url) return message.reply("Link gir!");

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply("Ses kanalına gir!");

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });

        const stream = await play.stream(url);

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });

        const player = createAudioPlayer();

        player.play(resource);
        connection.subscribe(player);

        message.reply("Çalıyor 🎵");
    }
});

client.login(process.env.DISCORD_TOKEN);
