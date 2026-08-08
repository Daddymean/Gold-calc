/**
 * Wraps app.json so the web build can be pointed at a subpath.
 *
 * GitHub Pages serves a project site from /<repo>/, not the domain root, so
 * every asset and route URL needs that prefix. Local development and the native
 * builds must NOT have it, hence the environment variable rather than a value
 * committed into app.json.
 *
 *   EXPO_PUBLIC_BASE_URL=/Gold-calc npx expo export -p web
 */
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_PUBLIC_BASE_URL;

  return {
    ...config,
    experiments: {
      ...config.experiments,
      ...(baseUrl ? { baseUrl } : {}),
    },
  };
};
