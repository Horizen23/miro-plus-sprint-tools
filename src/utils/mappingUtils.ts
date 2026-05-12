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
 * @param cardTags List of tag titles on the card
 * @param mapping Parsed mapping from parseUserMapping
 * @param userInfo Miro UserInfo object
 * @returns boolean
 */
export function isUserOwnerOfCard(
  cardTags: string[], 
  mapping: Map<string, string>, 
  userInfo: any,
  ignoreRegex?: string
): boolean {
  if (!userInfo) return false;

  const myId = userInfo.id;
  const myName = userInfo.name?.toLowerCase();
  const myEmail = (userInfo as any).email?.toLowerCase();

  // Create Regex for metadata tags if provided
  let metadataRe: RegExp | null = null;
  if (ignoreRegex) {
    try { metadataRe = new RegExp(ignoreRegex, 'i'); } catch(e) {}
  }

  // Ignore tags matching the regex if defined
  const relevantTags = metadataRe 
    ? cardTags.filter(t => !metadataRe!.test(t))
    : cardTags;

  for (const tag of relevantTags) {
    const lowerTag = tag.toLowerCase();
    const mappedVal = mapping.get(lowerTag);
    if (mappedVal) {
      const lowerVal = mappedVal.toLowerCase();
      if (myEmail && lowerVal === myEmail) return true;
      if (myName && lowerVal === myName) return true;
      if (lowerVal === myId) return true;
    }
  }

  return false;
}

/**
 * Gets the mapped user identity (email/name) for a card
 * @param cardTags List of tag titles on the card
 * @param mapping Parsed mapping
 * @param ignoreRegex Optional regex to ignore specific tags
 * @returns string | undefined
 */
export function getCardMappedUser(
  cardTags: string[],
  mapping: Map<string, string>,
  ignoreRegex?: string
): string | undefined {
  // Create Regex for metadata tags if provided
  let metadataRe: RegExp | null = null;
  if (ignoreRegex) {
    try { metadataRe = new RegExp(ignoreRegex, 'i'); } catch(e) {}
  }

  const relevantTags = metadataRe
    ? cardTags.filter(t => !metadataRe!.test(t))
    : cardTags;

  for (const tag of relevantTags) {
    const lowerTag = tag.toLowerCase();
    const val = mapping.get(lowerTag);
    if (val) return val;
  }
  return undefined;
}

/**
 * Gets ALL mapped user identities for a card
 * @returns string[]
 */
export function getCardMappedUsers(
  cardTags: string[],
  mapping: Map<string, string>,
  ignoreRegex?: string
): string[] {
  let metadataRe: RegExp | null = null;
  if (ignoreRegex) {
    try { metadataRe = new RegExp(ignoreRegex, 'i'); } catch(e) {}
  }

  const relevantTags = metadataRe
    ? cardTags.filter(t => !metadataRe!.test(t))
    : cardTags;

  const users: string[] = [];
  for (const tag of relevantTags) {
    const val = mapping.get(tag.toLowerCase());
    if (val && !users.includes(val)) {
      users.push(val);
    }
  }
  return users;
}
