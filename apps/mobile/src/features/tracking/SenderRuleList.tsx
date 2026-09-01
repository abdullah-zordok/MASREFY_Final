import React, { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { StyledText } from '@/components/StyledText';
import { FormField } from '@/design-system/components/forms/FormField';
import { StateView } from '@/design-system/components/feedback/StateView';
import {
  GroupedList,
  NavigationRow
} from '@/design-system/components/navigation/GroupedList';
import { translate } from '@/localization/i18n';
import { automaticTrackingService } from '@/services/mocks/automatic-tracking-service';
import {
  invalidateTrackingScopes,
  useSenderRules
} from './useAutomaticTracking';
import { TrackingDemoNotice } from './components/TrackingDemoNotice';

export function SenderRuleList() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const query = useSenderRules(search);
  const items = query.data ?? [];
  return (
    <View style={styles.stack}>
      <StyledText variant="title">
        {translate('tracking.senders.title')}
      </StyledText>
      <TrackingDemoNotice />
      <FormField
        label={translate('tracking.senders.search')}
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <StateView
            state="empty"
            title={translate('tracking.senders.empty')}
          />
        }
        renderItem={({ item }) => {
          const state = translate(
            item.enabled
              ? 'tracking.senders.enabled'
              : 'tracking.senders.disabled'
          );
          const action = translate(
            item.enabled ? 'tracking.action.disable' : 'tracking.action.enable'
          );
          return (
            <GroupedList label={item.displayLabel}>
              <NavigationRow
                label={item.displayLabel}
                description={state}
                status={action}
                onPress={async () => {
                  const result = await automaticTrackingService.saveSenderRule({
                    id: item.id,
                    sender: item.normalizedSender,
                    displayLabel: item.displayLabel,
                    institutionKey: item.institutionKey,
                    origin: item.origin,
                    enabled: !item.enabled,
                    trusted: item.trusted
                  });
                  await invalidateTrackingScopes(client, result.affectedScopes);
                }}
              />
            </GroupedList>
          );
        }}
        contentContainerStyle={styles.stack}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12, padding: 16 }
});
