// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  root: true,
  extends: ['expo'],
  ignorePatterns: ['dist/', 'node_modules/'],
  rules: {
    // Warned by default; a missed dependency is exactly the class of bug that
    // produced the blank price chart, so here it fails the build. The handful
    // of deliberate exceptions carry an eslint-disable line and a reason.
    'react-hooks/exhaustive-deps': 'error',
  },
};
