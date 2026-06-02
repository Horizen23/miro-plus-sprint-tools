import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVotingMetadata, saveVotingMetadata, findActiveVotingSession } from './votingUtils';
import { RealtimeFactory } from '../realtime/factory';

const mockRealtime = {
  updateState: vi.fn(),
  endSession: vi.fn(),
};

vi.mock('../realtime/factory', () => ({
  RealtimeFactory: {
    getInstance: vi.fn(() => mockRealtime),
  },
}));

const mockMiro = {
  board: {
    getSelection: vi.fn(),
    get: vi.fn(),
  },
};

vi.stubGlobal('miro', mockMiro);

describe('votingUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getVotingMetadata', () => {
    it('returns metadata when it exists and is valid', async () => {
      const mockCard = {
        id: 'card-1',
        getMetadata: vi.fn().mockResolvedValue({ status: 'voting', cardId: 'card-1' }),
      } as any;

      const result = await getVotingMetadata(mockCard);
      expect(result).toEqual({ status: 'voting', cardId: 'card-1' });
      expect(mockCard.getMetadata).toHaveBeenCalledWith('plus-sprint-tools');
    });

    it('returns null when metadata is missing or invalid', async () => {
      const mockCard = {
        id: 'card-1',
        getMetadata: vi.fn().mockResolvedValue(null),
      } as any;

      const result = await getVotingMetadata(mockCard);
      expect(result).toBeNull();
    });

    it('returns null and warns when getMetadata fails', async () => {
      const mockCard = {
        id: 'card-1',
        getMetadata: vi.fn().mockRejectedValue(new Error('Failed')),
      } as any;
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await getVotingMetadata(mockCard);
      expect(result).toBeNull();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('saveVotingMetadata', () => {
    it('saves metadata and updates realtime when session is provided', async () => {
      const mockCard = {
        id: 'card-1',
        setMetadata: vi.fn().mockResolvedValue(undefined),
      } as any;
      const session = { cardId: 'card-1', status: 'voting', votes: {} } as any;
      const mockRealtime = RealtimeFactory.getInstance();

      await saveVotingMetadata(mockCard, session);

      expect(mockCard.setMetadata).toHaveBeenCalledWith('plus-sprint-tools', session);
      expect(mockRealtime.updateState).toHaveBeenCalledWith('card-1', expect.objectContaining({
        cardId: 'card-1',
        status: 'voting',
      }));
    });

    it('clears metadata and ends session in realtime when session is null', async () => {
      const mockCard = {
        id: 'card-1',
        setMetadata: vi.fn().mockResolvedValue(undefined),
      } as any;
      const mockRealtime = RealtimeFactory.getInstance();

      await saveVotingMetadata(mockCard, null);

      expect(mockCard.setMetadata).toHaveBeenCalledWith('plus-sprint-tools', null);
      expect(mockRealtime.endSession).toHaveBeenCalledWith('card-1');
    });

    it('throws error when setMetadata fails', async () => {
      const mockCard = {
        id: 'card-1',
        setMetadata: vi.fn().mockRejectedValue(new Error('Failed')),
      } as any;

      await expect(saveVotingMetadata(mockCard, null)).rejects.toThrow('Failed');
    });
  });

  describe('findActiveVotingSession', () => {
    it('returns null if miro is undefined', async () => {
      const originalMiro = global.miro;
      (global as any).miro = undefined;
      const result = await findActiveVotingSession();
      expect(result).toBeNull();
      (global as any).miro = originalMiro;
    });

    it('finds session from current selection', async () => {
      const mockCard = {
        type: 'card',
        getMetadata: vi.fn().mockResolvedValue({ status: 'voting', cardId: 'card-1' }),
      };
      mockMiro.board.getSelection.mockResolvedValue([mockCard]);

      const result = await findActiveVotingSession();
      expect(result).toEqual({ status: 'voting', cardId: 'card-1' });
    });

    it('searches all cards if selection has no session', async () => {
      mockMiro.board.getSelection.mockResolvedValue([]);
      const mockCard1 = {
        type: 'card',
        id: '1',
        getMetadata: vi.fn().mockResolvedValue(null),
      };
      const mockCard2 = {
        type: 'card',
        id: '2',
        getMetadata: vi.fn().mockResolvedValue({ status: 'revealed', cardId: 'card-2' }),
      };
      mockMiro.board.get.mockImplementation(({ type }) => {
        if (type === 'card') return Promise.resolve([mockCard1, mockCard2]);
        return Promise.resolve([]);
      });

      const result = await findActiveVotingSession();
      expect(result).toEqual({ status: 'revealed', cardId: 'card-2' });
    });

    it('returns null if no active session is found', async () => {
      mockMiro.board.getSelection.mockResolvedValue([]);
      mockMiro.board.get.mockResolvedValue([]);
      const result = await findActiveVotingSession();
      expect(result).toBeNull();
    });
  });
});
