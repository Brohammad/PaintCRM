import {
  ONBOARDING_STEPS,
  defaultOnboardingState,
  loadOnboardingState,
  saveOnboardingState,
  markOnboardingStep,
  dismissOnboarding,
  isOnboardingComplete,
  shouldShowOnboarding,
  onboardingProgress,
  ONBOARDING_STORAGE_KEY,
} from './onboarding.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe('onboarding checklist', () => {
  it('starts empty and incomplete', () => {
    const state = defaultOnboardingState();
    expect(state).toEqual({ photo: false, lead: false, quote: false, dismissed: false });
    expect(shouldShowOnboarding(state)).toBe(true);
    expect(isOnboardingComplete(state)).toBe(false);
  });

  it('persists step progress', () => {
    const storage = memoryStorage();
    markOnboardingStep('photo', storage);
    markOnboardingStep('lead', storage);
    const loaded = loadOnboardingState(storage);
    expect(loaded.photo).toBe(true);
    expect(loaded.lead).toBe(true);
    expect(loaded.quote).toBe(false);
    expect(onboardingProgress(loaded)).toEqual({ done: 2, total: 3 });
  });

  it('hides when dismissed or fully complete', () => {
    const storage = memoryStorage();
    markOnboardingStep('photo', storage);
    markOnboardingStep('lead', storage);
    markOnboardingStep('quote', storage);
    expect(shouldShowOnboarding(loadOnboardingState(storage))).toBe(false);

    const again = memoryStorage();
    saveOnboardingState({ photo: true, lead: false, quote: false, dismissed: false }, again);
    dismissOnboarding(again);
    expect(shouldShowOnboarding(loadOnboardingState(again))).toBe(false);
    expect(JSON.parse(again.getItem(ONBOARDING_STORAGE_KEY)).dismissed).toBe(true);
  });

  it('ignores unknown steps', () => {
    const storage = memoryStorage();
    const state = markOnboardingStep('nope', storage);
    expect(state).toEqual(defaultOnboardingState());
    expect(ONBOARDING_STEPS.map((s) => s.id)).toEqual(['photo', 'lead', 'quote']);
  });
});
