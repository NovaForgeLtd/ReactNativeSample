import { Platform, DynamicColorIOS } from 'react-native';

export const PURPLE = "#6D28F5";
export const GREEN = "#24B36B";
export const RED = "#FF453A";
export const ORANGE = "#FF9F0A";

const dynamicColor = (light, dark) => Platform.OS === "ios" ? DynamicColorIOS({ light, dark }) : light;

export const colors = {
  purple: PURPLE,
  green: GREEN,
  red: RED,
  orange: ORANGE,
  ink: dynamicColor("#111114", "#F7F7FA"),
  muted: dynamicColor("#6E6E73", "#A1A1AA"),
  secondary: dynamicColor("#8E8E93", "#8E8E93"),
  bg: dynamicColor("#F7F7FB", "#05070A"),
  safeBg: dynamicColor("#FBFBFD", "#05070A"),
  card: dynamicColor("#FFFFFF", "#101419"),
  card2: dynamicColor("#F1F1F6", "#171C22"),
  line: dynamicColor("rgba(17,17,20,0.08)", "rgba(255,255,255,0.09)"),
  fieldBg: dynamicColor("#EEEFF4", "#171C22"),
  glassFallback: dynamicColor("rgba(248,248,252,0.91)", "rgba(18,22,28,0.91)"),
  purpleSoft: dynamicColor("#F0E9FF", "#26184A"),
  greenSoft: dynamicColor("#E9F8EF", "#102C1E"),
  orangeSoft: dynamicColor("#FFF3E1", "#352510"),
  redSoft: dynamicColor("#FFF0F0", "#391719"),
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 24,
  pill: 999,
};
