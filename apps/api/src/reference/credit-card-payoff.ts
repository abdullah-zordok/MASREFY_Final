export const CREDIT_CARD_PAYOFF_MONTH_LIMIT = 1_200;
const BASIS_POINTS_DENOMINATOR = 10_000n;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export interface CreditCardPayoffInput {
  balanceMinor: bigint;
  monthlyInterestRateBasisPoints: bigint;
  paymentMinor: bigint;
}

export type CreditCardPayoffResult =
  | {
      status: 'payoff';
      months: number;
      totalInterestMinor: bigint;
      totalPaidMinor: bigint;
      finalPaymentMinor: bigint;
    }
  | {
      status: 'non_payoff';
      reason: 'payment_not_above_interest' | 'month_limit_exceeded';
      monthlyInterestMinor: bigint;
    };

export function calculateCreditCardPayoff(input: CreditCardPayoffInput): CreditCardPayoffResult {
  if (
    input.balanceMinor < 0n ||
    input.monthlyInterestRateBasisPoints < 0n ||
    input.monthlyInterestRateBasisPoints > BASIS_POINTS_DENOMINATOR ||
    input.paymentMinor <= 0n
  )
    throw new Error('CREDIT_CARD_PAYOFF_INPUT_INVALID');
  if (input.balanceMinor === 0n)
    return {
      status: 'payoff',
      months: 0,
      totalInterestMinor: 0n,
      totalPaidMinor: 0n,
      finalPaymentMinor: 0n,
    };

  let balance = input.balanceMinor;
  let totalInterest = 0n;
  let totalPaid = 0n;
  let monthlyInterest = 0n;
  for (let months = 1; months <= CREDIT_CARD_PAYOFF_MONTH_LIMIT; months += 1) {
    monthlyInterest =
      (balance * input.monthlyInterestRateBasisPoints + BASIS_POINTS_DENOMINATOR / 2n) /
      BASIS_POINTS_DENOMINATOR;
    if (input.paymentMinor <= monthlyInterest)
      return {
        status: 'non_payoff',
        reason: 'payment_not_above_interest',
        monthlyInterestMinor: monthlyInterest,
      };
    totalInterest += monthlyInterest;
    const amountDue = balance + monthlyInterest;
    const payment = input.paymentMinor < amountDue ? input.paymentMinor : amountDue;
    totalPaid += payment;
    balance = amountDue - payment;
    if (balance === 0n)
      return {
        status: 'payoff',
        months,
        totalInterestMinor: totalInterest,
        totalPaidMinor: totalPaid,
        finalPaymentMinor: payment,
      };
  }
  return {
    status: 'non_payoff',
    reason: 'month_limit_exceeded',
    monthlyInterestMinor: monthlyInterest,
  };
}

export function calculateCreditCardPayoffResponse(input: {
  balanceMinor: number;
  monthlyInterestRateBasisPoints: number;
  paymentMinor: number;
}): Record<string, string | number> {
  const result = calculateCreditCardPayoff({
    balanceMinor: BigInt(input.balanceMinor),
    monthlyInterestRateBasisPoints: BigInt(input.monthlyInterestRateBasisPoints),
    paymentMinor: BigInt(input.paymentMinor),
  });
  if (result.status === 'non_payoff')
    return {
      status: result.status,
      reason: result.reason,
      monthlyInterestMinor: safeNumber(result.monthlyInterestMinor),
    };
  return {
    status: result.status,
    months: result.months,
    totalInterestMinor: safeNumber(result.totalInterestMinor),
    totalPaidMinor: safeNumber(result.totalPaidMinor),
    finalPaymentMinor: safeNumber(result.finalPaymentMinor),
  };
}

function safeNumber(value: bigint): number {
  if (value > MAX_SAFE) throw new Error('VALIDATION_FAILED');
  return Number(value);
}
