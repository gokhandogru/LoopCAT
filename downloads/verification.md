# LoopCAT 0.0.4-dev.20261106.1 download verification

The [desktop release workflow](https://github.com/gokhandogru/LoopCAT/actions/runs/42229298416) built the unsigned development preview from commit `fdcd3d2900e76f010bfa15917a1a4f19c7d7ec0c`. The Windows, macOS, Linux, web, and combined bundle jobs passed. The web job passed on its second attempt after Chrome timed out during startup on the first runner.

Windows also ran the confirmed-segment TM regression using the XLIFF example from issue #10. Updating the active document added five translations. Running the update again found all five in the TM. The project-wide update included the second document.

The [repository manifest](release.json) records the source fingerprint, sizes, and SHA-256 hashes for the web, Windows installer, and Windows portable ZIPs. Each mirror is a byte-for-byte copy of its release asset. Each platform download was checked against its build checksum. The Linux ZIP was extracted and both files were checked against the original AppImage and DEB.

The [GitHub prerelease](https://github.com/gokhandogru/LoopCAT/releases/tag/preview-0.0.4-dev.20261106.1) includes all ten packages and their SHA-256 checksum list. See the [release notes](../docs/releases/0.0.4-dev.20261106.1.md) for installation details and preview status.
