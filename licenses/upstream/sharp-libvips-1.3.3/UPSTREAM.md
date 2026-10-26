# Native libvips package: exact source and license record

- Verified on 2026-10-26 for `@img/sharp-libvips-linux-x64@1.3.3`.
- The unmodified npm tarball integrity was checked against the registry's SHA512 SRI. Its actual README, package metadata and native component versions are preserved here; native `.so` binaries are not copied into this repository.
- The package declares **LGPL-3.0-or-later**. Its actual README identifies multiple component licenses. The packaging/build repository's Apache-2.0 license applies to those scripts, and does not relicense the bundled native libraries.
- `LGPL-3.0.txt` and the incorporated `GPL-3.0.txt` preserve the full SPDX license texts. `MPL-2.0.txt` preserves the terms identified for cairo. The original libvips 8.18.6 LGPL-2.1 text and verbatim National Gallery copyright/licensing comment are also included; the package's LGPLv3 election uses the upstream “any later version” clause.
- Other component notices, exact versions, copyright attribution and upstream links remain in `PACKAGE-README.md`, `BUILD-THIRD-PARTY-NOTICES.md` and `VERSIONS.json`; the complete source URLs and retrieved-file hashes are in `SOURCES.json`.
- Exact packaging/build source: https://github.com/lovell/sharp-libvips/tree/v1.3.3 and https://github.com/lovell/sharp-libvips/archive/refs/tags/v1.3.3.tar.gz . libvips source: https://github.com/libvips/libvips/tree/v8.18.6 . The build scripts identify source downloads for bundled components.
- These image-processing native libraries are build/server dependencies of Sharp/Next.js. The Pages artifact contains static HTML/CSS/JavaScript and images; this patch does not distribute a native library binary. Redistribution of native binaries would need the corresponding original component obligations and source availability to be reviewed for that distribution.
- Project-owned MIT notices and the existing GSAP Standard License constraints remain separate and unchanged.
