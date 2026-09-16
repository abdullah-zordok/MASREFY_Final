import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';
import { renderWithProviders } from '@/test-utils/render';
import { changeLocale, translate } from '@/localization/i18n';
import { AssistantLanding } from './AssistantLanding';

describe('AssistantLanding', () => {
  beforeEach(() => {
    changeLocale('ar');
  });

  afterEach(() => jest.restoreAllMocks());

  it('renders header, compact identity, ask card, consent card, 4 suggestions, and privacy footer', () => {
    const onAskQuestion = jest.fn();
    const onEnableConsent = jest.fn();

    renderWithProviders(
      <AssistantLanding
        onAskQuestion={onAskQuestion}
        onEnableConsent={onEnableConsent}
        consent={{
          status: 'not_requested',
          disclosedDataCategories: ['transactions'],
          consentedAt: null,
          disabledAt: null,
          version: 1
        }}
      />
    );

    // Header & Hero
    expect(screen.getAllByText(translate('assistant.hero.title')).length).toBe(1);
    expect(screen.getByText(translate('assistant.hero.subtitle'))).toBeTruthy();
    expect(screen.getByTestId('assistant-hero-avatar')).toBeTruthy();

    // Ask Card
    expect(screen.getByTestId('assistant-ask-card')).toBeTruthy();
    expect(screen.getByTestId('assistant-ask-input')).toBeTruthy();

    // Personalization Card
    expect(screen.getByTestId('assistant-consent-card')).toBeTruthy();
    expect(screen.getByText(translate('assistant.consent.title'))).toBeTruthy();
    expect(screen.getByText(translate('assistant.action.enable'))).toBeTruthy();

    // Quick Suggestions Header & 4 Cards
    expect(screen.getByText(translate('assistant.suggestions.header'))).toBeTruthy();
    expect(screen.getByTestId('suggestion-card-spending')).toBeTruthy();
    expect(screen.getByTestId('suggestion-card-highest')).toBeTruthy();
    expect(screen.getByTestId('suggestion-card-weekly')).toBeTruthy();
    expect(screen.getByTestId('suggestion-card-budget')).toBeTruthy();

    // Privacy Footer
    expect(screen.getByTestId('assistant-privacy-footer')).toBeTruthy();
    expect(screen.getByText(translate('assistant.privacy.note'))).toBeTruthy();

    // Type in ask input and submit
    fireEvent.changeText(
      screen.getByTestId('assistant-ask-input'),
      'كم أنفقت على الطعام؟'
    );
    fireEvent.press(screen.getByTestId('assistant-ask-submit-button'));
    expect(onAskQuestion).toHaveBeenCalledWith('كم أنفقت على الطعام؟');
  });

  it('submits quick suggestion when tapped', () => {
    const onAskQuestion = jest.fn();
    renderWithProviders(
      <AssistantLanding
        onAskQuestion={onAskQuestion}
        onEnableConsent={jest.fn()}
      />
    );

    fireEvent.press(screen.getByTestId('suggestion-card-spending'));
    expect(onAskQuestion).toHaveBeenCalledWith(
      translate('assistant.suggestions.spending'),
      'spending_summary'
    );

    fireEvent.press(screen.getByTestId('suggestion-card-budget'));
    expect(onAskQuestion).toHaveBeenCalledWith(
      translate('assistant.suggestions.budget'),
      'budget_status'
    );
  });

  it('handles consent activation CTA', () => {
    const onEnableConsent = jest.fn();
    renderWithProviders(
      <AssistantLanding
        onAskQuestion={jest.fn()}
        onEnableConsent={onEnableConsent}
        consent={{
          status: 'not_requested',
          disclosedDataCategories: ['transactions'],
          consentedAt: null,
          disabledAt: null,
          version: 1
        }}
      />
    );

    fireEvent.press(screen.getByTestId('assistant-consent-enable-button'));
    expect(onEnableConsent).toHaveBeenCalled();
  });

  it('renders only authoritative proactive insight values supplied by the backend', () => {
    renderWithProviders(
      <AssistantLanding
        onAskQuestion={jest.fn()}
        onEnableConsent={jest.fn()}
        insight={{
          id: 'insight-1',
          kind: 'budget_threshold',
          budgetName: 'Restaurants',
          currency: 'SAR',
          budgetMinor: 100_000,
          spentMinor: 85_000,
          remainingMinor: 15_000,
          utilizationBps: 8500,
          createdAt: Date.now(),
          expiresAt: Date.now() + 1000
        }}
      />
    );

    expect(screen.getByText('Restaurants')).toBeTruthy();
    expect(screen.getByText('850.00 SAR')).toBeTruthy();
    expect(screen.queryByText('1,870.00 SAR')).toBeNull();
  });

  it.each(['ar', 'en'] as const)(
    'allows suggestion labels to wrap at 200%% text in %s',
    (locale) => {
      jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);
      changeLocale(locale);
      renderWithProviders(
        <AssistantLanding
          onAskQuestion={jest.fn()}
          onEnableConsent={jest.fn()}
        />
      );

      expect(
        screen.getByText(translate('assistant.suggestions.spending')).props
          .numberOfLines
      ).toBeUndefined();
    }
  );
});
