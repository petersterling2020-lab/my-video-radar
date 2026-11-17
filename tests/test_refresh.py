import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import refresh

class RefreshTests(unittest.TestCase):
    def test_parse_feed(self):
        atom=b'''<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry><yt:videoId>2ISFOqFsv00</yt:videoId><title>A title &amp; update</title><published>2026-11-17T00:07:28+00:00</published></entry></feed>'''
        self.assertEqual(refresh.parse_feed(atom,'AI Revolution')[0]['url'],'https://www.youtube.com/watch?v=2ISFOqFsv00')
        self.assertEqual(refresh.parse_feed(atom,'AI Revolution')[0]['title'],'A title & update')
    def test_no_guesses(self):
        x=refresh.merge_videos([],[],[{'id':'invalid','title':'oops','channel':'X','published':'2026-11-17T00:00:00Z'}])
        self.assertEqual(x,[])
    def test_known_ids(self):
        channels=refresh.read_json('channels.json')
        self.assertEqual(len(channels),99)
        self.assertEqual(sum(bool(c['channel_id']) for c in channels),15)
        for c in channels:
            if c['channel_id']:self.assertRegex(c['channel_id'],r'^UC[A-Za-z0-9_-]{22}$')
    def test_seed_links(self):
        index=refresh.read_json('index.json')
        self.assertGreaterEqual(len(index['subscriptions']),80)
        self.assertTrue(all(refresh.valid_record(v) for v in index['subscriptions']))
        self.assertTrue(all(v['url']=='https://www.youtube.com/watch?v='+v['id'] for v in index['subscriptions']))

if __name__=='__main__':unittest.main()
