import { useWindowDimensions } from 'react-native';

export function useBreakpoint() {
  const { width, height, fontScale } = useWindowDimensions();

  return {
    width,
    height,
    fontScale,
    isPhone: width < 600,
    isTablet: width >= 600 && width < 900,
    isDesktop: width >= 900,
    isWide: width >= 1280,
  };
}
