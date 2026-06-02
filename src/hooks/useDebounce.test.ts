import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('should update the debounced value after the delay', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'initial', delay: 500 }
    });

    // Update the value
    rerender({ value: 'updated', delay: 500 });

    // Should still be 'initial' immediately after update
    expect(result.current).toBe('initial');

    // Advance time by 499ms
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe('initial');

    // Advance time by 1ms (total 500ms)
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('updated');
  });

  it('should reset the timer if the value changes before the delay', () => {
    const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
      initialProps: { value: 'initial', delay: 500 }
    });

    // Update the value first time
    rerender({ value: 'updated-1', delay: 500 });

    // Advance time by 300ms
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('initial');

    // Update the value second time
    rerender({ value: 'updated-2', delay: 500 });

    // Advance time by another 300ms (total 600ms since first update, but only 300ms since second)
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('initial');

    // Advance time by another 200ms (total 500ms since second update)
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('updated-2');
  });
});
