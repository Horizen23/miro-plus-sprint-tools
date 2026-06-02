import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('http', () => {
  const mockServer = {
    once: vi.fn().mockReturnThis(),
    listen: vi.fn().mockReturnThis(),
  };
  return {
    createServer: vi.fn(() => mockServer),
    default: {
      createServer: vi.fn(() => mockServer),
    },
  };
});

vi.mock('next', () => {
  const handle = vi.fn();
  const app = {
    prepare: vi.fn().mockResolvedValue(undefined),
    getRequestHandler: vi.fn(() => handle),
  };
  return {
    __esModule: true,
    default: vi.fn(() => app),
  };
});

const mockEmit = vi.fn();
const mockTo = vi.fn(() => ({ emit: mockEmit }));
const mockJoin = vi.fn();
const mockSocket = {
  id: 'test-socket-id',
  join: mockJoin,
  on: vi.fn(),
  emit: mockEmit,
};

vi.mock('socket.io', () => {
  const Server = vi.fn(function(this: any) {
    this.on = vi.fn((event, callback) => {
      if (event === 'connection') {
        callback(mockSocket);
      }
    });
    this.to = mockTo;
    this.emit = mockEmit;
    return this;
  });
  return {
    Server,
    default: { Server },
  };
});

describe('server.ts socket handlers', () => {
  let handlers: Record<string, Function> = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    handlers = {};
    
    // Capture the handlers registered on the socket
    (mockSocket.on as any).mockImplementation((event: string, handler: Function) => {
      handlers[event] = handler;
    });

    // Import server.ts to trigger the setup
    await import('./server');
    
    // Give it a tick to resolve promises
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles join-board', () => {
    if (handlers['join-board']) {
      handlers['join-board']('test-board');
      expect(mockJoin).toHaveBeenCalledWith('board-test-board');
    } else {
      throw new Error('join-board handler not registered');
    }
  });

  it('handles join-session and emits state', () => {
    const cardId = 'card-1';
    const userId = 'user-1';
    
    if (handlers['join-session']) {
      handlers['join-session']({ cardId, userId });
      expect(mockJoin).toHaveBeenCalledWith(`session-${cardId}`);
    } else {
      throw new Error('join-session handler not registered');
    }
  });

  it('handles update-voting-state', () => {
    const cardId = 'card-1';
    const state = { cardId, status: 'voting', votes: {} };
    
    if (handlers['update-voting-state']) {
      handlers['update-voting-state']({ cardId, state });
      // It should emit to the board (if joined) or globally
      expect(mockEmit).toHaveBeenCalledWith('voting-state-updated', state);
    } else {
      throw new Error('update-voting-state handler not registered');
    }
  });

  it('handles cast-vote', () => {
    const cardId = 'card-1';
    const state = { cardId, status: 'voting', votes: {} };
    
    // First set a state
    if (handlers['update-voting-state']) {
      handlers['update-voting-state']({ cardId, state });
    }

    if (handlers['cast-vote']) {
      handlers['cast-vote']({ cardId, userId: 'user-1', vote: '5' });
      expect(mockEmit).toHaveBeenCalledWith('voting-state-updated', expect.objectContaining({
        votes: { 'user-1': '5' }
      }));
    } else {
      throw new Error('cast-vote handler not registered');
    }
  });

  it('handles join-auth', () => {
    const state = 'test-state';
    if (handlers['join-auth']) {
      handlers['join-auth'](state);
      expect(mockJoin).toHaveBeenCalledWith(`auth-${state}`);
    } else {
      throw new Error('join-auth handler not registered');
    }
  });

  it('handles complete-auth', () => {
    const state = 'test-state';
    const code = 'test-code';
    if (handlers['complete-auth']) {
      handlers['complete-auth']({ state, code });
      expect(mockTo).toHaveBeenCalledWith(`auth-${state}`);
      expect(mockEmit).toHaveBeenCalledWith('auth-success', { state, code });
    } else {
      throw new Error('complete-auth handler not registered');
    }
  });

  it('handles end-voting-session', () => {
    const cardId = 'card-1';
    if (handlers['end-voting-session']) {
      handlers['end-voting-session'](cardId);
      expect(mockEmit).toHaveBeenCalledWith('voting-state-updated', { cardId, status: null });
    } else {
      throw new Error('end-voting-session handler not registered');
    }
  });
});
