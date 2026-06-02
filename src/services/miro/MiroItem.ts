import type { Card, AppCard, Item } from "@mirohq/websdk-types";

/**
 * Domain-specific wrapper for Miro Board Items to encapsulate 
 * SDK-specific type casting and metadata handling.
 */
export class MiroItem {
  constructor(public readonly raw: Card | AppCard) {}

  get id(): string {
    return this.raw.id;
  }

  get type(): 'card' | 'app_card' {
    return this.raw.type;
  }

  get title(): string {
    return this.raw.title || "";
  }

  get description(): string {
    return this.raw.description || "";
  }

  get x(): number {
    return (this.raw as unknown as { x?: number }).x ?? 0;
  }

  get y(): number {
    return (this.raw as unknown as { y?: number }).y ?? 0;
  }

  get width(): number {
    return (this.raw as unknown as { width?: number }).width ?? 320;
  }

  get height(): number {
    return (this.raw as unknown as { height?: number }).height ?? 120;
  }

  get parentId(): string | undefined {
    return (this.raw as unknown as { parentId?: string }).parentId;
  }

  get tagIds(): string[] {
    return (this.raw as unknown as { tagIds?: string[] }).tagIds || [];
  }

  get linkedTo(): string | undefined {
    return (this.raw as unknown as { linkedTo?: string }).linkedTo;
  }

  set linkedTo(url: string | undefined) {
    (this.raw as unknown as { linkedTo?: string }).linkedTo = url;
  }

  async sync(): Promise<void> {
    await this.raw.sync();
  }

  async getMetadata(key: string): Promise<any> {
    return await this.raw.getMetadata(key);
  }

  async setMetadata(key: string, data: any): Promise<void> {
    await this.raw.setMetadata(key, data);
  }
}

/**
 * Helper to wrap an array of items.
 */
export function wrapMiroItems(items: (Card | AppCard)[]): MiroItem[] {
  return items.map(item => new MiroItem(item));
}
