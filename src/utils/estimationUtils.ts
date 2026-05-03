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

export const handleSetPointsOnItem = async (item: Card | AppCard, points: string) => {
  let currentTitle = (item.title || "").replace(/<[^>]*>/g, '');
  const isHour = points.endsWith('h');
  const rawValue = points.replace('h', '');
  const pointsStr = points === '?' ? '?' : (isHour ? `[${rawValue}h]` : `[${rawValue}]`);

  const bracketRegex = /^(\[\d+(?:\.\d+)?h?\]|\(\d+(?:\.\d+)?h?\))\s*/;
  const plainNumRegex = /^(\d+(?:\.\d+)?h?)\s+/;

  let newTitle = "";
  if (bracketRegex.test(currentTitle)) {
    newTitle = currentTitle.replace(bracketRegex, pointsStr + " ");
  } else if (plainNumRegex.test(currentTitle)) {
    newTitle = currentTitle.replace(plainNumRegex, pointsStr + " ");
  } else {
    newTitle = pointsStr + " " + currentTitle;
  }

  const newTitleFinal = newTitle.trim();
  console.log(`[DEBUG] Attempting to update card ${item.id}`);
  console.log(`[DEBUG] Old title: "${currentTitle}"`);
  console.log(`[DEBUG] New title: "${newTitleFinal}"`);
  
  try {
    await miro.board.notifications.showInfo(`Updating card: ${newTitleFinal}`);
    
    // Re-fetch the item to ensure we have the freshest instance before syncing
    const freshItem = await miro.board.getById(item.id) as any;
    if (freshItem) {
      console.log(`[DEBUG] Fresh item found. Current title on board: "${freshItem.title}"`);
      freshItem.title = newTitleFinal;
      await freshItem.sync();
      console.log(`[DEBUG] Sync completed successfully for ${item.id}`);
    } else {
      console.error(`[DEBUG] Could not re-fetch card ${item.id}`);
      item.title = newTitleFinal;
      if (item.sync) await item.sync();
    }
  } catch (e) {
    console.error("[DEBUG] Sync failed with error:", e);
    await miro.board.notifications.showError(`Update failed: ${String(e)}`);
    // Last resort fallback
    item.title = newTitleFinal;
    if (item.sync) await item.sync();
  }
};

export const calculateSelectionSummary = (items: (Card | AppCard)[]) => {
  let actualPointsSum = 0;
  let actualHoursSum = 0;
  const estRegex = /\[(\d+(?:\.\d+)?)(h?)\]|\((\d+(?:\.\d+)?)(h?)\)|^(\d+(?:\.\d+)?)(h?)\s/i;

  for (const item of items) {
    let itemEst = 0;
    let unit: 'pt' | 'h' = 'pt';
    let found = false;

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

    if (!found) {
      const title = (item.title || "").replace(/<[^>]*>/g, '');
      const match = title.match(estRegex);
      if (match) {
        const valStr = match[1] || match[3] || match[5];
        const unitStr = match[2] || match[4] || match[6];
        if (valStr) {
          itemEst = parseFloat(valStr);
          unit = unitStr?.toLowerCase() === 'h' ? 'h' : 'pt';
        }
      }
    }
    
    if (unit === 'h') actualHoursSum += itemEst;
    else actualPointsSum += itemEst;
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
