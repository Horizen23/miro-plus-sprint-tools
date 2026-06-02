import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { usePanel, PanelProvider } from './PanelContext';
import * as React from 'react';

// Mock the miro SDK
vi.stubGlobal('miro', {
  board: {
    ui: {
      on: vi.fn(),
      off: vi.fn(),
    },
    getInfo: vi.fn().mockResolvedValue({ id: 'test-board-id' }),
    getUserInfo: vi.fn().mockResolvedValue({ id: 'test-user-id', name: 'Test User' }),
    getSelection: vi.fn().mockResolvedValue([]),
    getAppData: vi.fn().mockResolvedValue({}),
  },
});

describe('PanelContext', () => {
  it('throws error when usePanel is used outside of PanelProvider', () => {
    // Suppress console.error for this test as we expect an error to be thrown
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => renderHook(() => usePanel())).toThrow('usePanel must be used within a PanelProvider');
    
    consoleSpy.mockRestore();
  });

  it('provides context value when used within PanelProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PanelProvider>{children}</PanelProvider>
    );

    const { result } = renderHook(() => usePanel(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.activeTab).toBe('tools');
    expect(result.current.showGuide).toBe(false);
  });

  it('updates activeTab and showGuide state', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <PanelProvider>{children}</PanelProvider>
    );

    const { result } = renderHook(() => usePanel(), { wrapper });

    act(() => {
      result.current.setActiveTab('capacity');
      result.current.setShowGuide(true);
    });

    expect(result.current.activeTab).toBe('capacity');
    expect(result.current.showGuide).toBe(true);
  });
});
