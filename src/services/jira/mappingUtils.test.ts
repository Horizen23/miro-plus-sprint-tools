import { describe, it, expect } from 'vitest';
import { parseUserMapping, isUserOwnerOfCard, getCardMappedUser, getCardMappedUsers } from './mappingUtils';
import type { UserInfo } from "@mirohq/websdk-types";

describe('mappingUtils', () => {
  describe('parseUserMapping', () => {
    it('should parse valid mapping strings', () => {
      const mappingStr = 'tag1=user1\ntag2=user2@example.com';
      const mapping = parseUserMapping(mappingStr);
      expect(mapping.get('tag1')).toBe('user1');
      expect(mapping.get('tag2')).toBe('user2@example.com');
    });

    it('should handle empty mapping strings', () => {
      expect(parseUserMapping('').size).toBe(0);
      expect(parseUserMapping(undefined as any).size).toBe(0);
    });
  });

  describe('isUserOwnerOfCard', () => {
    const mockUserInfo: UserInfo = {
      id: 'user-id',
      name: 'Test User',
      type: 'user'
    } as any; // Cast for now as email is missing in the interface but exists in runtime

    const mapping = new Map([['my-tag', 'test-user-id']]);

    it('should return true if tag matches user id', () => {
      expect(isUserOwnerOfCard(['my-tag'], new Map([['my-tag', 'user-id']]), mockUserInfo)).toBe(true);
    });

    it('should return false if no tags match', () => {
      expect(isUserOwnerOfCard(['other-tag'], mapping, mockUserInfo)).toBe(false);
    });

    it('should handle null/undefined userInfo gracefully', () => {
      expect(isUserOwnerOfCard(['my-tag'], mapping, null)).toBe(false);
      expect(isUserOwnerOfCard(['my-tag'], mapping, undefined)).toBe(false);
    });
  });
});
