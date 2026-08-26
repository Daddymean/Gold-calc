// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  root: true,
  extends: ['expo'],
  // Build output and dependencies. 'dist*' covers the analysis builds too —
  // linting a Metro bundle produces thousands of meaningless findings and
  // buries the real ones.
  ignorePatterns: ['dist*/', 'node_modules/', '.expo/', 'web-build/'],
  rules: {
    // Warned by default; a missed dependency is exactly the class of bug that
    // produced the blank price chart, so here it fails the build. The handful
    // of deliberate exceptions carry an eslint-disable line and a reason.
    'react-hooks/exhaustive-deps': 'error',
  },
};
