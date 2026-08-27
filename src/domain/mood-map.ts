export const STREAMALL_MOODS = ["Zen", "Cool", "Groovy", "Planant", "Sombre", "Énergique", "Euphorique", "Teuf"] as const;
export type StreamallMood = (typeof STREAMALL_MOODS)[number];
export type GenreMoodMap = Record<string, string[]>;

export type GenreMoodGroup = {
  label: string;
  rows: Array<{ genre: string; moods: StreamallMood[] }>;
};

export const GENRE_MOOD_GROUPS: GenreMoodGroup[] = [
  {
    label: "Ambient · Chill · Electronica",
    rows: [
      { genre: "Ambient", moods: ["Zen", "Cool", "Planant"] },
      { genre: "Dark Ambient", moods: ["Zen", "Planant", "Sombre"] },
      { genre: "Drone", moods: ["Zen", "Planant", "Sombre"] },
      { genre: "Chillout", moods: ["Zen", "Cool", "Planant"] },
      { genre: "Downtempo", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "Trip-Hop", moods: ["Cool", "Groovy", "Sombre"] },
      { genre: "Electronic", moods: ["Groovy", "Planant"] },
      { genre: "Electronica", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "IDM", moods: ["Groovy", "Planant", "Sombre"] },
      { genre: "Glitch", moods: ["Groovy", "Planant", "Énergique"] },
      { genre: "Experimental Electronic", moods: ["Planant", "Sombre"] },
    ],
  },
  {
    label: "Dub · Reggae · Soundsystem",
    rows: [
      { genre: "Dub", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "Dub Techno", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "Reggae", moods: ["Zen", "Cool", "Groovy"] },
      { genre: "Roots Reggae", moods: ["Zen", "Cool", "Groovy"] },
      { genre: "Dancehall / Ragga", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Ska", moods: ["Groovy", "Énergique", "Euphorique"] },
    ],
  },
  {
    label: "House · Techno · Trance",
    rows: [
      { genre: "Techno", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Minimal Techno", moods: ["Groovy", "Planant", "Teuf"] },
      { genre: "Detroit Techno", moods: ["Groovy", "Planant", "Teuf"] },
      { genre: "Industrial Techno", moods: ["Sombre", "Énergique", "Teuf"] },
      { genre: "Acid Techno", moods: ["Sombre", "Énergique", "Teuf"] },
      { genre: "House", moods: ["Groovy", "Euphorique", "Teuf"] },
      { genre: "Deep House", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "Tech House", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Acid House", moods: ["Groovy", "Planant", "Teuf"] },
      { genre: "Progressive House", moods: ["Planant", "Euphorique", "Teuf"] },
      { genre: "Trance", moods: ["Planant", "Euphorique", "Teuf"] },
      { genre: "Progressive Trance", moods: ["Planant", "Euphorique", "Teuf"] },
      { genre: "Psytrance", moods: ["Planant", "Énergique", "Teuf"] },
      { genre: "Goa Trance", moods: ["Planant", "Euphorique", "Teuf"] },
      { genre: "Hard Trance", moods: ["Énergique", "Euphorique", "Teuf"] },
      { genre: "Hardcore / Gabber", moods: ["Sombre", "Énergique", "Teuf"] },
      { genre: "Hardstyle", moods: ["Énergique", "Euphorique", "Teuf"] },
    ],
  },
  {
    label: "Breaks · Bass · UK",
    rows: [
      { genre: "Electro", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Electroclash", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Breakbeat", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Big Beat", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "UK Garage", moods: ["Cool", "Groovy", "Teuf"] },
      { genre: "2-Step", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "Jungle", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Drum & Bass", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Liquid Drum & Bass", moods: ["Cool", "Planant", "Énergique", "Euphorique"] },
      { genre: "Atmospheric DnB", moods: ["Cool", "Planant", "Énergique"] },
      { genre: "Neurofunk", moods: ["Sombre", "Énergique", "Teuf"] },
      { genre: "Darkstep", moods: ["Sombre", "Énergique", "Teuf"] },
      { genre: "Breakcore", moods: ["Sombre", "Énergique", "Teuf"] },
      { genre: "Dubstep", moods: ["Sombre", "Énergique", "Teuf"] },
      { genre: "Deep Dubstep", moods: ["Groovy", "Planant", "Sombre"] },
      { genre: "UK Bass", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Grime", moods: ["Groovy", "Sombre", "Énergique"] },
    ],
  },
  {
    label: "Hip-Hop · Beats",
    rows: [
      { genre: "Hip-Hop", moods: ["Cool", "Groovy"] },
      { genre: "Boom Bap", moods: ["Cool", "Groovy"] },
      { genre: "Abstract Hip-Hop", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "Instrumental Hip-Hop", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "Trap", moods: ["Groovy", "Sombre", "Énergique"] },
      { genre: "Drill", moods: ["Groovy", "Sombre", "Énergique"] },
      { genre: "G-Funk", moods: ["Cool", "Groovy"] },
    ],
  },
  {
    label: "Funk · Soul · Jazz · Groove",
    rows: [
      { genre: "Funk", moods: ["Cool", "Groovy", "Euphorique"] },
      { genre: "Soul", moods: ["Zen", "Cool", "Groovy"] },
      { genre: "R&B", moods: ["Cool", "Groovy"] },
      { genre: "Neo-Soul", moods: ["Zen", "Cool", "Groovy"] },
      { genre: "Disco", moods: ["Groovy", "Euphorique", "Teuf"] },
      { genre: "Nu-Disco", moods: ["Groovy", "Euphorique", "Teuf"] },
      { genre: "Afrobeat", moods: ["Groovy", "Énergique", "Euphorique"] },
      { genre: "Reggaeton", moods: ["Groovy", "Énergique", "Teuf"] },
      { genre: "Latin", moods: ["Groovy", "Énergique", "Euphorique"] },
      { genre: "Jazz", moods: ["Zen", "Cool", "Groovy"] },
      { genre: "Nu Jazz", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "Jazz Fusion", moods: ["Cool", "Groovy", "Énergique"] },
      { genre: "Free Jazz", moods: ["Groovy", "Planant", "Sombre", "Énergique"] },
      { genre: "Blues", moods: ["Cool", "Groovy", "Sombre"] },
    ],
  },
  {
    label: "Rock · Punk · Metal · Industrial",
    rows: [
      { genre: "Rock", moods: ["Groovy", "Énergique"] },
      { genre: "Alternative Rock", moods: ["Cool", "Sombre", "Énergique"] },
      { genre: "Indie Rock", moods: ["Cool", "Énergique", "Euphorique"] },
      { genre: "Psychedelic Rock", moods: ["Groovy", "Planant", "Sombre"] },
      { genre: "Post-Rock", moods: ["Planant", "Sombre", "Euphorique"] },
      { genre: "Progressive Rock", moods: ["Groovy", "Planant", "Énergique"] },
      { genre: "Punk", moods: ["Énergique", "Teuf"] },
      { genre: "Post-Punk", moods: ["Groovy", "Sombre", "Énergique"] },
      { genre: "Metal", moods: ["Sombre", "Énergique"] },
      { genre: "Heavy Metal", moods: ["Sombre", "Énergique"] },
      { genre: "Industrial", moods: ["Groovy", "Sombre", "Énergique"] },
      { genre: "Industrial Rock", moods: ["Sombre", "Énergique"] },
      { genre: "Noise", moods: ["Planant", "Sombre", "Énergique"] },
      { genre: "Shoegaze", moods: ["Cool", "Planant", "Sombre"] },
    ],
  },
  {
    label: "Pop · Synth · New Wave",
    rows: [
      { genre: "Synthpop", moods: ["Cool", "Groovy", "Euphorique"] },
      { genre: "Synthwave", moods: ["Cool", "Planant", "Énergique"] },
      { genre: "New Wave", moods: ["Cool", "Groovy", "Énergique"] },
      { genre: "Pop", moods: ["Cool", "Groovy", "Euphorique"] },
      { genre: "Dance Pop", moods: ["Groovy", "Énergique", "Euphorique", "Teuf"] },
    ],
  },
  {
    label: "Acoustique · World · Classique · Cinématique",
    rows: [
      { genre: "Folk", moods: ["Zen", "Cool"] },
      { genre: "Acoustic", moods: ["Zen", "Cool"] },
      { genre: "World / Ethnic", moods: ["Cool", "Groovy", "Planant"] },
      { genre: "Classical", moods: ["Zen", "Planant"] },
      { genre: "Contemporary Classical", moods: ["Zen", "Planant", "Sombre"] },
      { genre: "Minimalism", moods: ["Zen", "Planant"] },
      { genre: "Orchestral", moods: ["Planant", "Sombre", "Euphorique"] },
      { genre: "Cinematic / Soundtrack", moods: ["Planant", "Sombre", "Euphorique"] },
    ],
  },
  {
    label: "Expérimental · Avant-garde",
    rows: [
      { genre: "Experimental", moods: ["Planant", "Sombre"] },
      { genre: "Avant-Garde", moods: ["Planant", "Sombre", "Énergique"] },
    ],
  },
];

export const DEFAULT_GENRE_MOOD_MAP: GenreMoodMap = Object.fromEntries(
  GENRE_MOOD_GROUPS.flatMap((group) => group.rows.map((row) => [row.genre, [...row.moods]])),
);

export function normalizeGenreKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bdnb\b/g, "drum and bass")
    .replace(/\bdrum n bass\b/g, "drum and bass")
    .replace(/\brnb\b/g, "r and b")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function moodIndex(map: GenreMoodMap) {
  const index = new Map<string, string[]>();
  for (const [genre, moods] of Object.entries(map)) index.set(normalizeGenreKey(genre), moods);
  return index;
}

export function effectiveGenreMoodMap(custom?: GenreMoodMap): GenreMoodMap {
  if (!custom) return structuredClone(DEFAULT_GENRE_MOOD_MAP);
  const merged = structuredClone(DEFAULT_GENRE_MOOD_MAP);
  const byKey = new Map(Object.keys(merged).map((genre) => [normalizeGenreKey(genre), genre]));
  for (const [genre, moods] of Object.entries(custom)) {
    const canonical = byKey.get(normalizeGenreKey(genre));
    if (canonical) merged[canonical] = [...moods];
    else merged[genre] = [...moods];
  }
  return merged;
}

export function moodsForGenres(genres: string[], custom?: GenreMoodMap) {
  const index = moodIndex(effectiveGenreMoodMap(custom));
  const selected = new Set<string>();
  for (const genre of genres) {
    for (const mood of index.get(normalizeGenreKey(genre)) ?? []) selected.add(mood);
  }
  return STREAMALL_MOODS.filter((mood) => selected.has(mood));
}
