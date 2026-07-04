import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

export interface LoreFact {
  source_title: string;
  heading: string;
  text: string;
  url: string;
}

export interface LoreResult {
  query: string;
  about: string | null;
  image: string | null;
  official_website: string | null;
  facts: LoreFact[];
}

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const UA = 'Fable-Trip-Planner/1.0 (self-hosted)';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Section headings that make a place interesting to a tourist. */
const LORE_HEADINGS =
  /mytholog|legend|folklor|fiction|popular culture|cultural reference|etymolog|literature|in film|in media|history|origin|trivia|ghost|haunt|tale/i;

@Injectable()
export class LoreService {
  constructor(private readonly dbs: DbService) {}

  private async wiki(params: Record<string, string>): Promise<any> {
    const url = `${WIKI_API}?${new URLSearchParams({
      format: 'json',
      origin: '*',
      ...params,
    })}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
    return res.json();
  }

  private cacheGet(key: string): LoreResult | null {
    const row = this.dbs.db
      .prepare('SELECT payload, fetched_at FROM lore_cache WHERE key = ?')
      .get(key) as { payload: string; fetched_at: string } | undefined;
    if (!row) return null;
    if (Date.now() - new Date(row.fetched_at + 'Z').getTime() > CACHE_TTL_MS) {
      this.dbs.db.prepare('DELETE FROM lore_cache WHERE key = ?').run(key);
      return null;
    }
    return JSON.parse(row.payload);
  }

  private cachePut(key: string, value: LoreResult) {
    this.dbs.db
      .prepare(
        `INSERT INTO lore_cache (key, payload, fetched_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
      )
      .run(key, JSON.stringify(value));
  }

  private async wikidataWebsite(qid: string): Promise<string | null> {
    try {
      const res = await fetch(
        `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`,
        { headers: { 'User-Agent': UA } },
      );
      if (!res.ok) return null;
      const data: any = await res.json();
      const claims = data?.entities?.[qid]?.claims?.P856;
      const url = claims?.[0]?.mainsnak?.datavalue?.value;
      return typeof url === 'string' ? url : null;
    } catch {
      return null;
    }
  }

  private async findTitles(q: string, lat?: number, lng?: number): Promise<string[]> {
    if (lat !== undefined && lng !== undefined) {
      const geo = await this.wiki({
        action: 'query',
        list: 'geosearch',
        gscoord: `${lat}|${lng}`,
        gsradius: '10000',
        gslimit: '3',
      });
      const titles = (geo?.query?.geosearch ?? []).map((g: any) => g.title as string);
      if (titles.length) return titles;
    }
    const search = await this.wiki({
      action: 'query',
      list: 'search',
      srsearch: q,
      srlimit: '2',
    });
    return (search?.query?.search ?? []).map((s: any) => s.title as string);
  }

  /** Split a plaintext Wikipedia extract into { heading, body } sections. */
  private splitSections(extract: string): { heading: string; body: string }[] {
    const sections: { heading: string; body: string }[] = [];
    const parts = extract.split(/\n?==+ *(.+?) *==+\n?/);
    // parts[0] is the intro, then alternating [heading, body, heading, body, ...]
    sections.push({ heading: '__intro__', body: parts[0] ?? '' });
    for (let i = 1; i + 1 <= parts.length - 1; i += 2) {
      sections.push({ heading: parts[i].trim(), body: (parts[i + 1] ?? '').trim() });
    }
    return sections;
  }

  private clip(text: string, max = 700): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    return `${cut.slice(0, cut.lastIndexOf('. ') + 1) || cut}…`;
  }

  async getLore(q: string, lat?: number, lng?: number): Promise<LoreResult> {
    const key = `v2|${q.toLowerCase()}|${lat?.toFixed(3) ?? ''}|${lng?.toFixed(3) ?? ''}`;
    const cached = this.cacheGet(key);
    if (cached) return cached;

    const result: LoreResult = {
      query: q,
      about: null,
      image: null,
      official_website: null,
      facts: [],
    };
    try {
      const titles = await this.findTitles(q, lat, lng);
      for (const title of titles.slice(0, 3)) {
        const data = await this.wiki({
          action: 'query',
          prop: 'extracts|pageimages|pageprops',
          explaintext: '1',
          titles: title,
          piprop: 'thumbnail',
          pithumbsize: '480',
          redirects: '1',
        });
        const pages = data?.query?.pages ?? {};
        const page: any = Object.values(pages)[0];
        if (!page?.extract) continue;
        const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(
          String(page.title).replace(/ /g, '_'),
        )}`;
        if (!result.image && page.thumbnail?.source) result.image = page.thumbnail.source;
        // Official website lives in Wikidata (property P856), not Wikipedia.
        const qid = page.pageprops?.wikibase_item;
        if (!result.official_website && qid) {
          result.official_website = await this.wikidataWebsite(qid);
        }
        const sections = this.splitSections(page.extract);
        if (!result.about && sections[0]?.body) {
          result.about = this.clip(sections[0].body, 500);
        }
        for (const s of sections) {
          if (s.heading === '__intro__' || !LORE_HEADINGS.test(s.heading) || !s.body) continue;
          result.facts.push({
            source_title: page.title,
            heading: s.heading,
            text: this.clip(s.body),
            url,
          });
          if (result.facts.length >= 8) break;
        }
        if (result.facts.length >= 8) break;
      }
    } catch {
      // Network hiccup or API change: return whatever we assembled; don't cache failures.
      return result;
    }
    this.cachePut(key, result);
    return result;
  }
}
