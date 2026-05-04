import type { Card, AppCard } from "@mirohq/websdk-types";

export const mapHoursToPoints = (h: number): number => {
  if (h <= 0) return 0;
  
  // Parse mapping from env: "2:2,4:3,6:5..."
  const mappingStr = process.env.NEXT_PUBLIC_HOURS_TO_POINTS_MAPPING || "2:2,4:3,6:5,10:8,16:13,26:21,42:34,68:55,109:89,175:144,283:233,458:377";
  const pairs = mappingStr.split(',').map(p => p.split(':').map(Number));
  
  for (const [hourLimit, points] of pairs) {
    if (h <= hourLimit) return points;
  }
  
  return 0;
};

export const mapPointsToHours = (p: number): [number, number] => {
  if (p <= 0) return [0, 0];
  
  const mappingStr = process.env.NEXT_PUBLIC_HOURS_TO_POINTS_MAPPING || "2:2,4:3,6:5,10:8,16:13,26:21,42:34,68:55,109:89,175:144,283:233,458:377";
  const pairs = mappingStr.split(',').map(p => p.split(':').map(Number));
  
  let lowerLimit = 0;
  for (const [hourLimit, points] of pairs) {
    if (p <= points) {
      return [lowerLimit + 1, hourLimit];
    }
    lowerLimit = hourLimit;
  }
  
  return [0, 0];
};

export const getBucketedPoint = (sum: number): number => {
  const scaleStr = process.env.NEXT_PUBLIC_FIBONACCI_SCALE || "0,1,2,3,5,8,13,21,34,55,89,144,233,377";
  const scale = scaleStr.split(',').map(Number).sort((a, b) => b - a);
  
  for (const f of scale) {
    if (sum >= f) return f;
  }
  return sum > 0 ? scale[scale.length - 1] : 0;
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
export const parseCardTitle = (title: string): CardTitleData => {
  // Deep clean HTML and common entities
  const rawTitle = (title || "")
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  
  console.log(`[DEBUG] Parsing title: "${rawTitle}"`);

  // Optimized pattern:
  // - Group 1: Sequence (optional, can be empty [])
  // - Group 2: Estimate (required bracket with numbers/h)
  // - Group 3: Clean Title
  const pattern = /^\s*(?:\[([A-Za-z\d.]*)\])?\s*\[(\d+(?:\.\d+)?h?)\]\s*(.*)$/;
  const match = rawTitle.match(pattern);

  if (match) {
    const res = {
      // If match[1] is undefined, the first bracket was missing.
      // If it's a string (even empty), the bracket was present.
      seq: match[1] === undefined ? (null as any) : match[1],
      estimate: match[2] || "",
      cleanTitle: match[3] || ""
    };
    console.log(`[DEBUG] Full Match:`, res);
    return res;
  }

  // Fallback 1: Only one bracket (Assume it's estimate if it's numeric/h)
  const singleBracketPattern = /^\s*\[(\d+(?:\.\d+)?h?)\]\s*(.*)$/;
  const singleMatch = rawTitle.match(singleBracketPattern);
  if (singleMatch) {
    const res = {
      seq: "",
      estimate: singleMatch[1] || "",
      cleanTitle: singleMatch[2] || ""
    };
    console.log(`[DEBUG] Estimate Only Match:`, res);
    return res;
  }

  // Fallback 2: Sequence only (e.g. [A1.0] Task)
  const seqOnlyPattern = /^\s*\[([A-Za-z]+\d+(?:\.\d+)?)\]\s*(.*)$/;
  const seqMatch = rawTitle.match(seqOnlyPattern);
  if (seqMatch) {
    const res = {
      seq: seqMatch[1] || "",
      estimate: "",
      cleanTitle: seqMatch[2] || ""
    };
    console.log(`[DEBUG] Seq Only Match:`, res);
    return res;
  }

  const res = {
    seq: "",
    estimate: "",
    cleanTitle: rawTitle
  };
  console.log(`[DEBUG] No Match fallback:`, res);
  return res;
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

export const handleSetPointsOnItem = async (item: Card | AppCard, points: string) => {
  const currentTitle = item.title || "";
  const { seq, cleanTitle } = parseCardTitle(currentTitle);
  
  const newEstimate = points === '?' ? '?' : points;

  const newTitleFinal = formatCardTitle({
    seq: seq, 
    estimate: newEstimate,
    cleanTitle: cleanTitle
  });
  
  console.log(`[DEBUG] handleSetPointsOnItem - Card: ${item.id}`);
  console.log(`[DEBUG] Old Title: "${currentTitle}"`);
  console.log(`[DEBUG] New Title: "${newTitleFinal}"`);

  try {
    const freshItem = await miro.board.getById(item.id) as any;
    if (freshItem) {
      freshItem.title = newTitleFinal;
      await freshItem.sync();
    }
  } catch (e) {
    console.error("[DEBUG] Sync failed:", e);
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
      console.log(`[DEBUG] Item ${item.id} found estimate: ${itemEst}${unit}`);
      if (unit === 'h') actualHoursSum += itemEst;
      else actualPointsSum += itemEst;
    }
  }

  const pointsFromHours = mapHoursToPoints(actualHoursSum);
  const totalPointsRaw = actualPointsSum + pointsFromHours;
  const bucketedPoint = getBucketedPoint(totalPointsRaw);
  const hourRange = mapPointsToHours(bucketedPoint);

  console.log(`[DEBUG] Summary Calculation:`);
  console.log(`- Total Items: ${items.length}`);
  console.log(`- Raw Hours Sum: ${actualHoursSum}`);
  console.log(`- Raw Points Sum: ${actualPointsSum}`);
  console.log(`- Total Points (incl. mapped hours): ${totalPointsRaw}`);

  return {
    count: items.length,
    points: totalPointsRaw,
    bucketedPoint,
    hourRange,
    actualHours: actualHoursSum
  };
};
