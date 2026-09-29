import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

export const initPostHog = () => {
  if (!POSTHOG_KEY) {
    console.warn('PostHog key is missing (VITE_PUBLIC_POSTHOG_KEY)');
    return;
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,

    // Only create person profiles for users you call identify() on
    person_profiles: 'identified_only',

    // Captures a $pageview on every React Router navigation automatically,
    // so no manual pageview tracking is needed
    capture_pageview: 'history_change',
    capture_pageleave: true,

    autocapture: true,
    persistence: 'localStorage',

    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug();
    },
  });
};

export default posthog;