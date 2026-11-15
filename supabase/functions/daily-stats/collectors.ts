/**
 * Fetchers for each data source. Pure functions: given an account, return
 * stat rows. No database access here, so they can be tested on their own.
 *
 * Every stat row carries its source and the date it describes (PRD 5f).
 */

export type Account = {
  id: string;
  talent_id: string;
  platform_id: string;
  external_id: string | null;
  url: string;
};

export type StatRow = {
  talent_account_id: string;
  metric: string;
  value: number;
  snapshot_date: string; // YYYY-MM-DD
  source: string;
  source_url: string | null;
};

export type LiveSample = {
  talent_account_id: string;
  viewers: number;
  title: string | null;
  category: string | null;
  source: string;
};

// Wikimedia asks for a descriptive agent with a contact point.
const UA = 'DayOnes/0.1 (https://github.com/fsamnani/dayones; fantasy league daily stats job)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET JSON, retrying on 429 and 5xx with backoff (honours Retry-After). */
async function getJson<T>(url: string, init?: RequestInit, attempts = 5): Promise<T> {
  let lastError = '';
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json', ...(init?.headers ?? {}) } });
    if (res.ok) return (await res.json()) as T;
    const body = await res.text().catch(() => '');
    lastError = `HTTP ${res.status} from ${url.split('?')[0]}: ${body.slice(0, 120)}`;
    if (res.status !== 429 && res.status < 500) throw new Error(lastError);
    const retryAfter = Number(res.headers.get('retry-after'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** i);
  }
  throw new Error(lastError + ` (after ${attempts} attempts)`);
}

/** Date as YYYY-MM-DD in a time zone. Weeks and days run on Pacific time. */
export function dateIn(tz: string, d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export const PACIFIC = 'America/Los_Angeles';

export function daysAgoUtc(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Run tasks with limited parallelism. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// YouTube Data API v3
// ---------------------------------------------------------------------------
type YtChannelList = { items?: { id: string; statistics: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean } }[] };
type YtPlaylistItems = { items?: { contentDetails: { videoId: string; videoPublishedAt: string } }[] };
type YtVideoList = { items?: { id: string; statistics: { viewCount?: string } }[] };

const YT = 'https://www.googleapis.com/youtube/v3';
const YT_SOURCE = 'youtube_data_api_v3';

/** Channel totals for many channels at once (50 per request). */
export async function youtubeChannelStats(accounts: Account[], apiKey: string, snapshotDate: string): Promise<{ rows: StatRow[]; missing: Account[] }> {
  const rows: StatRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < accounts.length; i += 50) {
    const batch = accounts.slice(i, i + 50);
    const ids = batch.map((a) => a.external_id).join(',');
    const data = await getJson<YtChannelList>(`${YT}/channels?part=statistics&id=${ids}&key=${apiKey}`);
    for (const item of data.items ?? []) {
      const acc = batch.find((a) => a.external_id === item.id);
      if (!acc) continue;
      seen.add(acc.id);
      const s = item.statistics;
      if (s.subscriberCount !== undefined && !s.hiddenSubscriberCount) rows.push(stat(acc, 'subscribers', s.subscriberCount, snapshotDate, YT_SOURCE));
      if (s.viewCount !== undefined) rows.push(stat(acc, 'total_views', s.viewCount, snapshotDate, YT_SOURCE));
      if (s.videoCount !== undefined) rows.push(stat(acc, 'video_count', s.videoCount, snapshotDate, YT_SOURCE));
    }
  }
  return { rows, missing: accounts.filter((a) => !seen.has(a.id)) };
}

/** Views on uploads from the last 7 days: the YouTube Heat signal. Zero is a real value. */
export async function youtubeRecentUploads(acc: Account, apiKey: string, snapshotDate: string): Promise<StatRow[]> {
  const uploadsPlaylist = 'UU' + acc.external_id!.slice(2);
  const since = Date.now() - 7 * 24 * 3600 * 1000;
  let items: YtPlaylistItems['items'] = [];
  try {
    items = (await getJson<YtPlaylistItems>(`${YT}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylist}&maxResults=25&key=${apiKey}`)).items ?? [];
  } catch (e) {
    // A channel with no uploads returns 404 for its uploads playlist.
    if (!String(e).includes('HTTP 404')) throw e;
  }
  const recent = items.filter((v) => new Date(v.contentDetails.videoPublishedAt).getTime() >= since);
  let views = 0;
  if (recent.length) {
    const ids = recent.map((v) => v.contentDetails.videoId).join(',');
    const vids = await getJson<YtVideoList>(`${YT}/videos?part=statistics&id=${ids}&key=${apiKey}`);
    for (const v of vids.items ?? []) views += Number(v.statistics.viewCount ?? 0);
  }
  return [stat(acc, 'views_7d_uploads', views, snapshotDate, YT_SOURCE), stat(acc, 'uploads_7d', recent.length, snapshotDate, YT_SOURCE)];
}

