function requestedPlatforms(args) {
  const platforms = new Set();
  for (const arg of args) {
    if (arg === "--mac" || arg === "--macos") platforms.add("darwin");
    if (arg === "--linux") platforms.add("linux");
    if (arg === "--win" || arg === "--windows") platforms.add("win32");
    // Only actual platform shorthand can be grouped. Config overrides such as
    // -c.mac.entitlements=... contain these letters but do not select platforms.
    if (/^-[mlw]+$/.test(arg)) {
      if (arg.includes("m")) platforms.add("darwin");
      if (arg.includes("l")) platforms.add("linux");
      if (arg.includes("w")) platforms.add("win32");
    }
  }
  return platforms;
}

module.exports = { requestedPlatforms };
