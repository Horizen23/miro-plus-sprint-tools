import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalConfigProvider, useGlobalConfig, DEFAULT_GLOBAL_CONFIG } from './GlobalConfigContext';
import * as React from 'react';

// Mock the miro SDK
const mockMiro = {
  board: {
    getInfo: vi.fn().mockResolvedValue({ id: 'test-board-id' }),
    getAppData: vi.fn().mockResolvedValue(undefined),
    setAppData: vi.fn().mockResolvedValue(undefined),
  },
};

vi.stubGlobal('miro', mockMiro);

describe('GlobalConfigContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMiro.board.getAppData.mockResolvedValue(undefined);
    mockMiro.board.getInfo.mockResolvedValue({ id: 'test-board-id' });
  });

  it('throws error when useGlobalConfig is used outside of GlobalConfigProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useGlobalConfig())).toThrow('useGlobalConfig must be used within a GlobalConfigProvider');
    consoleSpy.mockRestore();
  });

  it('provides default config when no saved config exists', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.config).toEqual(DEFAULT_GLOBAL_CONFIG);
    expect(result.current.boardId).toBe('test-board-id');
  });

  it('loads saved config from app data', async () => {
    const savedConfig = {
      ...DEFAULT_GLOBAL_CONFIG,
      jiraPrefix: 'TEST-PREFIX',
    };
    mockMiro.board.getAppData.mockImplementation((key: string) => {
      if (key === 'globalConfig') return Promise.resolve(savedConfig);
      return Promise.resolve(undefined);
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.config.jiraPrefix).toBe('TEST-PREFIX');
  });

  it('migrates legacy config if globalConfig is missing', async () => {
    const legacyConfig = {
      project: 'LEGACY-PROJECT',
      jiraPrefix: 'LEGACY-PREFIX',
    };
    mockMiro.board.getAppData.mockImplementation((key: string) => {
      if (key === 'timesheetConfig') return Promise.resolve(legacyConfig);
      return Promise.resolve(undefined);
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.config.tsProject).toBe('LEGACY-PROJECT');
    expect(result.current.config.jiraPrefix).toBe('LEGACY-PREFIX');
    expect(mockMiro.board.setAppData).toHaveBeenCalledWith('globalConfig', expect.objectContaining({
      tsProject: 'LEGACY-PROJECT',
      jiraPrefix: 'LEGACY-PREFIX',
    }));
  });

  it('migrates legacy config with missing fields', async () => {
    const legacyConfig = {};
    mockMiro.board.getAppData.mockImplementation((key: string) => {
      if (key === 'timesheetConfig') return Promise.resolve(legacyConfig);
      return Promise.resolve(undefined);
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.config).toEqual(DEFAULT_GLOBAL_CONFIG);
  });

  it('migrates individual legacy fields (cardPatterns etc)', async () => {
    const savedWithLegacyFields = {
      cardPatterns: 'pattern-1',
    };
    mockMiro.board.getAppData.mockImplementation((key: string) => {
      if (key === 'globalConfig') return Promise.resolve(savedWithLegacyFields);
      return Promise.resolve(undefined);
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.config.tsAutoFillDetailPatterns).toBe('pattern-1');
  });

  it('migrates tsCardPatterns to tsAutoFillDetailPatterns', async () => {
    const savedWithLegacyFields = {
      tsCardPatterns: 'pattern-2',
    };
    mockMiro.board.getAppData.mockImplementation((key: string) => {
      if (key === 'globalConfig') return Promise.resolve(savedWithLegacyFields);
      return Promise.resolve(undefined);
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.config.tsAutoFillDetailPatterns).toBe('pattern-2');
  });

  it('migrates tsCardDetailPatterns to tsAutoFillDetailPatterns', async () => {
    const savedWithLegacyFields = {
      tsCardDetailPatterns: 'pattern-3',
    };
    mockMiro.board.getAppData.mockImplementation((key: string) => {
      if (key === 'globalConfig') return Promise.resolve(savedWithLegacyFields);
      return Promise.resolve(undefined);
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.config.tsAutoFillDetailPatterns).toBe('pattern-3');
  });

  it('updates config and saves to app data', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateConfig({ jiraPrefix: 'NEW-PREFIX' });
    });

    expect(result.current.config.jiraPrefix).toBe('NEW-PREFIX');
    expect(mockMiro.board.setAppData).toHaveBeenCalledWith('globalConfig', expect.objectContaining({
      jiraPrefix: 'NEW-PREFIX',
    }));
    // Also check legacy save
    expect(mockMiro.board.setAppData).toHaveBeenCalledWith('timesheetConfig', expect.objectContaining({
      jiraPrefix: 'NEW-PREFIX',
    }));
  });

  it('handles errors when saving config', async () => {
    mockMiro.board.setAppData.mockRejectedValue(new Error('Save error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.updateConfig({ jiraPrefix: 'NEW-PREFIX' });
    });

    expect(consoleSpy).toHaveBeenCalledWith('Failed to save global config:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('handles errors when loading config', async () => {
    mockMiro.board.getInfo.mockRejectedValue(new Error('Miro error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <GlobalConfigProvider>{children}</GlobalConfigProvider>
    );

    const { result } = renderHook(() => useGlobalConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(consoleSpy).toHaveBeenCalledWith('Failed to load global config:', expect.any(Error));
    expect(result.current.config).toEqual(DEFAULT_GLOBAL_CONFIG);

    consoleSpy.mockRestore();
  });
});
