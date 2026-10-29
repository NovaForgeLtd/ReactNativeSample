import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useBreakpoint } from '../hooks/useBreakpoint';

export function PageContainer({ children, style }) {
  const { isDesktop } = useBreakpoint();

  return (
    <View style={[styles.container, isDesktop && styles.desktop, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 17,
  },
  desktop: {
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 32,
  },
});
