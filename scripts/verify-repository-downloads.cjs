"use strict";

const path = require("node:path");
const { verifyRepositoryDownloads } = require("./repository-build-identity.cjs");

try {
  const release = verifyRepositoryDownloads(path.resolve(__dirname, ".."));
  console.log(
    `Repository downloads verified: ${release.identity.buildId}; ${release.artifacts.length} matching ZIPs and checksums.`
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
