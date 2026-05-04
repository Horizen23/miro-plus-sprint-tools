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
  userInfo: any
): boolean {
  if (!userInfo) return false;

  const myId = userInfo.id;
  const myName = userInfo.name?.toLowerCase();
  const myEmail = (userInfo as any).email?.toLowerCase();

  // Ignore metadata tags
  const relevantTags = cardTags
    .map(t => t.toLowerCase())
    .filter(t => !t.startsWith('jira-'));

  for (const tag of relevantTags) {
    const mappedVal = mapping.get(tag);
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
 * @returns string | undefined
 */
export function getCardMappedUser(
  cardTags: string[],
  mapping: Map<string, string>
): string | undefined {
  const relevantTags = cardTags
    .map(t => t.toLowerCase())
    .filter(t => !t.startsWith('jira-'));

  for (const tag of relevantTags) {
    const val = mapping.get(tag);
    if (val) return val;
  }
  return undefined;
}
