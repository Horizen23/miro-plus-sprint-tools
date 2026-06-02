import { describe, it, expect, vi } from 'vitest';
import { MiroItem, wrapMiroItems } from './MiroItem';
import type { Card } from '@mirohq/websdk-types';

describe('MiroItem', () => {
  const mockRaw = {
    id: 'test-id',
    type: 'card',
    title: 'test-title',
    description: 'test-description',
    x: 100,
    y: 200,
    width: 300,
    height: 400,
    parentId: 'parent-id',
    tagIds: ['tag-1'],
    linkedTo: 'http://linked.com',
    sync: vi.fn(),
    getMetadata: vi.fn(),
    setMetadata: vi.fn(),
  } as unknown as Card;

  it('should correctly wrap raw item and return properties', () => {
    const item = new MiroItem(mockRaw);
    expect(item.id).toBe('test-id');
    expect(item.type).toBe('card');
    expect(item.title).toBe('test-title');
    expect(item.description).toBe('test-description');
    expect(item.x).toBe(100);
    expect(item.y).toBe(200);
    expect(item.width).toBe(300);
    expect(item.height).toBe(400);
    expect(item.parentId).toBe('parent-id');
    expect(item.tagIds).toEqual(['tag-1']);
    expect(item.linkedTo).toBe('http://linked.com');
  });

  it('should handle missing properties with defaults', () => {
    const minimalRaw = {
      id: 'min-id',
      type: 'card',
    } as unknown as Card;
    const item = new MiroItem(minimalRaw);
    expect(item.title).toBe('');
    expect(item.description).toBe('');
    expect(item.x).toBe(0);
    expect(item.y).toBe(0);
    expect(item.width).toBe(320);
    expect(item.height).toBe(120);
    expect(item.tagIds).toEqual([]);
  });

  it('should call sync on raw item', async () => {
    const item = new MiroItem(mockRaw);
    await item.sync();
    expect(mockRaw.sync).toHaveBeenCalled();
  });

  it('should call getMetadata on raw item', async () => {
    const item = new MiroItem(mockRaw);
    vi.mocked(mockRaw.getMetadata).mockResolvedValue({ key: 'value' });
    const result = await item.getMetadata('some-key');
    expect(mockRaw.getMetadata).toHaveBeenCalledWith('some-key');
    expect(result).toEqual({ key: 'value' });
  });

  it('should call setMetadata on raw item', async () => {
    const item = new MiroItem(mockRaw);
    await item.setMetadata('some-key', { key: 'value' });
    expect(mockRaw.setMetadata).toHaveBeenCalledWith('some-key', { key: 'value' });
  });

  it('should allow setting linkedTo', () => {
    const item = new MiroItem(mockRaw);
    item.linkedTo = 'http://new-link.com';
    expect((mockRaw as any).linkedTo).toBe('http://new-link.com');
  });
});

describe('wrapMiroItems', () => {
  it('should wrap an array of raw items', () => {
    const rawItems = [
      { id: '1', type: 'card' },
      { id: '2', type: 'app_card' }
    ] as any[];
    const wrapped = wrapMiroItems(rawItems);
    expect(wrapped).toHaveLength(2);
    expect(wrapped[0]).toBeInstanceOf(MiroItem);
    expect(wrapped[0].id).toBe('1');
    expect(wrapped[1].id).toBe('2');
  });
});
