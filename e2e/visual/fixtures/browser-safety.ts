// The real One Tap hook runs, but finds this inert local SDK instead of loading Google.
Object.defineProperty(window, 'google', {
  configurable: false,
  value: {
    accounts: {
      id: {
        initialize: () => undefined,
        prompt: () => undefined,
        renderButton: () => undefined,
      },
    },
  },
});
