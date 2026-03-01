/**
 * hyPexBOT - Discord Music Bot (discord.js v14 + @discordjs/voice + play-dl)
 * Commands:
 *  !ping
 *  !join
 *  !leave
 *  !play <youtube url | search text>
 *  !pause
 *  !resume
 *  !skip
 *  !stop
 *  !queue
 *  !now
 *
 * ENV:
 *  DISCORD_TOKEN=xxxxx
 *
 * Not:
 * - Railway’de .env dosyası push’lanmaz. Railway Variables kısmına DISCORD_TOKEN ekle.
 * - Bu dosya hem local (dotenv) hem Railway (process.env) ile çalışır.
 */

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} = require("@discordjs/voice");

const play = require("play-dl");

const PREFIX = "!";
const BOT_NAME = "hyPexBOT";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

// Her sunucu için müzik state’i
const guildStates = new Map();
/**
 * state = {
 *   connection,
 *   player,
 *   queue: [{ title, url }],
 *   now: { title, url } | null,
 *   textChannelId,
 * }
 */

function cleanQuery(raw) {
  if (!raw) return "";
  let q = String(raw).trim();

  // Discord bazen linki <...> içine koyar: <https://...>
  q = q.replace(/^<\s*/, "").replace(/\s*>$/, "");

  // tırnak vs. gereksiz karakterleri de kırp
  q = q.replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, "").trim();

  return q;
}

async function resolveTrack(query) {
  const q = cleanQuery(query);
  if (!q) return null;

  // URL mi?
  const isUrl = /^https?:\/\/\S+/i.test(q);

  try {
    if (isUrl) {
      // YouTube linki değilse de denemeye çalışır, olmazsa null döner
      const info = await play.video_basic_info(q);
      const title = info?.video_details?.title || "Bilinmeyen";
      const url = info?.video_details?.url || q;
      return { title, url };
    }

    // Arama
    const results = await play.search(q, { limit: 1 });
    if (!results || results.length === 0) return null;

    return { title: results[0].title, url: results[0].url };
  } catch (err) {
    // URL parse hatası vs.
    return { error: err?.message || String(err) };
  }
}

function getState(guildId) {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      connection: null,
      player: null,
      queue: [],
      now: null,
      textChannelId: null,
    });
  }
  return guildStates.get(guildId);
}

async function ensureVoice(message) {
  const guild = message.guild;
  const member = message.member;

  if (!guild || !member) return { ok: false, msg: "Sunucu/üye bilgisi alınamadı." };

  const voiceChannel = member.voice?.channel;
  if (!voiceChannel) {
    return { ok: false, msg: "Önce bir ses kanalına girmen lazım." };
  }

  const state = getState(guild.id);
  state.textChannelId = message.channel.id;

  // Zaten bağlıysa aynı kanalda mı?
  const existing = getVoiceConnection(guild.id);
  if (existing) {
    state.connection = existing;
    return { ok: true, channel: voiceChannel, state };
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });

  state.connection = connection;

  // bağlantı hazır olana kadar bekle
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (e) {
    try { connection.destroy(); } catch {}
    state.connection = null;
    return { ok: false, msg: "Ses kanalına bağlanamadım (timeout). Yetkileri kontrol et: Connect/Speak." };
  }

  // player yoksa oluştur
  if (!state.player) {
    state.player = createAudioPlayer();

    state.player.on(AudioPlayerStatus.Idle, async () => {
      // parça bitti -> sıradakine geç
      await playNext(guild.id);
    });

    state.player.on("error", async (err) => {
      const ch = client.channels.cache.get(state.textChannelId);
      if (ch) ch.send(`hyPexBOT: bir hata oldu, tekrar dene.\n\`${err?.message || err}\``).catch(() => {});
      await playNext(guild.id); // hata olunca sıradakine geçmeyi dene
    });
  }

  // connection’a subscribe et
  try {
    state.connection.subscribe(state.player);
  } catch {}

  return { ok: true, channel: voiceChannel, state };
}

async function playTrack(guildId, track) {
  const state = getState(guildId);
  if (!state.connection || !state.player) throw new Error("Bağlantı/Player yok.");

  // stream al
  const stream = await play.stream(track.url);
  const resource = createAudioResource(stream.stream, { inputType: stream.type });

  state.now = track;
  state.player.play(resource);
}

async function playNext(guildId) {
  const state = getState(guildId);
  if (!state) return;

  const next = state.queue.shift();
  if (!next) {
    state.now = null;
    return;
  }

  try {
    await playTrack(guildId, next);
    const ch = client.channels.cache.get(state.textChannelId);
    if (ch) ch.send(`🎶 Şimdi çalıyor: **${next.title}**\n${next.url}`).catch(() => {});
  } catch (err) {
    const ch = client.channels.cache.get(state.textChannelId);
    if (ch) ch.send(`hyPexBOT: çalma hatası: \`${err?.message || err}\``).catch(() => {});
    // hata olursa sıradakini dene
    return playNext(guildId);
  }
}

