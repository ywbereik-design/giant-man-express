import { createContext, useContext } from "react";

// The measured height of the absolutely-positioned DriverTopTabBar (see
// DriverNavigator), so each screen can pad its own top-level container by
// that much. Not using react-navigation's `sceneStyle` option for this:
// it didn't take effect in testing (the underlying Screen/Background
// component chain accepts a style array that should include it, but the
// measured DOM showed paddingTop never landing on any ancestor) — this
// context sidesteps that entirely by being fully owned end-to-end here.
export const DriverTabBarHeightContext = createContext(0);

export function useDriverTabBarHeight(): number {
  return useContext(DriverTabBarHeightContext);
}
