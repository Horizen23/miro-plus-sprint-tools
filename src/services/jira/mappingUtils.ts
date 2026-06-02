import type { UserInfo } from "@mirohq/websdk-types";

/**
 * Internal helper to get relevant tags by filtering out those matching ignoreRegex
 */
function getRelevantTags(cardTags: string[], ignoreRegex?: string): string[] {
  if (!ignoreRegex) return cardTags;
  try {
    const metadataRe = new RegExp(ignoreRegex, 'i');
    return cardTags.filter(t => !metadataRe.test(t));
  } catch (e) {
    console.warn(`[mappingUtils] Invalid ignoreRegex: ${ignoreRegex}`, e);
    return cardTags;
  }
}

/**
 * Parses the User Mapping string (tag=email) into a Map
 * @param mappingStr The raw mapping string from global config
 * @returns A Map of tag (lowercase) to email/name (lowercase)
 */
export function parseUserMapping(mappingStr: string = ""): Map<string, string> {
  const mapping = new Map<string, string>();
  if (!mappingStr) return mapping;

  mappingStr.split('\n').forEach((line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const tag = parts[0].trim().toLowerCase();
      const user = parts.slice(1).join('=').trim().toLowerCase();
      if (tag && user) {
        mapping.set(tag, user);
      }
    }
  });

  return mapping;
}

/**
 * Checks if a set of card tags matches a specific user identity
 */
export function isUserOwnerOfCard(
  cardTags: string[], 
  mapping: Map<string, string>, 
  userInfo: UserInfo | null | undefined,
  ignoreRegex?: string
): boolean {
  if (!userInfo) return false;

  const myId = userInfo.id;
  const myName = userInfo.name?.toLowerCase();
  
  // Safe extraction of email from unknown UserInfo
  const myEmail = (userInfo as Record<string, unknown>).email as string | undefined;
  const lowerEmail = myEmail?.toLowerCase();

  const relevantTags = getRelevantTags(cardTags, ignoreRegex);

  for (const tag of relevantTags) {
    const lowerTag = tag.toLowerCase();
    const mappedVal = mapping.get(lowerTag);
    if (mappedVal) {
      const lowerVal = mappedVal.toLowerCase();
      if (lowerEmail && lowerVal === lowerEmail) return true;
      if (myName && lowerVal === myName) return true;
      if (lowerVal === myId) return true;
    }
  }

  return false;
}

/**
 * Gets the mapped user identity (email/name) for a card
 */
export function getCardMappedUser(
  cardTags: string[],
  mapping: Map<string, string>,
  ignoreRegex?: string
): string | undefined {
  const relevantTags = getRelevantTags(cardTags, ignoreRegex);

  for (const tag of relevantTags) {
    const lowerTag = tag.toLowerCase();
    const val = mapping.get(lowerTag);
    if (val) return val;
  }
  return undefined;
}

/**
 * Gets ALL mapped user identities for a card
 */
export function getCardMappedUsers(
  cardTags: string[],
  mapping: Map<string, string>,
  ignoreRegex?: string
): string[] {
  const relevantTags = getRelevantTags(cardTags, ignoreRegex);
  const users: string[] = [];
  
  for (const tag of relevantTags) {
    const val = mapping.get(tag.toLowerCase());
    if (val && !users.includes(val)) {
      users.push(val);
    }
  }
  return users;
}
