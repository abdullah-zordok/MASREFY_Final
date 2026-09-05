import { PublishedContentCache } from '../../../src/engagement/content.service';

describe('published content cache', () => {
  it('uses a five-minute locale/type/query/version key and expires deterministically', async () => {
    let now = 0,
      loads = 0;
    const cache = new PublishedContentCache(() => now);
    const load = () => Promise.resolve({ value: ++loads });
    await expect(
      cache.get({ locale: 'ar', type: 'faq', query: 'card', cursor: '', version: 2 }, load),
    ).resolves.toEqual({ value: 1 });
    now = 299_999;
    await expect(
      cache.get({ locale: 'ar', type: 'faq', query: 'card', cursor: '', version: 2 }, load),
    ).resolves.toEqual({ value: 1 });
    now = 300_000;
    await expect(
      cache.get({ locale: 'ar', type: 'faq', query: 'card', cursor: '', version: 2 }, load),
    ).resolves.toEqual({ value: 2 });
  });

  it('coalesces a cache miss and invalidates all versions for one content key', async () => {
    const cache = new PublishedContentCache(() => 0);
    let resolve!: (value: string) => void;
    const load = () =>
      new Promise<string>((done) => {
        resolve = done;
      });
    const key = {
      locale: 'en' as const,
      type: 'article' as const,
      query: '',
      cursor: '',
      version: 1,
      contentKey: 'privacy',
    };
    const first = cache.get(key, load),
      second = cache.get(key, load);
    resolve('published');
    await expect(Promise.all([first, second])).resolves.toEqual(['published', 'published']);
    cache.invalidate('privacy');
    await expect(cache.get(key, () => Promise.resolve('updated'))).resolves.toBe('updated');
  });
});
