import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ScrollViewProps
} from 'react-native';

const ActivityViewport = createContext({ offset: 0, height: 600 });

export function HomeActivityScrollView({
  children,
  ...props
}: ScrollViewProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [offset, setOffset] = useState(0);
  const [height, setHeight] = useState(windowHeight);
  const viewport = useMemo(() => ({ offset, height }), [offset, height]);
  return (
    <ScrollView
      {...props}
      testID="home-scroll"
      onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
      onScroll={({ nativeEvent }) => setOffset(nativeEvent.contentOffset.y)}
      scrollEventThrottle={32}
    >
      <ActivityViewport.Provider value={viewport}>
        {children}
      </ActivityViewport.Provider>
    </ScrollView>
  );
}

export function useHomeActivityViewport() {
  return useContext(ActivityViewport);
}

// Layout y is relative to the immediate parent; accumulate the existing Home
// wrappers so each grouped list knows its position in the outer scroll content.
export function useHomeActivityOffset(parentOffset = 0) {
  const [offset, setOffset] = useState(0);
  return {
    offset: parentOffset + offset,
    onLayout: ({ nativeEvent }: LayoutChangeEvent) =>
      setOffset(nativeEvent.layout.y)
  };
}
