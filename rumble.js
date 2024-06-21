
import SimplDB from 'simpl.db';
import { parse } from 'node-html-parser';
import axios from 'axios';
import yaml from 'js-yaml';
import fs from 'fs';
import Color from 'color'

const config = yaml.load(fs.readFileSync('config.yml', 'utf8'));

const channelLink = process.env.CHANNEL_LINK || config.channel_link;
const webhookVideoUsername = process.env.WEBHOOK_VIDEO_USERNAME || config.webhook_video_username;
const webhookLiveUsername = process.env.WEBHOOK_LIVE_USERNAME || config.webhook_live_username;
const webhookEmbedColor = process.env.WEBHOOK_EMBED_COLOR || config.webhook_embed_color;
const webhookPictureUrl = process.env.WEBHOOK_PICTURE_URL || config.webhooks_picture;
const webhookLive = process.env.WEBHOOK_LIVE_URL || config.webhook_live;
const webhookVideo = process.env.WEBHOOK_VIDEO_URL || config.webhook_video;

const db = SimplDB({ autoSave: true, dataFile: `videos.json` });
const Videos = db.createCollection('videos');

class Rumble {
  getVideoID(videoLink) {
    return videoLink.substring(19, 26);
  }

  async getElement(link = channelLink) {
    try {
      const response = await axios.get(link, {
        headers: {
          // Set a dummy user-agent to prevent the redirection
          "User-Agent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching data: ' + error);
      return '';
    }
  }

  getVideoType(element) {
    const isVideo = element.querySelector('.videostream__status--duration');
    const isLive = element.querySelector('.videostream__status--live');
    const isUpComing = element.querySelector('.videostream__status--upcoming');

    if (isLive) {
      return 1;
    } else if (isUpComing) {
      return 2;
    } else if(isVideo) {
      return 3;
    }
  }

  getVideoTitle(element) {
    const title = element.querySelector('.thumbnail__title');
    if (title) {
      return title.textContent.trim();
    }
    return '';
  }

  getVideoImage(element) {
    const image = element.querySelector('.thumbnail__image');
    if (image) {
      return image.rawAttributes.src;
    }
    return '';
  }

  getVideoLink(element) {
    const vlink = element.querySelector('.title__link');
    if (vlink) {
      return 'https://rumble.com' + vlink.rawAttributes.href;
    }
    return '';
  }

  getChannelName(element) {
    const cName = element.querySelector('.channel-header--title-wrapper > h1').textContent.trim();
    if (cName) {
      return cName;
    }
    return '';
  }

  getChannelLink(element) {
    const cLink = element.querySelector('.channel-subheader--menu-item');
    if (cLink) {
      return 'https://rumble.com' + cLink.rawAttributes.href;
    }
    return '';
  }

  async getVideoDescription(element) {
    const videoElement = await this.getElement(this.getVideoLink(element));

    const parsedVideo = parse(videoElement);
    const vDescr = parsedVideo.querySelector('.media-description').textContent.trim().replace('Show less', '');

    return vDescr;
  }

  getVideoDuration(element) {
    if (this.getVideoType(element) === 3) {
      return element.querySelector('.videostream__status--duration').textContent.trim();
    }
    return '';
  }

  isNewVideo(id) {
    const result = Videos.get(video => video.id === id);

    return (result ? false : true);
  }

  addToDB(title, videoID, type) {
    Videos.create({ title: title, id: videoID, type: type });
  }

  async sendWebHook(element, videoTitle, channelName, channelLink, videoDescription, videoLink, videoImage, videoDuration) {
    let title = '';
    let wUsername = '';
    let cWebhook = '';
    let message = '';

    const videoType = this.getVideoType(element);

    if (videoType === 1) {
      wUsername = webhookLiveUsername;
      cWebhook = webhookLive;
      message = 'is live right now!';
    } else if (videoType === 3) {
      title = ` **(${videoDuration})**`;
      wUsername = webhookVideoUsername;
      cWebhook = webhookVideo;
      message = 'has posted a video, go check it out!';
    }

    try {
      const data = {
        content: `**${channelName}** ${message}`,
        embeds: [
          {
            title: `${videoTitle}${title}`,
            description: videoDescription,
            url: videoLink,
            color: Color(webhookEmbedColor).rgbNumber(),
            author: {
              name: channelName,
              url: channelLink,
            },
            image: {
              url: videoImage,
            },
          },
        ],
        username: wUsername,
        avatar_url: webhookPictureUrl,
        attachments: [],
      };

      await axios.post(cWebhook, data);

      console.log('WebHook Sent, Type: ' + (videoType === 1 ? 'Live' : 'Video'));
      console.log(`Title: ${videoTitle}, Url: ${videoLink}`);
    } catch (error) {
      console.error('Error sending webhook: ', error);
    }
  }
}

let vPrevious = '';
(async () => {
  while (true) {
    try {
      const rumble = new Rumble();
      const eCurrent = parse(await rumble.getElement());
      const vCurrent = rumble.getVideoID(rumble.getVideoLink(eCurrent));
      const isNewVideo = rumble.isNewVideo(vCurrent);

      if (vCurrent === vPrevious) {
        continue;
      } else if (vCurrent !== vPrevious && isNewVideo && rumble.getVideoType(eCurrent) !== 2) {
        rumble.sendWebHook(
          eCurrent,
          rumble.getVideoTitle(eCurrent),
          rumble.getChannelName(eCurrent),
          rumble.getChannelLink(eCurrent),
          await rumble.getVideoDescription(eCurrent),
          rumble.getVideoLink(eCurrent),
          rumble.getVideoImage(eCurrent),
          rumble.getVideoDuration(eCurrent)
        );
        rumble.addToDB(rumble.getVideoTitle(eCurrent), rumble.getVideoID(rumble.getVideoLink(eCurrent)), `${rumble.getVideoType(eCurrent)}`);
      }
      vPrevious = vCurrent;
      await new Promise(resolve => setTimeout(resolve, 60000));
    } catch (error) {
      console.error(error);
      continue;
    }
  }
})();
