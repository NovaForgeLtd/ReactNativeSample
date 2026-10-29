import { AppRegistry, Platform } from 'react-native';

import App from './App';
import WebApp from './WebApp';

// Keep the native iOS/Android application on the UIKit-backed experience while
// Expo Web gets a browser-aware authentication and onboarding surface.
// NovaForge's native Windows-built shell does not link ExpoModulesCore.
// Calling expo/registerRootComponent on iOS crashes before the first frame
// (globalThis.expo.EventEmitter is undefined). Native registration must use
// React Native directly, while Expo Web keeps the normal web root lifecycle.
if (Platform.OS === 'web') {
  require('expo').registerRootComponent(WebApp);
} else {
  AppRegistry.registerComponent('main', () => App);
}
