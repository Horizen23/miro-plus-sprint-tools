import type { Card, AppCard } from "@mirohq/websdk-types";

// Pre-parse mappings once at the top level to avoid repeated split/map/Number calls
const HOURS_TO_POINTS_PAIRS = (process.env.NEXT_PUBLIC_HOURS_TO_POINTS_MAPPING || "2:2,4:3,6:5,10:8,16:13,26:21,42:34,68:55,109:89,175:144,283:233,458:377")
  .split(',')
  .map(p => p.split(':').map(Number));

const FIBONACCI_SCALE = (process.env.NEXT_PUBLIC_FIBONACCI_SCALE || "0,1,2,3,5,8,13,21,34,55,89,144,233,377")
  .split(',')
  .map(Number)
  .sort((a, b) => b - a);

export const mapHoursToPoints = (h: number): number => {
  if (h <= 0) return 0;
  for (const [hourLimit, points] of HOURS_TO_POINTS_PAIRS) {
    if (h <= hourLimit) return points;
  }
  return 0;
};

export const mapPointsToHours = (p: number): [number, number] => {
  if (p <= 0) return [0, 0];
  let lowerLimit = 0;
  for (const [hourLimit, points] of HOURS_TO_POINTS_PAIRS) {
    if (p <= points) {
      return [lowerLimit + 1, hourLimit];
    }
    lowerLimit = hourLimit;
  }
  return [0, 0];
};

export const getBucketedPoint = (sum: number): number => {
  for (const f of FIBONACCI_SCALE) {
    if (sum >= f) return f;
  }
  return sum > 0 ? FIBONACCI_SCALE[FIBONACCI_SCALE.length - 1] : 0;
};

export interface CardTitleData {
  seq: string;
  estimate: string;
  cleanTitle: string;
}

/**
 * Parses a card title into its components: sequence, estimate, and the actual title text.
 * Pattern: [SEQ][EST] Title
 */
// Pre-compile regular expressions for title parsing to improve O(N) performance
const RE_HTML = /<[^>]*>/g;
const RE_NBSP = /&nbsp;/g;
const RE_QUOTE = /&#39;/g;
const RE_DQUOTE = /&quot;/g;
const RE_AMP = /&amp;/g;
const RE_LT = /&lt;/g;
const RE_GT = /&gt;/g;
const RE_MAIN_PATTERN = /^\s*(?:\[([A-Za-z\d.]*)\])?\s*\[(\d+(?:\.\d+)?h?|\?)\]\s*(.*)$/;
const RE_SINGLE_BRACKET = /^\s*\[(\d+(?:\.\d+)?h?|\?)\]\s*(.*)$/;
const RE_SEQ_ONLY = /^\s*\[([A-Za-z]+\d+(?:\.\d+)?)\]\s*(.*)$/;

export const parseCardTitle = (title: string): CardTitleData => {
  const rawTitle = (title || "")
    .replace(RE_HTML, '')
    .replace(RE_NBSP, ' ')
    .replace(RE_QUOTE, "'")
    .replace(RE_DQUOTE, '"')
    .replace(RE_AMP, '&')
    .replace(RE_LT, '<')
    .replace(RE_GT, '>')
    .trim();

  // Aggressive cleaning loop: Strip any leading [tags] that might be duplicated
  let cleaned = rawTitle;
  const RE_LEADING_BRACKET = /^\s*\[[^\]]+\]\s*/;
  while (RE_LEADING_BRACKET.test(cleaned)) {
    cleaned = cleaned.replace(RE_LEADING_BRACKET, '').trim();
  }
  
  // Use the cleaned version for the title part of the result
  const match = rawTitle.match(RE_MAIN_PATTERN);
  if (match) {
    return {
      seq: match[1] === undefined ? "" : match[1],
      estimate: match[2] || "",
      cleanTitle: cleaned
    };
  }

  const singleMatch = rawTitle.match(RE_SINGLE_BRACKET);
  if (singleMatch) {
    return { seq: "", estimate: singleMatch[1] || "", cleanTitle: cleaned };
  }

  const seqMatch = rawTitle.match(RE_SEQ_ONLY);
  if (seqMatch) {
    return { seq: seqMatch[1] || "", estimate: "", cleanTitle: cleaned };
  }

  return { seq: "", estimate: "", cleanTitle: cleaned };
};

