const RssFeedEmitter = require('rss-feed-emitter');
const feeder = new RssFeedEmitter({ skipFirstLoad: true });
const discord = require('discord.js');
const { google } = require('googleapis'); 
const { prefix } = require('./config.json');
const { discordToken, youTubeToken } = require('./secrets.json');

const youTubeRSS = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const discordClient = new discord.Client();
const youTubeClient = google.youtube('v3');
const serverChannel = {};
const serverSubscription = {};

discordClient.once('ready', () => startup());
discordClient.on('message', (message) => messageHandler(message));
discordClient.login(discordToken);
feeder.on('new-item', function(item) {
    alertTheMasses(item);
});
feeder.on('error', console.error);
 
const addChannel = (channelId) => {
    feeder.add({
        url: `${youTubeRSS}${channelId}`,
        refresh: 600,
    });
};

const alertTheMasses = (item) => {
    for (const server in serverSubscription)
    {
        if(serverSubscription[server].includes(item['yt:channelid']['#']))
        {
            serverChannel[server].send(item.link);
        }
    }
};

const defineBotRoom = (serverId, channel, silent) => {
    serverChannel[serverId] = channel;
    if (!silent)
    {
        channel.send(`YouTube Feed will post to #${channel.name}`);
    }
};

const startup = () => {
    console.log("loaded");
    // Load the things from DB
};

const messageHandler = (message) => {
    if (message.content.toLowerCase().startsWith(prefix + 'youtubefeed')) {
        console.log("add discord channel");
        defineBotRoom(message.guild.id, message.channel, false);
        serverSubscription[message.guild.id] = [];
	} else if (message.content.toLowerCase().startsWith(prefix + 'youtubeadd')) {
        console.log("add YT channel");
        serverSubscribe(message, false);
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
        serverSubscription[message.guild.id].push(channelId);
        addChannel(channelId);
    } else {
        message.channel.send("Please either provide a channel ID (not a channel name) or a video link.");
    }
};

const subscribeFromVideoLink = async (videoId, message, silent) => {
    try {
        const videoResult = await youTubeClient.videos.list({key: youTubeToken, part: 'snippet', id: videoId});
        const videoData = videoResult.data.items[0].snippet;
        addChannel(videoData.channelId);
        serverSubscription[message.guild.id].push(videoData.channelId);
        if (videoData.channelTitle && videoData.channelTitle.length > 0 && !silent)
        {
            message.channel.send(`Subscribing to ${videoData.channelTitle}`);
        }
    } catch (err) {
        console.error(err);
    }
};