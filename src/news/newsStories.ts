import { NewsItem, VerifiedStory, YouTubeVideo } from '../types';

// News-first story construction.
//
// WHY THIS REPLACED crossVerify AS THE PRIMARY SOURCE
// crossVerify pairs a YouTube video with news articles by proper-noun overlap. In practice
// the overlap is weak enough to pair unrelated things, and the model is then told they are
// the same story. Observed 2026-09-02:
//
//   YT "Top 5 Moments Of This Week | The Traitors Season 2"
//     matched -> "Amitabh Bachchan... Rs 90 crore debt, 55 legal cases"
//     matched -> "Theatrical Releases This Week (Aug 30-Sep 5)"
//
//   YT "Imran Khan Shares on His First Screen Test for Delhi Belly"
//     matched -> "Nimisha Sajayan recalls The Great Indian Kitchen"
//     matched -> "Sahiya director threatens high court battle against CBFC"
//
// ADIRA correctly returned NO_WORTHWHILE_STORY on all of it — the input was incoherent, so
// there was nothing truthful to write. Three consecutive runs published nothing while the
// news pool itself contained real, on-beat stories (a director suing the CBFC over
// certification delays is exactly the beat) that were being destroyed by being paired with
// random promotional clips.
//
// The YouTube layer was only ever there to decide WHAT was worth covering. A named
// publication reporting something is a better signal than a channel uploading a promo, and
// it needs no matching step at all — so the whole class of mismatch disappears.
//
// The VerifiedStory shape is kept so rankStories, the dedup logic and the prompt builder all
// work unchanged. `youtubeVideo` here carries the ARTICLE (outlet as channelTitle, article
// URL as url); it is a shim, and the field name is now a misnomer worth renaming when the
// YouTube path is removed entirely.
export function storiesFromNews(news: NewsItem[]): VerifiedStory[] {
  const seen = new Set<string>();

  return news
    .filter((n) => {
      if (!n.title || !n.link) return false;
      // Same story often lands from several aggregators — dedupe on the headline.
      const key = n.title.toLowerCase().replace(/\W+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((n) => {
      const asArticle: YouTubeVideo = {
        id: n.link,
        title: n.title,
        channelId: n.source,
        channelTitle: n.source,
        publishedAt: n.pubDate,
        url: n.link,
        description: n.description ?? '',
      };
      return {
        youtubeVideo: asArticle,
        matchingNews: [n], // the article is its own coverage — fetchArticleText reads its body
        matchScore: 1,
      };
    });
}
