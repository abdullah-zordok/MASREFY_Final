import React, { useMemo, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import type { HomeTodayActivity } from '@/services/contracts/core-finance-service';
import { useHomeActivityViewport } from './HomeActivityViewport';

export function HomeActivityRows({
  transactions,
  offset,
  largeText,
  renderRow
}: {
  transactions: HomeTodayActivity[];
  offset: number;
  largeText: boolean;
  renderRow: (activity: HomeTodayActivity, index: number) => React.ReactNode;
}) {
  const viewport = useHomeActivityViewport();
  const fontScale = PixelRatio.getFontScale();
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const heights = useMemo(() => {
    const rowOffsets = [0];
    transactions.forEach(({ transaction }, index) => {
      const key = `${transaction.id}:${transaction.version}:${fontScale}`;
      const height =
        measured[key] ??
        (largeText ? 84 * fontScale : 84) +
          (index > 0 ? StyleSheet.hairlineWidth : 0);
      rowOffsets.push(rowOffsets[index] + height);
    });
    return rowOffsets;
  }, [transactions, measured, fontScale, largeText]);

  if (transactions.length <= 30) {
    return (
      <>
        {transactions.map((activity, index) => (
          <React.Fragment key={activity.transaction.id}>
            {renderRow(activity, index)}
          </React.Fragment>
        ))}
      </>
    );
  }

  const buffer = Math.max(viewport.height, 600);
  const start = Math.min(
    transactions.length - 1,
    Math.max(
      0,
      firstOffsetAfter(heights, viewport.offset - offset - buffer) - 1
    )
  );
  const end = Math.min(
    transactions.length,
    Math.max(
      start + 1,
      firstOffsetAfter(
        heights,
        viewport.offset - offset + viewport.height + buffer
      )
    )
  );

  return (
    <>
      <View accessible={false} style={{ height: heights[start] }} />
      {transactions.slice(start, end).map((activity, localIndex) => {
        const index = start + localIndex;
        const key = `${activity.transaction.id}:${activity.transaction.version}:${fontScale}`;
        return (
          <View
            key={activity.transaction.id}
            onLayout={({ nativeEvent }) => {
              const height = nativeEvent.layout.height;
              if (height > 0 && measured[key] !== height)
                setMeasured((previous) =>
                  previous[key] === height
                    ? previous
                    : { ...previous, [key]: height }
                );
            }}
          >
            {renderRow(activity, index)}
          </View>
        );
      })}
      <View
        accessible={false}
        style={{ height: heights[transactions.length] - heights[end] }}
      />
    </>
  );
}

function firstOffsetAfter(offsets: number[], position: number) {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle] <= position) low = middle + 1;
    else high = middle;
  }
  return low;
}
