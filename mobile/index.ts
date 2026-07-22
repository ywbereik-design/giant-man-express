import { registerRootComponent } from 'expo';

// Registers the TaskManager task used for shift location tracking. Must be
// imported before the app runs so the task is defined even on a headless
// relaunch (app process killed while a driver was still clocked in).
import './src/location/shiftLocationTask';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
