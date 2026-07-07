import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  throw new Error(
    "npm_package_version is not set; run this via `npm version <x.y.z[-pre]>`."
  );
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

// Keep the BRAT beta manifest in lockstep so it can never drift again.
// Mirror version + branding fields from manifest.json.
const betaManifest = JSON.parse(readFileSync("manifest-beta.json", "utf8"));
betaManifest.version = targetVersion;
betaManifest.name = manifest.name;
betaManifest.description = manifest.description;
betaManifest.minAppVersion = minAppVersion;
writeFileSync(
  "manifest-beta.json",
  JSON.stringify(betaManifest, null, 2) + "\n"
);

console.log(
  `Synced manifest.json, manifest-beta.json and versions.json to ${targetVersion} (minAppVersion ${minAppVersion}).`
);
