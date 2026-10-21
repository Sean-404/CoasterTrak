import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default [
  // Third-party code vendored as-is (see vendor/braces/README.vendor.md).
  { ignores: ["vendor/**"] },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];
