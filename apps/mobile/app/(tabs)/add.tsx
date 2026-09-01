import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import type { TransactionType } from '@/domain/core-finance';
import { TransactionForm } from '@/features/transactions/TransactionForm';

const manualTypes: TransactionType[] = ['expense', 'income', 'transfer'];

export default function AddRoute() {
  const { type, accountId, originalTransactionId } = useLocalSearchParams<{
    type?: string;
    accountId?: string;
    originalTransactionId?: string;
  }>();
  const initialType =
    type === 'refund' && originalTransactionId
      ? 'refund'
      : manualTypes.includes(type as TransactionType)
        ? (type as TransactionType)
        : 'expense';

  return (
    <TransactionForm
      initialAccountId={accountId}
      initialType={initialType}
      originalTransactionId={originalTransactionId}
    />
  );
}
