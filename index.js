import express from 'express';
import axios from 'axios';
import { Scraper } from '@the-convocation/twitter-scraper';

const DISCORD_WEBHOOK =
  'https://discord.com/api/webhooks/1512608075272552498/KkoD7KBWU5dZtstFsdPYocDBG0SJAQP_vhKZhz1HxaBkERl8Mmg1sRILbfRhgl3Q8OHZ';

const WATCHED_USERS = ['ShiinaBR', 'HYPEX'];
const POLL_INTERVAL_MS = 15 * 1000;

const seenIds = new Set();
const scraper = new Scraper();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.send('X leak bot is running. Watching: ' + WATCHED_USERS.join(', '));
});

app.listen(PORT, () => {
  console.log(`Health check server on port ${PORT}`);
});

async function sendDiscordWebhook(username, tweetText, tweetId, photoUrls, videoUrl) {
  const tweetUrl = `https://x.com/${username}/status/${tweetId}`;

  const embed = {
    color: 0x1da1f2,
    author: {
      name: `@${username}`,
      url: `https://x.com/${username}`,
      icon_url: `https://unavatar.io/twitter/${username}`,
    },
    description: tweetText || '*(no text)*',
    url: tweetUrl,
    timestamp: new Date().toISOString(),
    footer: { text: 'X (Twitter)' },
  };

  if (photoUrls.length > 0) {
    embed.image = { url: photoUrls[0] };
    if (photoUrls.length > 1) {
      embed.description += `\n\n🖼️ *${photoUrls.length} images — [view all on X](${tweetUrl})*`;
    }
  }

  if (videoUrl) {
    embed.description += `\n\n📹 *Video attached — [watch on X](${tweetUrl})*`;
    if (photoUrls.length === 0) {
      embed.image = { url: videoUrl };
    }
  }

  const payload = {
    content: `**@${username}** just posted a new leak! 🚨`,
    embeds: [embed],
  };

  try {
    await axios.post(DISCORD_WEBHOOK, payload);
    console.log(`Sent to Discord: @${username} tweet ${tweetId}`);
  } catch (err) {
    console.error('Discord webhook error:', err.response?.data || err.message);
  }
}

async function fetchRecentTweets(username, limit = 10) {
  const tweets = [];
  try {
    for await (const tweet of scraper.getTweets(username, limit)) {
      tweets.push(tweet);
    }
  } catch (err) {
    console.error(`Failed to fetch tweets for @${username}:`, err.message);
  }
  return tweets;
}

async function pollUser(username, seedOnly = false) {
  const tweets = await fetchRecentTweets(username, 10);

  for (const tweet of tweets) {
    if (!tweet.id) continue;

    if (seedOnly) {
      seenIds.add(tweet.id);
      continue;
    }

    if (seenIds.has(tweet.id)) continue;
    if (tweet.isReply) continue;
    if (tweet.isRetweet) continue;

    seenIds.add(tweet.id);

    const text = tweet.text || '';
    const photoUrls = (tweet.photos || []).map((p) => p.url).filter(Boolean);
    const videoPreviewUrl = tweet.videos?.[0]?.preview ?? null;

    console.log(`New tweet from @${username}: ${tweet.id}`);
    await sendDiscordWebhook(username, text, tweet.id, photoUrls, videoPreviewUrl);
  }
}

async function poll() {
  const start = Date.now();
  console.log(`Polling at ${new Date().toISOString()}`);
  await Promise.all(WATCHED_USERS.map((u) => pollUser(u)));
  console.log(`Poll done in ${Date.now() - start}ms`);
}

async function main() {
  console.log('Seeding existing tweet IDs...');
  await Promise.all(WATCHED_USERS.map((u) => pollUser(u, true)));
  console.log(`Seeded ${seenIds.size} IDs. Starting polling every ${POLL_INTERVAL_MS / 1000}s...`);

  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
