import { describe, it, expect } from 'vitest';
import { 
  mapHoursToPoints, 
  mapPointsToHours,
  getBucketedPoint, 
  parseCardTitle, 
  incrementSequence, 
  formatCardTitle,
  calculateSelectionSummary,
  compareSequences
} from './estimationUtils';

describe('estimationUtils', () => {
  describe('mapHoursToPoints', () => {
    it('should return 0 for 0 hours', () => {
      expect(mapHoursToPoints(0)).toBe(0);
    });

    it('should map 2 hours to 2 points', () => {
      expect(mapHoursToPoints(2)).toBe(2);
    });

    it('should map 4 hours to 3 points', () => {
      expect(mapHoursToPoints(4)).toBe(3);
    });

    it('should map 10 hours to 8 points', () => {
      expect(mapHoursToPoints(10)).toBe(8);
    });

    it('should return 0 for extremely high hours not in mapping', () => {
      expect(mapHoursToPoints(9999)).toBe(0);
    });
  });

  describe('mapPointsToHours', () => {
    it('should map 2 points to [1, 2] hours', () => {
      expect(mapPointsToHours(2)).toEqual([1, 2]);
    });

    it('should map 3 points to [3, 4] hours', () => {
      expect(mapPointsToHours(3)).toEqual([3, 4]);
    });

    it('should map 5 points to [5, 6] hours', () => {
      expect(mapPointsToHours(5)).toEqual([5, 6]);
    });

    it('should return [0, 0] for 0 or unknown points', () => {
      expect(mapPointsToHours(0)).toEqual([0, 0]);
      expect(mapPointsToHours(999)).toEqual([0, 0]);
    });
  });

  describe('compareSequences', () => {
    it('should prioritize Dev (category 1) over Empty (category 2)', () => {
      expect(compareSequences('A1.0', '')).toBeLessThan(0);
      expect(compareSequences('A1.0', null)).toBeLessThan(0);
    });

    it('should prioritize Empty (category 2) over Test (category 3)', () => {
      expect(compareSequences('', 'T1')).toBeLessThan(0);
    });

    it('should use natural sort for same category', () => {
      expect(compareSequences('A1.2', 'A1.10')).toBeLessThan(0);
      expect(compareSequences('T2', 'T10')).toBeLessThan(0);
    });
  });

  describe('getBucketedPoint', () => {
    it('should return the same value if it is a Fibonacci number', () => {
      expect(getBucketedPoint(5)).toBe(5);
      expect(getBucketedPoint(13)).toBe(13);
    });

    it('should round down to the nearest Fibonacci number', () => {
      expect(getBucketedPoint(7)).toBe(5);
      expect(getBucketedPoint(10)).toBe(8);
      expect(getBucketedPoint(20)).toBe(13);
    });

    it('should return 0 for 0', () => {
      expect(getBucketedPoint(0)).toBe(0);
    });
  });

  describe('parseCardTitle', () => {
    it('should parse [SEQ][EST] Title format', () => {
      const result = parseCardTitle('[A1.0][8] My Task');
      expect(result.seq).toBe('A1.0');
      expect(result.estimate).toBe('8');
      expect(result.cleanTitle).toBe('My Task');
    });

    it('should parse [EST] Title format', () => {
      const result = parseCardTitle('[5] Just Estimate');
      expect(result.seq).toBe('');
      expect(result.estimate).toBe('5');
      expect(result.cleanTitle).toBe('Just Estimate');
    });

    it('should handle hours in estimate [8h]', () => {
      const result = parseCardTitle('[8h] Hour Task');
      expect(result.estimate).toBe('8h');
      expect(result.cleanTitle).toBe('Hour Task');
    });

    it('should strip HTML and clean title', () => {
      const result = parseCardTitle('<p>[T1][2] Hello &nbsp; World</p>');
      expect(result.seq).toBe('T1');
      expect(result.estimate).toBe('2');
      expect(result.cleanTitle).toBe('Hello World');
    });
  });

  describe('formatCardTitle', () => {
    it('should format full data correctly', () => {
      const result = formatCardTitle({
        seq: 'A1.0',
        estimate: '5',
        cleanTitle: 'Task Title'
      });
      expect(result).toBe('[A1.0][5] Task Title');
    });

    it('should handle missing sequence', () => {
      const result = formatCardTitle({
        seq: '',
        estimate: '8',
        cleanTitle: 'Estimate Only'
      });
      expect(result).toBe('[8] Estimate Only');
    });

    it('should handle missing estimate', () => {
      const result = formatCardTitle({
        seq: 'T1',
        estimate: '',
        cleanTitle: 'Seq Only'
      });
      expect(result).toBe('[T1] Seq Only');
    });
  });

  describe('incrementSequence', () => {
    it('should increment minor version A1.0 -> A1.1', () => {
      expect(incrementSequence('A1.0')).toBe('A1.1');
    });

    it('should increment major version A1 -> A2', () => {
      expect(incrementSequence('A1')).toBe('A2');
    });

    it('should handle test prefix TA1.0 -> TA1.1', () => {
      expect(incrementSequence('TA1.0')).toBe('TA1.1');
    });

    it('should return A1.0 for empty input', () => {
      expect(incrementSequence('')).toBe('A1.0');
      expect(incrementSequence(null)).toBe('A1.0');
    });
  });

  describe('calculateSelectionSummary', () => {
    it('should calculate sum from card titles', () => {
      const items = [
        { title: '[3] Task 1', type: 'card' },
        { title: '[5] Task 2', type: 'card' }
      ] as any;
      const result = calculateSelectionSummary(items);
      expect(result.points).toBe(8);
      expect(result.count).toBe(2);
      expect(result.bucketedPoint).toBe(8);
    });

    it('should calculate sum from app card fields', () => {
      const items = [
        { 
          title: 'App Task', 
          type: 'app_card', 
          fields: [{ value: '13' }] 
        }
      ] as any;
      const result = calculateSelectionSummary(items);
      expect(result.points).toBe(13);
      expect(result.bucketedPoint).toBe(13);
    });

    it('should handle mixture of points and hours', () => {
      const items = [
        { title: '[2] Points Task', type: 'card' },
        { title: '[2h] Hours Task', type: 'card' }
      ] as any;
      // 2h maps to 2 points according to default mapping
      const result = calculateSelectionSummary(items);
      expect(result.points).toBe(4);
      expect(result.actualHours).toBe(2);
      expect(result.bucketedPoint).toBe(3); // 4 rounded down to 3 in Fibonacci
    });
  });
});
