// First-run checklist: photo → lead → quote. Pure state so Vitest can cover it
// without DOM. Progress lives in localStorage until the dealer dismisses it.

export const ONBOARDING_STORAGE_KEY = 'paintcrm_onboarding_v1';

export const ONBOARDING_STEPS = [
  {
    id: 'photo',
    label: 'Upload a room photo',
    hint: 'Tap Upload Room Photo',
  },
  {
    id: 'lead',
    label: 'Capture a lead',
    hint: 'Use Contact Dealer after picking a shade',
  },
  {
    id: 'quote',
    label: 'Create a quote',
    hint: 'Sign in, then open Quotes',
  },
];

const DEFAULT_STATE = Object.freeze({
  photo: false,
  lead: false,
  quote: false,
  dismissed: false,
});

export function defaultOnboardingState() {
  return { ...DEFAULT_STATE };
}

export function loadOnboardingState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(ONBOARDING_STORAGE_KEY);
    if (!raw) return defaultOnboardingState();
    const parsed = JSON.parse(raw);
    return {
      photo: Boolean(parsed.photo),
      lead: Boolean(parsed.lead),
      quote: Boolean(parsed.quote),
      dismissed: Boolean(parsed.dismissed),
    };
  } catch {
    return defaultOnboardingState();
  }
}

export function saveOnboardingState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function markOnboardingStep(stepId, storage = globalThis.localStorage) {
  if (!ONBOARDING_STEPS.some((s) => s.id === stepId)) {
    return loadOnboardingState(storage);
  }
  const next = { ...loadOnboardingState(storage), [stepId]: true };
  saveOnboardingState(next, storage);
  return next;
}

export function dismissOnboarding(storage = globalThis.localStorage) {
  const next = { ...loadOnboardingState(storage), dismissed: true };
  saveOnboardingState(next, storage);
  return next;
}

export function isOnboardingComplete(state) {
  return Boolean(state?.photo && state?.lead && state?.quote);
}

export function shouldShowOnboarding(state = loadOnboardingState()) {
  if (state.dismissed) return false;
  return !isOnboardingComplete(state);
}

export function onboardingProgress(state) {
  const done = ONBOARDING_STEPS.filter((s) => state[s.id]).length;
  return { done, total: ONBOARDING_STEPS.length };
}
