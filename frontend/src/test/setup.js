import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jest-dom registers its matchers on the `expect` instance it imports from
// `vitest`. If a dual-package hazard ever produces a second `expect`, the
// matchers silently land on the wrong instance. Force them onto the instance
// the test files import so the component tests can never regress to
// "Invalid Chai property: toBeInTheDocument".
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
expect.extend(jestDomMatchers);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