/**
 * Compares two sequences based on the requested priority:
 * 1. Dev tasks (with sequence, no 'T' prefix)
 * 2. No sequence / Empty brackets
 * 3. Test tasks (starting with 'T')
 */
export const compareSequences = (seqA: string | null, seqB: string | null): number => {
  const getCategory = (s: string | null) => {
    if (!s || s.trim() === "") return 2; // No Seq / Empty
    if (s.toUpperCase().startsWith('T')) return 3; // Test
    return 1; // Dev
  };

  const catA = getCategory(seqA);
  const catB = getCategory(seqB);

  if (catA !== catB) return catA - catB;

  // If same category, compare the actual string content
  const a = (seqA || "").toUpperCase();
  const b = (seqB || "").toUpperCase();
  
  // Natural sort for strings like A1.0, A1.10
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

/**
 * Increments a sequence string (e.g., A1.0 -> A1.1, A1.9 -> A1.10)
 */
export const incrementSequence = (seq: string | null): string => {
  if (!seq || seq.trim() === "") return "A1.0";

  // Regex to match Prefix, Major number, and optional Minor number
  // Example: TA1.0 -> Group 1: TA, Group 2: 1, Group 3: 0
  const pattern = /^([A-Za-z]*)(\d+)(?:\.(\d+))?$/;
  const match = seq.match(pattern);

  if (!match) return seq; // Fallback if no numbers found

  const prefix = match[1] || "";
  const major = parseInt(match[2], 10);
  const minorStr = match[3];

  if (minorStr !== undefined) {
    // If there's a minor version (e.g., .0), increment it
    const minor = parseInt(minorStr, 10);
    return `${prefix}${major}.${minor + 1}`;
  } else {
    // If only major version (e.g., A1), increment major
    return `${prefix}${major + 1}`;
  }
};

/**
 * Formats components into a standardized card title.
 */
export const formatCardTitle = (data: CardTitleData): string => {
  const seqPart = data.seq !== null ? `[${data.seq}]` : "";
  const estPart = data.estimate ? `[${data.estimate}]` : "";
  
  // Format as [SEQ][EST] Title
  return `${seqPart}${estPart} ${data.cleanTitle}`.trim();
};

export const handleSetPointsOnItems = async (items: (Card | AppCard)[], points: string) => {
  if (items.length === 0) return;
  const itemIds = items.map(i => i.id);

  try {
    const freshItems = await miro.board.get({ id: itemIds }) as any[];
    await Promise.all(freshItems.map(async (freshItem) => {
      const { seq, cleanTitle } = parseCardTitle(freshItem.title || "");
      freshItem.title = formatCardTitle({
        seq, 
        estimate: points === '?' ? '?' : points,
        cleanTitle
      });
      return freshItem.sync();
    }));
  } catch (e) {
    console.error("[DEBUG] Batch Sync failed:", e);
    throw e;
  }
};

export const calculateSelectionSummary = (items: (Card | AppCard)[]) => {
  let actualPointsSum = 0;
  let actualHoursSum = 0;

  for (const item of items) {
    let itemEst = 0;
    let unit: 'pt' | 'h' = 'pt';
    let found = false;

    // 1. Check App Card Fields first
    if (item.type === 'app_card' && (item as any).fields && (item as any).fields.length > 0) {
      (item as any).fields.forEach((field: any) => {
        if (field.value) {
          const val = parseFloat(field.value);
          if (!isNaN(val)) {
            itemEst = val;
            unit = field.value.toLowerCase().includes('h') ? 'h' : 'pt';
            found = true;
          }
        }
      });
    }

    // 2. Check Title using central parser
    if (!found) {
      const { estimate } = parseCardTitle(item.title || "");
      if (estimate) {
        const valStr = estimate.replace('h', '');
        itemEst = parseFloat(valStr);
        if (!isNaN(itemEst)) {
          unit = estimate.toLowerCase().includes('h') ? 'h' : 'pt';
          found = true;
        }
      }
    }
    
    if (found) {
      if (unit === 'h') actualHoursSum += itemEst;
      else actualPointsSum += itemEst;
    }
  }

  const pointsFromHours = mapHoursToPoints(actualHoursSum);
  const totalPointsRaw = actualPointsSum + pointsFromHours;
  const bucketedPoint = getBucketedPoint(totalPointsRaw);
  const hourRange = mapPointsToHours(bucketedPoint);


  return {
    count: items.length,
    points: totalPointsRaw,
    bucketedPoint,
    hourRange,
    actualHours: actualHoursSum
  };
};
