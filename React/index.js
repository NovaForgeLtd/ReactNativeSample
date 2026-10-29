import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';
import WebApp from './WebApp';

// Keep the native iOS/Android application on the UIKit-backed experience while
// Expo Web gets a browser-aware authentication and onboarding surface.
registerRootComponent(Platform.OS === 'web' ? WebApp : App);
