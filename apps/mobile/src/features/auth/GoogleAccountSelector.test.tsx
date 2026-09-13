import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { GoogleAccountSelector } from './GoogleAccountSelector';
import type { AuthResult } from '@/services/contracts/app-shell-service';
import { renderWithProviders } from '@/test-utils/render';

describe('GoogleAccountSelector', () => {
  it.each([
    [{ status: 'cancelled' } as AuthResult, 'تم إلغاء تسجيل الدخول بجوجل.'],
    [
      { status: 'failed', errorCode: 'offline' } as AuthResult,
      'الاتصال غير متاح.'
    ],
    [
      {
        status: 'conflict',
        conflictId: 'c1',
        existingMethod: 'phone'
      } as AuthResult,
      'أكد أنك صاحب الحساب'
    ]
  ])('shows recovery content for %s', async (result, expectedText) => {
    renderSelector(jest.fn().mockResolvedValue(result), jest.fn());

    fireEvent.press(screen.getByLabelText('اختر حساب جوجل'));

    await waitFor(() => expect(screen.getByText(expectedText)).toBeOnTheScreen());
  });

  it('emits a successful authentication result', async () => {
    const result: AuthResult = {
      status: 'authenticated',
      session: {
        status: 'authenticated',
        userId: 'mock-user',
        method: 'google',
        issuedAt: 1,
        expiresAt: 2,
        restoration: 'restored'
      }
    };
    const onResult = jest.fn();
    renderSelector(jest.fn().mockResolvedValue(result), onResult);

    fireEvent.press(screen.getByLabelText('اختر حساب جوجل'));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(result));
  });
});

function renderSelector(
  signIn: () => Promise<AuthResult>,
  onResult: (result: AuthResult) => void
) {
  renderWithProviders(
    <GoogleAccountSelector onResult={onResult} signIn={signIn} />
  );
}
