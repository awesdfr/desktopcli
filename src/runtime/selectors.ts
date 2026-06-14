import type { AppProfile, RuntimeAssertion, RuntimeStep } from "./types.js";

export function selector(profile: AppProfile, name: string): string {
  const resolved = profile.selectors[name];
  if (!resolved) {
    throw new Error(`unknown selector '${name}' for ${profile.id}`);
  }
  return resolved.query;
}

export function pointStep(profile: AppProfile, name: string): RuntimeStep {
  const point = profile.points[name];
  if (!point) {
    throw new Error(`unknown point '${name}' for ${profile.id}`);
  }
  return {
    action: "mouse-click",
    window: selector(profile, point.window),
    x: point.x,
    y: point.y
  };
}

export function windowPresent(profile: AppProfile, name: string, timeout = 5): RuntimeAssertion {
  return {
    type: "window-present",
    selector: selector(profile, name),
    timeout,
    requireUnique: true,
    label: `${name} window present`
  };
}

export function windowGone(profile: AppProfile, name: string, timeout = 5): RuntimeAssertion {
  return {
    type: "window-gone",
    selector: selector(profile, name),
    timeout,
    label: `${name} window gone`
  };
}

export function windowRect(profile: AppProfile, name: string, minWidth: number, minHeight: number): RuntimeAssertion {
  return {
    type: "window-rect",
    selector: selector(profile, name),
    minWidth,
    minHeight,
    label: `${name} window has usable rect`
  };
}
