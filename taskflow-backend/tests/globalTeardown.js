module.exports = async function globalTeardown() {
  // Each test suite closes its own DB pool / Redis connections in
  // afterAll (see tests/helpers/*), so there's nothing global to clean up.
};