// ---------------------------------------------------------------------------
// Last.fm
// ---------------------------------------------------------------------------
type LastfmInfo = { artist?: { name: string; stats: { listeners: string; playcount: string } }; error?: number; message?: string };

export async function lastfmArtist(acc: Account, apiKey: string, snapshotDate: string): Promise<StatRow[]> {
  const ref = acc.external_id ?? '';
  // external_id is the artist name, or "mbid:<id>" when the name is ambiguous.
  const who = ref.startsWith('mbid:') ? `mbid=${ref.slice(5)}` : `artist=${encodeURIComponent(ref)}`;
  const data = await getJson<LastfmInfo>(`https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&${who}&autocorrect=0&api_key=${apiKey}&format=json`);
  if (!data.artist) throw new Error(`Last.fm: ${data.message ?? 'no artist in reply'}`);
  return [
    stat(acc, 'listeners', data.artist.stats.listeners, snapshotDate, 'lastfm_api'),
    stat(acc, 'playcount', data.artist.stats.playcount, snapshotDate, 'lastfm_api'),
  ];
}

// ---------------------------------------------------------------------------
// Wikipedia pageviews (daily, UTC days). Has years of history.
// ---------------------------------------------------------------------------
type PageviewsReply = { items?: { timestamp: string; views: number }[] };

/** Daily pageviews from `fromDate` to `toDate` inclusive (YYYY-MM-DD, UTC). */
export async function wikipediaPageviews(acc: Account, fromDate: string, toDate: string): Promise<StatRow[]> {
  const title = encodeURIComponent((acc.external_id ?? '').replace(/ /g, '_'));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${title}/daily/${fromDate.replace(/-/g, '')}00/${toDate.replace(/-/g, '')}00`;
  let items: NonNullable<PageviewsReply['items']> = [];
  try {
    items = (await getJson<PageviewsReply>(url)).items ?? [];
  } catch (e) {
    // 404 means no data for that range yet (yesterday's numbers land mid-morning UTC).
    if (!String(e).includes('HTTP 404')) throw e;
  }
  return items.map((it) => {
    const d = `${it.timestamp.slice(0, 4)}-${it.timestamp.slice(4, 6)}-${it.timestamp.slice(6, 8)}`;
    return stat(acc, 'pageviews', it.views, d, 'wikimedia_pageviews_api', `https://pageviews.wmcloud.org/?project=en.wikipedia.org&pages=${title}`);
  });
}

// ---------------------------------------------------------------------------
// Twitch Helix
// ---------------------------------------------------------------------------
type TwitchToken = { access_token: string };
type TwitchFollowers = { total: number };
type TwitchStreams = { data: { user_id: string; viewer_count: number; title: string; game_name: string }[] };

export async function twitchAppToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
  });
  if (!res.ok) throw new Error(`Twitch token: HTTP ${res.status}`);
  return ((await res.json()) as TwitchToken).access_token;
}

const twitchHeaders = (clientId: string, token: string) => ({ 'Client-Id': clientId, Authorization: `Bearer ${token}` });

export async function twitchFollowers(acc: Account, clientId: string, token: string, snapshotDate: string): Promise<StatRow[]> {
  const data = await getJson<TwitchFollowers>(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${acc.external_id}&first=1`, { headers: twitchHeaders(clientId, token) });
  return [stat(acc, 'followers', data.total, snapshotDate, 'twitch_helix')];
}

/** Who is live right now and with how many viewers. One request per 100 channels. */
export async function twitchLive(accounts: Account[], clientId: string, token: string): Promise<LiveSample[]> {
  const samples: LiveSample[] = [];
  for (let i = 0; i < accounts.length; i += 100) {
    const batch = accounts.slice(i, i + 100);
    const q = batch.map((a) => `user_id=${a.external_id}`).join('&');
    const data = await getJson<TwitchStreams>(`https://api.twitch.tv/helix/streams?first=100&${q}`, { headers: twitchHeaders(clientId, token) });
    for (const s of data.data) {
      const acc = batch.find((a) => a.external_id === s.user_id);
      if (acc) samples.push({ talent_account_id: acc.id, viewers: s.viewer_count, title: s.title, category: s.game_name, source: 'twitch_helix' });
    }
  }
  return samples;
}

function stat(acc: Account, metric: string, value: number | string, snapshotDate: string, source: string, sourceUrl?: string): StatRow {
  return { talent_account_id: acc.id, metric, value: Number(value), snapshot_date: snapshotDate, source, source_url: sourceUrl ?? acc.url };
}
