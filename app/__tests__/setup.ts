// Per-file setup that runs once per worker before any test starts.
// Enables jest-dom matchers (toBeInTheDocument, toHaveClass, etc.) on
// the default `expect` and ensures the testing-library cleanup runs
// after every test (kills mounted React trees between specs).

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
