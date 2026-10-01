import { describe, it, expect } from 'vitest';
import { computeReturnMath } from '../services/returnsService.js';

describe('computeReturnMath', () => {
  it('applies no deduction by default', () => {
    const result = computeReturnMath(1000, 'NONE', 0);
    expect(result).toEqual({ deductionAmount: 0, netReturnAmount: 1000 });
  });

  it('applies a percentage deduction', () => {
    const result = computeReturnMath(1000, 'PERCENTAGE', 10);
    expect(result).toEqual({ deductionAmount: 100, netReturnAmount: 900 });
  });

  it('applies a fixed deduction', () => {
    const result = computeReturnMath(1000, 'FIXED', 150);
    expect(result).toEqual({ deductionAmount: 150, netReturnAmount: 850 });
  });

  it('never deducts more than the gross return amount', () => {
    const result = computeReturnMath(100, 'FIXED', 500);
    expect(result).toEqual({ deductionAmount: 100, netReturnAmount: 0 });
  });

  it('never produces a negative deduction from a negative input', () => {
    const result = computeReturnMath(1000, 'FIXED', -50);
    expect(result).toEqual({ deductionAmount: 0, netReturnAmount: 1000 });
  });

  it('handles a zero gross return amount', () => {
    const result = computeReturnMath(0, 'PERCENTAGE', 10);
    expect(result).toEqual({ deductionAmount: 0, netReturnAmount: 0 });
  });
});
