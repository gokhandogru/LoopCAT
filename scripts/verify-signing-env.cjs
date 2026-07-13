const platform = (process.argv.slice(2).find((value) => value !== "--") || "").toLowerCase();

const groupsByPlatform = {
  win: [
    {
      label: "Windows Authenticode certificate",
      alternatives: [
        ["CSC_LINK", "CSC_KEY_PASSWORD"],
        ["WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD"]
      ]
    }
  ],
  mac: [
    {
      label: "macOS Developer ID certificate",
      alternatives: [["CSC_LINK", "CSC_KEY_PASSWORD"]]
    },
    {
      label: "macOS notarization credentials",
      alternatives: [
        ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"],
        ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD"],
        ["APPLE_KEYCHAIN", "APPLE_KEYCHAIN_PROFILE"]
      ]
    }
  ],
  linux: []
};

function usage() {
  console.error("Usage: node scripts/verify-signing-env.cjs <win|mac|linux>");
  process.exit(1);
}

function hasValue(name) {
  return Boolean(String(process.env[name] || "").trim());
}

function missingFromAlternative(names) {
  return names.filter((name) => !hasValue(name));
}

function summarizeAlternative(names) {
  return names.join(" + ");
}

if (!Object.hasOwn(groupsByPlatform, platform)) usage();

const failures = [];
const satisfied = [];

for (const group of groupsByPlatform[platform]) {
  const matched = group.alternatives.find((names) => missingFromAlternative(names).length === 0);
  if (matched) {
    satisfied.push(`${group.label}: ${summarizeAlternative(matched)}`);
    continue;
  }

  const alternatives = group.alternatives.map((names) => {
    const missing = missingFromAlternative(names);
    return `${summarizeAlternative(names)} (missing ${missing.join(", ")})`;
  });
  failures.push(`${group.label} requires one complete set: ${alternatives.join(" or ")}`);
}

if (failures.length) {
  console.error(`Signing environment verification failed for ${platform}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (platform === "linux") {
  console.log("Signing environment verification passed for linux. Keep checksum generation and verification in the release gate.");
} else {
  console.log(`Signing environment verification passed for ${platform}:`);
  for (const line of satisfied) console.log(`- ${line}`);
}
