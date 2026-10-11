import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderWithProviders } from '@/test-utils/render';
import { translate } from '@/localization/i18n';
import { assistantService } from '@/services/assistant-service';

const AssistantRoute = require('@app/assistant')
  .default as () => React.ReactElement;
const AssistantLayout = require('@app/assistant/_layout')
  .default as React.ComponentType;
const AssistantConversationRoute = require('@app/assistant/[conversationId]')
  .default as () => React.ReactElement;
const AssistantActionRoute =
  require('@app/assistant/[conversationId]/actions/[previewId]')
    .default as () => React.ReactElement;
const { AssistantHomeScreen } = require('./AssistantHomeScreen') as Record<
  string,
  React.ComponentType<any>
>;
const { AssistantConversationScreen } =
  require('./AssistantConversationScreen') as Record<
    string,
    React.ComponentType<any>
  >;
const { AssistantActionPreviewScreen } =
  require('./AssistantActionPreviewScreen') as Record<
    string,
    React.ComponentType<any>
  >;
const mockStack = jest.fn((_props: unknown) => null);

jest.mock('expo-router', () => ({
  Stack: (props: unknown) => mockStack(props),
  useLocalSearchParams: () => ({
    conversationId: 'conversation-1',
    previewId: 'preview-1',
    href: 'https://evil.example'
  })
}));

jest.mock('@/config/demo-mode', () => ({
  isFixtureModeEnabled: () => false,
  isDemoModeEnabled: () => false
}));

jest.mock('@/services/assistant-service', () => ({
  assistantService: { metadata: { availability: 'available' } }
}));

jest.mock('@/features/shell/ProtectedRouteGate', () => ({
  ProtectedRouteGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  )
}));

afterEach(() => {
  mockStack.mockClear();
  assistantService.metadata.availability = 'available';
});

test('opens the authenticated Assistant in a standalone release with a configured live service', () => {
  const devGlobal = global as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;
  try {
    Object.defineProperty(global, '__DEV__', { configurable: true, value: false });
    const screen = renderWithProviders(<AssistantLayout />);
    expect(screen.queryByText(translate('assistant.backendUnavailable'))).toBeNull();
    expect(mockStack).toHaveBeenCalled();
  } finally {
    Object.defineProperty(global, '__DEV__', { configurable: true, value: originalDev });
  }
});

test('shows the assistant UI in development without enabling fixture mode', () => {
  const devGlobal = global as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;
  try {
    Object.defineProperty(global, '__DEV__', {
      configurable: true,
      value: true
    });
    renderWithProviders(<AssistantLayout />);
    expect(mockStack).toHaveBeenCalled();
  } finally {
    Object.defineProperty(global, '__DEV__', {
      configurable: true,
      value: originalDev
    });
  }
});

test('keeps the assistant unavailable in production without a live provider', () => {
  assistantService.metadata.availability = 'unavailable';
  const devGlobal = global as typeof globalThis & { __DEV__: boolean };
  const originalDev = devGlobal.__DEV__;
  try {
    Object.defineProperty(global, '__DEV__', {
      configurable: true,
      value: false
    });
    const screen = renderWithProviders(<AssistantLayout />);
    expect(
      screen.getByText(translate('assistant.backendUnavailable'))
    ).toBeTruthy();
    expect(mockStack).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(global, '__DEV__', {
      configurable: true,
      value: originalDev
    });
  }
});

test('owns assistant routes with thin render-only modules and rejected raw destinations', () => {
  expect(AssistantRoute()).toEqual(<AssistantHomeScreen />);
  expect(AssistantConversationRoute()).toEqual(
    <AssistantConversationScreen conversationId="conversation-1" />
  );
  expect(AssistantActionRoute()).toEqual(
    <AssistantActionPreviewScreen
      conversationId="conversation-1"
      previewId="preview-1"
    />
  );

  [
    'app/assistant/index.tsx',
    'app/assistant/[conversationId]/index.tsx',
    'app/assistant/[conversationId]/actions/[previewId].tsx',
    'app/assistant/_layout.tsx'
  ].forEach((path) => {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    expect(source).not.toMatch(
      /sqlite|storage\/|router\.push\((params|search|url)|https?:\/\//i
    );
  });
});
