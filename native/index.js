/**
 * DrivoSafe — React Native entry point.
 * Android is the supported target (SYSTEM_DESIGN §4.1).
 */
import 'react-native-reanimated'; // must be the first import (Reanimated setup)
import { AppRegistry } from 'react-native';
import App from './src/App.jsx';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
