const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Disable experimental package exports feature
config.resolver.unstable_enablePackageExports = false;

// Add 'cjs' to source extensions
config.resolver.sourceExts.push('cjs');

module.exports = config;

