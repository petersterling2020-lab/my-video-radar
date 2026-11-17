# My Video Radar

A lightweight, text-first YouTube video discovery site. No thumbnails, no Excel, and no paid hosting required. Keeps the user's 99-subscription list separate from HOUSE CTR.

## What's already built

- 99 subscription names imported from the supplied YouTube page text.
- 15 verified channel IDs and 45 provider-verified recent subscribed-channel video IDs from 17 Nov 2026.
- 47 earlier niche-search video results, deduplicated with subscribed uploads; 84 unique videos in the seed index.
- Responsive site with searchable titles, date filters, channel directory, 7 niche collections, favourites, watched markers and direct YouTube video links.
- GitHub Actions scheduled refresh every six hours. It fetches latest public channel RSS feeds for every channel with a verified ID; prior video records are kept if a source fails.
- Optional YouTube Data API key unlocks unique exact-name matching for remaining channels (10 per run) and refreshed topic searches.

**Important:** The initial snapshot is NOT a current live feed. The site becomes auto-updated after the GitHub Pages workflow is deployed and runs. An unverified channel name is not claimed to have no uploads. Public GitHub Pages does not secure your subscription list. Data-source outages and delayed GitHub schedules are possible.

## Publish for free (one-time steps)

1. Sign in to GitHub at https://github.com/new and create a **new public repository** named `my-video-radar`. Do not place it inside the HOUSE CTR repository. Do not tick "Add README".
2. Download and extract the supplied ZIP. At the new repository's Code page choose **uploading an existing file**, and drag the **contents inside** `my-video-radar` into the page, keeping `.github/workflows/refresh-and-publish.yml`, `scripts/`, `data/`, `app.js`, `styles.css` and `index.html` in their original paths. Commit to `main`. Alternatively, `git init; git add .; git commit; git remote add origin; git push` from this extracted directory.
3. Open repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open **Actions → Refresh and publish My Video Radar → Run workflow**. Once that workflow reports success, the URL should be `https://YOUR-GITHUB-USERNAME.github.io/my-video-radar/` (the Pages settings page shows the exact URL). The GitHub Pages deployment can take some time to appear after the run.
5. Bookmark the site. The scheduled workflow should check uploads every 6 hours, not in real time.

### Optional but recommended — complete all 99 IDs and update niche collections

The 84 unresolved channel names require a reliable public YouTube channel ID. A name match alone isn't safe (multiple channels can have the same name). This can be automated **after you supply your own free YouTube Data API key**:

1. In Google Cloud, enable **YouTube Data API v3** for a project and create an API key. Restrict that key to the YouTube Data API; avoid putting the key into a public web page or repository file.
2. GitHub repo **Settings → Secrets and variables → Actions → New repository secret**: name `YOUTUBE_API_KEY`, value your key.
3. Re-run **Refresh and publish My Video Radar**. It safely resolves up to 10 previously unmatched channel names per run **only when a unique exact title matches**. Other channels remain pending until confirmed. The same job updates niche searches. Rate limits or multiple exact-name matches can still leave some channels unresolved.

You do **not** need an API key to refresh the 15 already matched channels using their public RSS feeds.

## Personal use and privacy

A public GitHub repository reveals the channel list and indexed videos to anyone who knows the repository. The app does not request Google login or access private videos; it reads public metadata only. Saved/Watched marks use local browser storage and are not synced between devices. To keep this site private, use access-controlled hosting instead of free public GitHub Pages.

## How it works

- `data/channels.json`: your 99 channel names with 15 verified IDs.
- `data/niches.json`: seven default topic-search configurations.
- `data/index.json`: current collected video records; updated by automation.
- `scripts/refresh.py`: server-side refresh code, Python standard library only.
- `.github/workflows/refresh-and-publish.yml`: scheduled fetch and GitHub Pages deployment.
- `index.html`, `styles.css`, `app.js`: static front end.

Development: `python -m unittest discover -s tests -v` followed by `python scripts/refresh.py --offline`. To preview locally, `python -m http.server 8000` from the project directory, then open http://localhost:8000/ . The `index.html` can also open locally using its embedded seed snapshot.

### Limits

RSS feeds only return recent public uploads; they are not guaranteed to return every older video or include every Shorts/live distinction. GitHub's scheduled jobs may start late. YouTube API free quota limits apply; YouTube search results are uncurated and should not be treated as recommendations or factual endorsements. See official GitHub Pages and YouTube Data API documentation for current terms.
