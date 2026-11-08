/**
 * Placeholder content, for the pictures that go on a store listing.
 *
 * ## Why this exists at all
 *
 * Google removes apps in this category for what their store listing
 * shows, independently of what the app does: the Intellectual Property
 * policy names the listing's "description" and "screenshots" as
 * enforceable surfaces of their own, and a player's screenshots full of
 * somebody else's film posters and broadcasters' channel logos is the
 * clearest possible evidence of the thing it forbids. The listing's
 * assets also have to be the publisher's own original or licensed work,
 * and a provider's artwork is neither.
 *
 * The honest way to photograph this app is therefore to photograph it
 * running on content that belongs to nobody. Rather than retouch real
 * screenshots — which would mean painting over artwork and re-typing
 * titles, and would produce a picture of something that never existed —
 * the data layer is swapped for invented titles and generated artwork,
 * and the app is screenshotted for real. Every pixel of interface in
 * those pictures is the actual app; only the catalogue is imaginary.
 *
 * ## It must never ship
 *
 * `DEMO_CONTENT` is `false` on `main` and is turned on by hand for the
 * minutes it takes to capture a set of screenshots. `tools/verify-brand.js`
 * fails the build if it is left on, so a release cannot be cut with an
 * invented catalogue in it.
 */
export const DEMO_CONTENT = false;

/**
 * The marker a generated-artwork URI starts with.
 *
 * `CachedImage` watches for it and draws a gradient instead of fetching
 * anything, so no request leaves the device for a picture that does not
 * exist. The provider item id is appended, which is what makes a given
 * title keep the same colours from one screen to the next.
 */
export const DEMO_ART_PREFIX = "mooj-demo://art/";

/** A deterministic index from any string, so one title always gets one colour. */
function hashIndex(seed: string, buckets: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % buckets;
}

/**
 * The invented names.
 *
 * Numbered rather than fanciful: "Channel 07" is obviously a placeholder,
 * where an invented title like "The Last Harbour" would read as a claim
 * that the app carries a film by that name. A store listing may not imply
 * content it does not provide, and that includes content that does not
 * exist.
 */
export function demoChannelName(seed: string, index: number): string {
  return `Channel ${String(index + 1).padStart(2, "0")}`;
}

export function demoMovieName(seed: string, index: number): string {
  return `Feature ${String(index + 1).padStart(2, "0")} (2026)`;
}

export function demoSeriesName(seed: string, index: number): string {
  return `Series ${String(index + 1).padStart(2, "0")}`;
}

export function demoCategoryName(index: number): string {
  const names = [
    "Entertainment",
    "News",
    "Sport",
    "Documentary",
    "Kids",
    "Music",
    "Drama",
    "Comedy",
    "Classics",
    "World",
  ];
  return names[index % names.length];
}

/**
 * The colours generated artwork is drawn from.
 *
 * Brand blues and their neighbours, so a grid of them reads as one set
 * rather than as a colour chart — and so the screenshots look like this
 * app rather than like a placeholder library.
 */
const PAIRS: [string, string][] = [
  ["#0B3C72", "#1989C6"],
  ["#102A54", "#3EB9EB"],
  ["#17324F", "#2E7FB0"],
  ["#0A2744", "#1E6FA8"],
  ["#133B63", "#48A8D8"],
  ["#1A2F4A", "#2C6E9B"],
  ["#09325C", "#3A9ED0"],
  ["#14263F", "#256C9E"],
];

/** The two colours a given item's generated artwork uses. */
export function demoArtColors(seed: string): [string, string] {
  return PAIRS[hashIndex(seed, PAIRS.length)];
}
