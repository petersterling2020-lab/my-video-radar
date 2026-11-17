#!/usr/bin/env python3
"""Update My Video Radar from public YouTube channel RSS feeds.

No API key is required for already verified channel IDs. With a key set in the
YOUTUBE_API_KEY environment variable, this additionally resolves unverified
channel names cautiously and discovers new videos for predefined niches.

Do not assume a channel was checked when a feed failed. No guesses or invented
watch URLs are inserted. Standard-library only; works in GitHub Actions.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
RSS_NS = {'a':'http://www.w3.org/2005/Atom', 'yt':'http://www.youtube.com/xml/schemas/2015'}
VIDEO_ID = re.compile(r'^[A-Za-z0-9_-]{11}$')
CHANNEL_ID = re.compile(r'^UC[A-Za-z0-9_-]{22}$')
USER_AGENT = 'MyVideoRadar/1.0 (personal public video index; GitHub Actions)'


def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')


def read_json(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def save_json(name, object_):
    (DATA / name).write_text(json.dumps(object_,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def get_bytes(url, timeout=18):
    req=urllib.request.Request(url,headers={'User-Agent':USER_AGENT,'Accept':'application/json, application/atom+xml, application/xml;q=0.9'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(3_000_000)


def api_call(resource, params, key):
    qs=urllib.parse.urlencode({**params,'key':key})
    # Never print the URL: it includes the secret key.
    url=f'https://www.googleapis.com/youtube/v3/{resource}?{qs}'
    return json.loads(get_bytes(url).decode('utf-8'))


def normalize(s):
    return re.sub(r'[^a-z0-9]+','',str(s or '').casefold())


def resolve_channels(channels, key, max_resolves=10):
    """Only accept a unique EXACT normalized channel-name match; no guesses."""
    if not key: return 0, []
    matched=0; problems=[]
    pending=[c for c in channels if not c.get('channel_id')]
    pending.sort(key=lambda c: c.get('last_lookup_at',''))
    for ch in pending[:max_resolves]:
        ch['last_lookup_at']=now_iso()
        try:
            js=api_call('search',{'part':'snippet','q':ch['name'],'type':'channel','maxResults':10},key)
            possibilities=[]
            for item in js.get('items',[]):
                title=item.get('snippet',{}).get('title','')
                id_=item.get('id',{}).get('channelId','')
                if CHANNEL_ID.fullmatch(id_) and normalize(title)==normalize(ch['name']):
                    possibilities.append(id_)
            possibilities=list(dict.fromkeys(possibilities))
            if len(possibilities)==1:
                ch.update({'channel_id':possibilities[0],'verified':True,'source':'Auto-matched by exact channel title in YouTube search; subscription identity not user-confirmed'})
                matched+=1
            elif len(possibilities)>1:
                ch['lookup_status']='Ambiguous channel title — manual confirmation needed'
                problems.append(f"Ambiguous channel name: {ch['name']}")
            else:
                ch['lookup_status']='No unique exact title match in this search'
        except Exception as err:
            problems.append(f"Channel lookup failed for {ch['name']}: {type(err).__name__}")
            if isinstance(err,urllib.error.HTTPError) and err.code in (400,403,429):
                break
    return matched,problems


def parse_feed(content,channel_name):
    root=ET.fromstring(content)
    items=[]
    for entry in root.findall('a:entry',RSS_NS):
        v_id=entry.findtext('yt:videoId',default='',namespaces=RSS_NS)
        title=entry.findtext('a:title',default='',namespaces=RSS_NS)
        pub=entry.findtext('a:published',default='',namespaces=RSS_NS)
        if not VIDEO_ID.fullmatch(v_id) or not title or not pub:continue
        try:dt.datetime.fromisoformat(pub.replace('Z','+00:00'))
        except ValueError:continue
        items.append({'id':v_id,'channel':channel_name,'title':title,'published':pub,'precision':'second','url':f'https://www.youtube.com/watch?v={v_id}','origin':'subscribed','topic':None,'verified':'Recent public channel RSS feed'})
    return items


def feed_for(channel):
    id_=channel.get('channel_id')
    if not CHANNEL_ID.fullmatch(id_ or ''):return channel['name'],[],False,'missing verified channel ID'
    try:
        url='https://www.youtube.com/feeds/videos.xml?'+urllib.parse.urlencode({'channel_id':id_})
        items=parse_feed(get_bytes(url),channel['name'])
        return channel['name'],items,True,''
    except Exception as err:
        return channel['name'],[],False,type(err).__name__


def search_niche(niche,key,max_results=25):
    cutoff=dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=14)
    params={'part':'snippet','type':'video','q':niche['query'],'order':'date',
            'maxResults':max_results,'publishedAfter':cutoff.isoformat(timespec='seconds').replace('+00:00','Z'),
            'relevanceLanguage':'en'}
    js=api_call('search',params,key)
    results=[]
    for item in js.get('items',[]):
        id_=item.get('id',{}).get('videoId','')
        snippet=item.get('snippet',{})
        title=snippet.get('title','')
        if not VIDEO_ID.fullmatch(id_) or not title:continue
        # Google API returns HTML-escaped titles; unescape for clean display.
        import html
        results.append({'id':id_,'channel':html.unescape(snippet.get('channelTitle','')),
            'title':html.unescape(title),'published':snippet.get('publishedAt',''),
            'precision':'second','url':f'https://www.youtube.com/watch?v={id_}',
            'origin':'niche','topic':niche['name'],'verified':'Recent YouTube search result, not an endorsement'})
    return results


def valid_record(v):
    return VIDEO_ID.fullmatch(v.get('id','')) and isinstance(v.get('title'),str) and isinstance(v.get('channel'),str) and isinstance(v.get('published'),str)


def merge_videos(current,feed_videos,niche_videos):
    videos={v['id']:v for v in current if valid_record(v)}
    for v in niche_videos:
        if not valid_record(v):continue
        old=videos.get(v['id'])
        if old and old.get('origin')=='subscribed':
            old['topic']=old.get('topic') or v.get('topic')
            continue
        videos[v['id']]={**old,**v} if old else v
    for v in feed_videos:
        if not valid_record(v):continue
        old=videos.get(v['id'],{})
        videos[v['id']]={**old,**v,'topic':old.get('topic') or v.get('topic')}
    def timestamp(v):
        try: return dt.datetime.fromisoformat(v['published'].replace('Z','+00:00')).timestamp()
        except (ValueError,TypeError):return 0
    subscription=sorted((v for v in videos.values() if v.get('origin')=='subscribed'),key=timestamp,reverse=True)[:1800]
    topic=sorted((v for v in videos.values() if v.get('origin')!='subscribed'),key=timestamp,reverse=True)[:700]
    return sorted(subscription+topic,key=timestamp,reverse=True)


def refresh(offline=False):
    channels=read_json('channels.json')
    index=read_json('index.json')
    niches=read_json('niches.json')
    key=os.getenv('YOUTUBE_API_KEY','').strip()
    checked=now_iso(); problems=[]
    resolved=0
    if key and not offline:
        resolved,issues=resolve_channels(channels,key,max_resolves=10)
        problems.extend(issues)
    feeds=[];success=0;failed=0
    known=[c for c in channels if CHANNEL_ID.fullmatch(c.get('channel_id') or '')]
    if not offline:
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            for name,videos,ok,reason in pool.map(feed_for,known):
                if ok:
                    success+=1;feeds.extend(videos)
                else:
                    failed+=1;problems.append(f'Feed failed for {name}: {reason}')
    topics=[]
    if key and not offline:
        for n in niches:
            try:topics.extend(search_niche(n,key))
            except Exception as err:
                problems.append(f"Niche search failed for {n['name']}: {type(err).__name__}")
                if isinstance(err,urllib.error.HTTPError) and err.code in (400,403,429):break
    index.update({'generated_at':checked if success or topics else index.get('generated_at',checked),
        'last_attempt_at':checked,'channels':channels,'niches':niches,
        'subscriptions':merge_videos(index.get('subscriptions',[]),feeds,topics),
        'source':'Public YouTube RSS feeds; API search optional; prior snapshots retained',
        'health':{'feeds_successful':success,'feeds_failed':failed,'key_configured':bool(key),
                  'newly_resolved':resolved,'niche_search_results':len(topics),
                  'note':'Some sources failed; earlier verified entries retained' if failed or problems else 'Refresh completed' if not offline else 'Offline validation only',
                  'issues':problems[:12]}})
    if not offline:
        save_json('channels.json',channels)
        save_json('index.json',index)
    print(json.dumps({'channels':len(channels),'verified':len(known),'resolved':resolved,
                      'feed_success':success,'feed_fail':failed,'new_feed_videos':len(feeds),
                      'niche_results':len(topics),'total_videos':len(index['subscriptions']),
                      'offline':offline,'issues':len(problems)}))
    return index


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--offline',action='store_true',help='Validate saved JSON without making network calls or changing data')
    args=parser.parse_args()
    refresh(offline=args.offline)
