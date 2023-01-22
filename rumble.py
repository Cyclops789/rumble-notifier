import re as r
import logging as log
from time import sleep
from urllib.request import urlopen
from yaml import safe_load
from discord_webhook import DiscordWebhook, DiscordEmbed
from tinydb import TinyDB, Query
from rich.logging import RichHandler

log.basicConfig(level=20, format="%(message)s", datefmt="[%X]", handlers=[RichHandler()])
logger = log.getLogger("rich")

logger.info("Started")

def config():
        with open('config.yml') as cfg:
            return safe_load(cfg)
config = config()

db = TinyDB("videos.json")
videos = Query()
v_previous = ''

class Rumble():
    def __init__(self) -> None:
        pass

    def getVideoID(self, videoLink):
        return videoLink[19:26]

    def getElement(self, link=config["channel_link"], target="""<li class="video-listing-entry">.*?<\/li>"""):
        self.fp = urlopen(link)
        self.mybytes = self.fp.read()
        self.mystr = self.mybytes.decode("utf-8")
        self.fp.close()
        self.elements = r.findall(target, self.mystr,r.MULTILINE)
        return self.elements[0]

    def getVideoType(self, element):
        self.live = r.findall("LIVE", element, r.MULTILINE)
        self.upcoming = r.findall("UPCOMING", element, r.MULTILINE)
        if self.live:
            return 1, "LIVE"
        elif self.upcoming:
            return 2, "UPCOMING"
        else:
            return 3, "VIDEO"
    
    def getVideoTitle(self, element):
        self.txt = element.replace("""<li class="video-listing-entry"><article class=video-item><h3 class=video-item--title>""", "")
        return r.sub("</h3>.*$", "", self.txt)

    def getVideoImage(self, element):
        self.image = r.findall("https.*jpg\s", element,r.MULTILINE)
        return self.image[0]

    def getVideoLink(self, element):
        self.vlink = r.findall("href.*html", element,r.MULTILINE)
        self.vl = self.vlink[0]
        return "https://rumble.com" + self.vl.replace("href=","")

    def getChannelName(self, element):
        self.c_name = r.findall("class=ellipsis-1>.*?<", element, r.MULTILINE)
        self.c_cn = self.c_name[0]
        self.c_nr = self.c_cn.replace("class=ellipsis-1>","")
        return r.sub("<","",self.c_nr)

    def getChannelLink(self, element):
        self.c_link = r.findall("href=\/c\/.*?>", element, r.MULTILINE)
        self.c_vcl  = self.c_link[0]
        self.c_lr   = self.c_vcl.replace("href=","")
        return "https://rumble.com" + r.sub(">", "", self.c_lr)

    def getVideoDescription(self, element):
        self.v_descs = self.getElement(link=self.getVideoLink(element), target="""<p class="media-description">.*?<a""")
        self.v_descr = self.v_descs.replace("""<p class="media-description">""","")
        return f"""{self.v_descr.replace("<a","")}..."""

    def getVideoDuration(self, element):
        if self.getVideoType(element)[0] == 3:
            self.di = r.findall("<span class=video-item--duration data-value=.*?>", element,r.MULTILINE)
            for vd in self.di:
                self.dic = vd.replace("<span class=video-item--duration data-value=", "")
                return r.sub(">.*$","", self.dic)

    def isNewVideo(self, id):
        result = db.search(videos.id == id)
        if result:
            return False
        else:
            return True

    def addToDB(self, title, videoID, type):
        db.insert({ 'title': title, 'id': videoID, 'type': type })

    def sendWebHook(self, element, videoTitle, channelName, channelLink, videoDescription, videoLink, videoImage, videoDuration):
        if self.getVideoType(element)[0] == 1:
            title = " "
            w_username = config["webhook_live_username"]
            c_webhook = config["webhook_live"]
            message="is live right now!"
        elif self.getVideoType(element)[0] == 3:
            title = f"**({videoDuration})**"
            w_username = config["webhook_video_username"]
            c_webhook = config["webhook_video"]
            message="has posted a video, go check it out!"

        webhook = DiscordWebhook(url=c_webhook, content=f'**{channelName}** {message}', username=w_username, avatar_url=config["webhooks_picture"])
        embed = DiscordEmbed(title=f"{videoTitle} {title}", description=videoDescription, url=videoLink, color=config['webhook_embed_color'])
        embed.set_author(name=channelName, url=channelLink)
        embed.set_image(url=videoImage)
        webhook.add_embed(embed)
        return webhook.execute()

while True:
    try:
        e_current = Rumble().getElement()
        v_current = Rumble().getVideoID(videoLink=Rumble().getVideoLink(e_current))
        
        if v_current == v_previous:
            continue
        elif  (v_current != v_previous) and (Rumble().isNewVideo(v_current)) and (Rumble().getVideoType(e_current)[0] != 2):
            Rumble().sendWebHook(
                e_current,
                Rumble().getVideoTitle(e_current),
                Rumble().getChannelName(e_current),
                Rumble().getChannelLink(e_current),
                Rumble().getVideoDescription(e_current), 
                Rumble().getVideoLink(e_current),
                Rumble().getVideoImage(e_current), 
                Rumble().getVideoDuration(e_current)
            )
            logger.info("WebHook Sent, Type: " + ( "Live" if Rumble().getVideoType(e_current)[0] == 1 else "Video"))
            Rumble().addToDB(Rumble().getVideoTitle(e_current), Rumble().getVideoID(Rumble().getVideoLink(e_current)), Rumble().getVideoType(e_current)[0])
        v_previous = v_current
        sleep(60)
    except Exception as e:
        logger.error("Error: " + str(e))
        continue
    except KeyboardInterrupt:
        logger.info("Done")
        exit()
