export const prerender = true;

import { getCollection, getEntry } from 'astro:content';
import site from '@data/branding.json';
import rss from '@astrojs/rss';
import { getArticleAudioSize, getArticleAudioPath, getAllLanguages } from '@utils/utils.js';
import { getImage } from "astro:assets";

const isPublished = ({data}) => (!data.draft && data.datePublished<=new Date());
const hasAudio = ({data}) => !!data.audio;
const isDev = import.meta.env.APP_ENV==='dev';

export const getPodcastArticles = async (lang) => {
  const posts = await getCollection("posts", (ar) => {
    return isPublished(ar) && hasAudio(ar) && (ar.data.language===lang);
  });
  return posts;
}

export async function getStaticPaths() {
  const languages = await getAllLanguages();
   // Convert Set to Array and generate paths
  const paths = Array.from(languages).map((language) => {
    // console.log( { params: { language: `${language}` } } )
    return { params: { language: `${language}` } };
  });
  return paths;
}

const iso8601DurToBytes = (duration, bitrate = 64) => {
  const [_, hours, minutes, seconds] = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/).map(t => parseInt(t) || 0);
  return ((hours * 3600 + minutes * 60 + seconds) * bitrate * 125);
}

const ISO8601ToiTunes = (isoDuration) => {
  const match = isoDuration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (match) {
    const hours = String(parseInt(match[1] || 0)).padStart(2, '0');
    const minutes = String(parseInt(match[2] || 0)).padStart(2, '0');
    const seconds = String(parseInt(match[3] || 0)).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
  return null;
};



export const processItems = async (articles, site, baseUrl) => {
  const items = await Promise.all(articles.map(async post => {

    const localAudio = post.data.audio.startsWith('http') ? false : true;
    // console.log('localAudio', localAudio);

    // marshall audio file
    // console.log('marshalling audio file');
    const audioURL = localAudio ? baseUrl + (await getArticleAudioPath(post.data.url, post.data.audio)) : post.data.audio;
    // console.log('audioURL2', audioURL);

    const audioSize = localAudio ? await getArticleAudioSize(post.data?.url, post.data.audio) :
       post.data.audio_length || iso8601DurToBytes(post.data.audio_duration);
    // console.log('audioSize', audioSize);
    // const audioSize =
    // import newImage from post.data.audio_image.src;
    const imageURL = baseUrl + (await getImage({src: post.data.audio_image, format: 'webp'})).src
    // get the author details
    const author = await getEntry(post.data.author.collection, post.data.author.id);
    // console.log('author', author);
    const itunes_duration = ISO8601ToiTunes(post.data.audio_duration);

    // console.log('duration: ' +post.data.audio_duration, 'itunes_duration: ' + itunes_duration);

    return {
      title: post.data.title,
      pubDate: new Date(post.data.datePublished).toUTCString(),
      description: post.data.description,
      content: post.data.abstract,
      author: author.data.name,
      enclosure: { url: audioURL, type: "audio/mpeg", length: audioSize },
      link: `${baseUrl}/${post.data?.url}`,
      commentsUrl: `${baseUrl}/${post.data?.url}#comments`,
      categories: post.data.topics,
      // image: imageURL,
      customData: [
        // `<image src="${ imageURL }" />`
        `<itunes:image href="${ imageURL }" />`,
        `<itunes:duration>${itunes_duration}</itunes:duration>`,
        `<itunes:explicit>no</itunes:explicit>`,
        `<itunes:subtitle>${post.data.desc_125}</itunes:subtitle>`,
        `<itunes:author>${author?.data.name}</itunes:author>`,
        `<itunes:summary>${post.data.abstract}</itunes:summary>`,
        `<itunes:keywords>${post.data.keywords?.join(', ')}</itunes:keywords>`,
        // needs itunes:category and subcategory
        `<itunes:category text="${site.podcast.category}"> <itunes:category text="${site.podcast.subcategory}" /></itunes:category>`,
      ].join(` `)
    };
  }));
  // console.log('items', items);
  return items;
}

export const generateRSSFeedObj = async (articles, language, site, baseUrl) => {
  const feed = {
    stylesheet: '/rss-podcast.xsl',
    title: site.siteName,
    description: site.description,
    site: baseUrl,
    trailingSlash: false,
    language,
    xmlns: {
      itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd'
    },
    customData: [`<language>${language}</language>`,
      `<itunes:category text="${site.podcast.category}"> <itunes:category text="${site.podcast.subcategory}" /></itunes:category>`,
      `<itunes:image href="${ site.logo }" />`,
      `<itunes:explicit>no</itunes:explicit>`,
    ].join(' '),
    items: await processItems(articles, site, baseUrl)
  };
  return feed;
}


export async function GET({ params, request }) {
  const baseUrl = new URL(request?.url).origin;
  const language = params.language;
  // all articles matching language, filtered by having audio
  const articles = await getPodcastArticles(language)
//  console.log(`${articles.length} articles found with podcast audio in "${language}"`);
  const feed = await generateRSSFeedObj(articles, language, site, baseUrl);
  // console.log('rss feed', feed);
  return rss(feed);
}


