// Script d'agrégation LUMEN
// Va chercher des flux RSS officiels (pas de scraping de pages HTML — on respecte
// les conditions d'utilisation des sites sources), les transforme en un JSON
// que le site statique affiche. Exécuté toutes les 30 min par GitHub Actions.
//
// Usage local : node scripts/fetch-news.js
// (Node 18+ requis pour fetch() natif)

import { XMLParser } from 'fast-xml-parser';
import { writeFile } from 'node:fs/promises';

// -----------------------------------------------------------------------
// 1. Liste des flux RSS — à adapter librement (ajoutez/retirez des sources)
// -----------------------------------------------------------------------
const FEEDS = [
  { url: 'https://www.frandroid.com/feed', source: 'Frandroid', category: 'smartphones' },
  { url: 'https://www.numerama.com/feed/', source: 'Numerama', category: 'culture' },
  { url: 'https://www.clubic.com/feed/news.rss', source: 'Clubic', category: 'logiciels' },
  { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', category: 'ia' },
];

const MAX_ARTICLES = 40;
const SUMMARY_MAX_LEN = 200; // extrait court — jamais l'article complet (respect du droit d'auteur)

// -----------------------------------------------------------------------
// 2. (Optionnel) résumé IA en 3 lignes via l'API Anthropic, si une clé est fournie
//    Sinon on retombe sur l'extrait RSS tronqué — le site fonctionne dans les deux cas.
// -----------------------------------------------------------------------
async function aiSummarize(title, excerpt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `Résume en français, en exactement 3 phrases courtes, sans reformuler mot à mot le texte source, l'information suivante destinée à un lecteur tech pressé.\nTitre: ${title}\nExtrait: ${excerpt}`,
        }],
      }),
    });
    const data = await res.json();
    return data?.content?.[0]?.text?.trim() || null;
  } catch (err) {
    console.error('Résumé IA indisponible, on garde l\'extrait RSS :', err.message);
    return null;
  }
}

function stripHtml(str = '') {
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function slugId(url) {
  return Buffer.from(url).toString('base64').slice(0, 16);
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, { headers: { 'User-Agent': 'LUMEN-Aggregator/1.0' } });
    const xml = await res.text();
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml);
    const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    const list = Array.isArray(items) ? items : [items];

    return list.slice(0, 12).map((item) => {
      const title = stripHtml(item.title?.['#text'] || item.title || '');
      const link = item.link?.['@_href'] || item.link || '';
      const rawDesc = item.description || item.summary || item['content:encoded'] || '';
      const excerpt = stripHtml(rawDesc).slice(0, SUMMARY_MAX_LEN);
      const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
      return {
        id: slugId(link || title),
        title,
        source: feed.source,
        category: feed.category,
        url: link,
        pubDate: new Date(pubDate).toISOString(),
        excerpt,
      };
    });
  } catch (err) {
    console.error(`Échec du flux ${feed.source} :`, err.message);
    return [];
  }
}

async function main() {
  const allItems = (await Promise.all(FEEDS.map(fetchFeed))).flat();

  const withSummaries = await Promise.all(
    allItems.map(async (item) => {
      const aiSummary = await aiSummarize(item.title, item.excerpt);
      return {
        id: item.id,
        title: item.title,
        source: item.source,
        category: item.category,
        url: item.url,
        pubDate: item.pubDate,
        summary: aiSummary || item.excerpt,
      };
    })
  );

  const sorted = withSummaries
    .filter((a) => a.title && a.url)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, MAX_ARTICLES);

  await writeFile( '../data/articles.json',JSON.stringify(sorted, null, 2), 'utf-8');
  console.log(`✅ ${sorted.length} articles écrits dans data/articles.json`);
}

main();
