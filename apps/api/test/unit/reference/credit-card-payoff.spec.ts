import { calculateCreditCardPayoff } from '../../../src/reference/credit-card-payoff';

describe('credit-card payoff calculator', () => {
  it.each([
    [
      'zero balance',
      { balanceMinor: 0n, monthlyInterestRateBasisPoints: 100n, paymentMinor: 3_000n },
      {
        status: 'payoff',
        months: 0,
        totalInterestMinor: 0n,
        totalPaidMinor: 0n,
        finalPaymentMinor: 0n,
      },
    ],
    [
      'zero interest',
      { balanceMinor: 10_000n, monthlyInterestRateBasisPoints: 0n, paymentMinor: 3_000n },
      {
        status: 'payoff',
        months: 4,
        totalInterestMinor: 0n,
        totalPaidMinor: 10_000n,
        finalPaymentMinor: 1_000n,
      },
    ],
    [
      'monthly bps scale and per-month rounding',
      { balanceMinor: 10_000n, monthlyInterestRateBasisPoints: 100n, paymentMinor: 3_000n },
      {
        status: 'payoff',
        months: 4,
        totalInterestMinor: 225n,
        totalPaidMinor: 10_225n,
        finalPaymentMinor: 1_225n,
      },
    ],
    [
      'half-up final-payment rounding',
      { balanceMinor: 50n, monthlyInterestRateBasisPoints: 100n, paymentMinor: 51n },
      {
        status: 'payoff',
        months: 1,
        totalInterestMinor: 1n,
        totalPaidMinor: 51n,
        finalPaymentMinor: 51n,
      },
    ],
  ])('%s', (_name, input, expected) => {
    expect(calculateCreditCardPayoff(input)).toEqual(expected);
  });

  it('returns a clear non-payoff result when payment does not cover interest', () => {
    expect(
      calculateCreditCardPayoff({
        balanceMinor: 10_000n,
        monthlyInterestRateBasisPoints: 100n,
        paymentMinor: 100n,
      }),
    ).toEqual({
      status: 'non_payoff',
      reason: 'payment_not_above_interest',
      monthlyInterestMinor: 100n,
    });
  });

  it('stops deterministically after 1,200 months', () => {
    expect(
      calculateCreditCardPayoff({
        balanceMinor: 1_201n,
        monthlyInterestRateBasisPoints: 0n,
        paymentMinor: 1n,
      }),
    ).toEqual({
      status: 'non_payoff',
      reason: 'month_limit_exceeded',
      monthlyInterestMinor: 0n,
    });
  });
});
