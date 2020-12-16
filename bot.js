const RssFeedEmitter = require('rss-feed-emitter');
const feeder = new RssFeedEmitter({ skipFirstLoad: true });
const discord = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const { google } = require('googleapis'); 
const { prefix } = require('./config.json');
const { discordToken, youTubeToken } = require('./secrets.json');

const youTubeRSS = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const discordClient = new discord.Client();
const youTubeClient = google.youtube('v3');
const database = new sqlite3.Database('./server-data.db', console.log);

discordClient.once('ready', () => startup());
discordClient.on('message', (message) => messageHandler(message));
discordClient.login(discordToken);
feeder.on('new-item', function(item) {
    retrieveSubscribingGuilds(item);
});
feeder.on('error', console.error);
 
const addChannel = (channelId) => {
    feeder.add({
        url: `${youTubeRSS}${channelId}`,
        refresh: 600,
    });
};

const defineBotRoom = (serverId, channel, silent) => {
    setGuildBotChannel(serverId, channel.id);
    if (!silent)
    {
        channel.send(`YouTube Feed will post to #${channel.name}`);
    }
};

const startup = async () => {
    database.run("CREATE TABLE GuildBotChannel (GuildId TEXT, BotChannelId TEXT)", [], (err) => {});
    database.run("CREATE TABLE GuildYouTubeChannel (GuildId TEXT, YouTubeChannelId TEXT)", [], (err) => {});
    refreshAllRSSFeeds();
    discordClient.user.setActivity(prefix + 'ytf-help'); 
    console.log('connected');
};

const messageHandler = (message) => {
    if(message.member.hasPermission('ADMINISTRATOR')) {
        if (message.content.toLowerCase().startsWith(prefix + 'youtubefeed')) {
            console.log('add discord channel');
            defineBotRoom(message.guild.id, message.channel, false);
        } else if (message.content.toLowerCase().startsWith(prefix + 'youtubeadd')) {
            console.log('add YT channel');
            serverSubscribe(message, false);
        } else if (message.content.toLowerCase().startsWith(prefix + 'ytf-help')) {
            sendHelp(message.channel);
        } else if (message.content.toLowerCase().startsWith(prefix + 'youtuberemove')) {
            removeSubscription(message);
        }
    }
};

const serverSubscribe = (message, silent) => {
    if (message.content.includes('http')) {
        try {
            if (message.content.includes('youtu.be')) {
                const videoId = message.content.split('youtu.be/')[1];
                subscribeFromVideoLink(videoId, message, silent);
            } else {
                const videoId = message.content.split('v=')[1].split('&')[0];
                subscribeFromVideoLink(videoId, message, silent);
            }
        } catch (err) {
            message.channel.send(`Please provide a full video link.`);
        } 
    } else if (message.content.split('youtubeadd')[1].trim().startsWith('UC')) {
        const channelId = message.content.split('youtubeadd')[1].trim();
        addChannel(channelId);
        addSubscription(message.guild.id, channelId);
    } else {
        message.channel.send('Please either provide a channel ID (not a channel name) or a video link.');
    }
};

const subscribeFromVideoLink = async (videoId, message, silent) => {
    try {
        const videoResult = await youTubeClient.videos.list({key: youTubeToken, part: 'snippet', id: videoId});
        const videoData = videoResult.data.items[0].snippet;
        addChannel(videoData.channelId);
        addSubscription(message.guild.id, videoData.channelId);
        if (videoData.channelTitle && videoData.channelTitle.length > 0 && !silent)
        {
            message.channel.send(`Subscribing to ${videoData.channelTitle}`);
        }
    } catch (err) {
        console.error(err);
    }
};

const textChannelFromChannelID = (channelId) => {
    return discordClient.channels.cache.get(channelId);
};

const setGuildBotChannel = (guildId, channelId) => {
    database.get('SELECT BotChannelId FROM GuildBotChannel WHERE GuildId = ?', [guildId], (err, row) => {
        if (err) {
            console.error(err);
        }
        
        if (!row) {
            createGuildBotChannel(guildId, channelId);
        } else {
            updateGuildBotChannel(guildId, channelId);
        }
    });
};

const createGuildBotChannel = (guildId, channelId) => {
    database.run('INSERT INTO GuildBotChannel (GuildId, BotChannelId) VALUES (?, ?)', [guildId, channelId], (err) => {
        if (err) {
            console.error(err);
        }
    });
};

const updateGuildBotChannel = (guildId, channelId) => {
    database.run('UPDATE GuildBotChannel SET BotChannelId = ? WHERE GuildId = ?', [channelId, guildId], (err) => {
        if (err) {
            console.error(err);
        }
    });
};

const postLinkInBotChannel = (guildId, link) => {
    database.get('SELECT BotChannelId FROM GuildBotChannel WHERE GuildId = ?', [guildId], (err, row) => {
        if (err) {
            console.error(err);
        }
        textChannelFromChannelID(row.BotChannelId).send(link);
    });
};

const retrieveSubscribingGuilds = (item) => {
    const youTubeChannelId = item['yt:channelid']['#'];
    database.each('SELECT GuildId FROM GuildYouTubeChannel WHERE YouTubeChannelId = ?', [youTubeChannelId], (err, row) => {
        if (err) {
            console.error(err);
        }
        postLinkInBotChannel(row.GuildId, item.link);
    });
};

const addSubscription = (guildId, youTubeChannelId) => {
    database.get('SELECT GuildId FROM GuildYouTubeChannel WHERE YouTubeChannelId = ?', [youTubeChannelId], (err, row) => {
        if (err) {
            console.error(err);
        }
        
        if (!row) {
            insertGuildYouTubeChannel(guildId, youTubeChannelId);
        } else {
            console.log('Duplicate subscription');
        }
    });
};

const insertGuildYouTubeChannel = (guildId, youTubeChannelId) => {
    database.run('INSERT INTO GuildYouTubeChannel (GuildId, YouTubeChannelId) VALUES (?, ?)', [guildId, youTubeChannelId], (err) => {
        if (err) {
            console.error(err);
        }
    });
};

const refreshAllRSSFeeds = () => {
    database.each('SELECT DISTINCT YouTubeChannelId FROM GuildYouTubeChannel', [], (err, row) => {
        if (err) {
            console.error(err);
        }
        addChannel(row.YouTubeChannelId);
    });
};

const removeSubscription = (message) => {
    const channelId = message.content.split('youtuberemove')[1].trim();
    deleteGuildYouTubeChannel(message.guild.id, channelId);
};

const deleteGuildYouTubeChannel = (guildId, youTubeChannelId) => {
    database.run('DELETE FROM GuildYouTubeChannel WHERE GuildId = ? AND YouTubeChannelId = ?', [guildId, youTubeChannelId], (err) => {
        if (err) {
            console.error(err);
        }
    });
};

const sendHelp = (channel) => {
    channel.send(
        'Help Menu:\n' +
        `${prefix}youtubefeed - Sets the current channel as the destination for new YouTube videos in the feed.\n` +
        `${prefix}youtubeadd <video link> - Adds the channel that published the video to the feed.\n` +
        `${prefix}youtubeadd <channel ID> - Adds the specified channel (eg. UCK8sQmJBp8GCxrOtXWBpyEA) to the feed.\n` +
        `${prefix}youtuberemove <channel ID> - Removes the specified channel (eg. UCK8sQmJBp8GCxrOtXWBpyEA) from the feed.`
    );
};