client.once("ready", () => {
  console.log(`${BOT_NAME} aktif!`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const parts = message.content.trim().split(/\s+/);
    const cmd = parts.shift().toLowerCase();
    const argText = parts.join(" ");

    // !ping
    if (cmd === "!ping") {
      return message.reply("pong");
    }

    // !join
    if (cmd === "!join") {
      const res = await ensureVoice(message);
      if (!res.ok) return message.reply(res.msg);
      return message.reply("✅ Ses kanalına bağlandım.");
    }

    // !leave
    if (cmd === "!leave") {
      const guild = message.guild;
      if (!guild) return;

      const conn = getVoiceConnection(guild.id);
      if (conn) {
        try { conn.destroy(); } catch {}
      }
      guildStates.delete(guild.id);
      return message.reply("👋 Çıktım.");
    }

    // !play
    if (cmd === "!play") {
      const query = cleanQuery(argText);

      if (!query) {
        return message.reply("Kullanım: `!play <youtube linki | arama>`");
      }

      const res = await ensureVoice(message);
      if (!res.ok) return message.reply(res.msg);

      // “hazırlanıyor…”
      const loadingMsg = await message.reply("hyPexBOT: hazırlanıyor...");

      const track = await resolveTrack(query);
      if (!track) {
        return loadingMsg.edit("hyPexBOT: sonuç bulamadım.");
      }
      if (track.error) {
        // Burada senin gördüğün “Invalid URL” geliyordu
        return loadingMsg.edit(`hyPexBOT: link/arama hatası: \`${track.error}\``);
      }

      const state = res.state;

      // Eğer şu an çalmıyorsa direkt başlat, çalıyorsa kuyruğa ekle
      const isPlaying =
        state.player &&
        (state.player.state.status === AudioPlayerStatus.Playing ||
          state.player.state.status === AudioPlayerStatus.Buffering);

      if (!isPlaying && !state.now) {
        // direkt çal
        try {
          await playTrack(message.guild.id, track);
          return loadingMsg.edit(`🎶 Şimdi çalıyor: **${track.title}**\n${track.url}`);
        } catch (err) {
          return loadingMsg.edit(`hyPexBOT: bir hata oldu, tekrar dene.\n\`${err?.message || err}\``);
        }
      } else {
        state.queue.push(track);
        return loadingMsg.edit(`✅ Kuyruğa eklendi (#${state.queue.length}): **${track.title}**`);
      }
    }

    // !pause
    if (cmd === "!pause") {
      const state = getState(message.guild.id);
      if (!state.player) return message.reply("Şu an player yok.");
      state.player.pause();
      return message.reply("⏸️ Duraklatıldı.");
    }

    // !resume
    if (cmd === "!resume") {
      const state = getState(message.guild.id);
      if (!state.player) return message.reply("Şu an player yok.");
      state.player.unpause();
      return message.reply("▶️ Devam ediyor.");
    }

    // !skip
    if (cmd === "!skip") {
      const state = getState(message.guild.id);
      if (!state.player) return message.reply("Şu an player yok.");
      // Idle’a düşürüp sıradakine geçmesini sağla
      state.player.stop(true);
      return message.reply("⏭️ Geçildi.");
    }

    // !stop
    if (cmd === "!stop") {
      const state = getState(message.guild.id);
      if (!state.player) return message.reply("Şu an player yok.");
      state.queue = [];
      state.now = null;
      state.player.stop(true);
      return message.reply("🛑 Durdurdum ve kuyruğu temizledim.");
    }

    // !queue
    if (cmd === "!queue") {
      const state = getState(message.guild.id);
      if (!state.now && state.queue.length === 0) return message.reply("Kuyruk boş.");

      let text = "";
      if (state.now) text += `🎶 Şimdi: **${state.now.title}**\n`;
      if (state.queue.length > 0) {
        text += "\n📜 Kuyruk:\n";
        state.queue.slice(0, 10).forEach((t, i) => {
          text += `${i + 1}) ${t.title}\n`;
        });
        if (state.queue.length > 10) text += `... (+${state.queue.length - 10})\n`;
      }
      return message.reply(text);
    }

    // !now
    if (cmd === "!now") {
      const state = getState(message.guild.id);
      if (!state.now) return message.reply("Şu an bir şey çalmıyor.");
      return message.reply(`🎶 Şimdi: **${state.now.title}**\n${state.now.url}`);
    }

    // bilinmeyen komut
    return message.reply("Komut yok. Örnek: `!play <link|arama>`");
  } catch (err) {
    console.error(err);
    try {
      if (message?.channel) {
        message.channel.send(`hyPexBOT: beklenmeyen hata: \`${err?.message || err}\``);
      }
    } catch {}
  }
});

// Çökmesin diye
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN bulunamadı! Railway Variables veya .env kontrol et.");
  process.exit(1);
}

client.login(token);
