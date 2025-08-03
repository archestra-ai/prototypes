# Changelog

## 1.0.0 (2025-08-03)


### Features

* `podman` first-pass ([#140](https://github.com/archestra-ai/archestra/issues/140)) ([1e0f78a](https://github.com/archestra-ai/archestra/commit/1e0f78afe2337ff6da89896276b1e7dfeac3d694))
* Add chat crud ([#132](https://github.com/archestra-ai/archestra/issues/132)) ([9f7a92c](https://github.com/archestra-ai/archestra/commit/9f7a92ccebb923445b239a6dc2123162167d1a81))
* create generic `BinaryRunner` class (used for both `ollama` + `podman` binaries) ([#138](https://github.com/archestra-ai/archestra/issues/138)) ([e7d52e5](https://github.com/archestra-ai/archestra/commit/e7d52e5d52dcb9cc0ab62000116f376f870d00e2))
* get `ollama serve` running on app startup ([#123](https://github.com/archestra-ai/archestra/issues/123)) ([bd04511](https://github.com/archestra-ai/archestra/commit/bd04511ad24ef261fa552c3d7f78bf6f8aaa6dc8))
* laying groundwork of `MCPServerSandboxManager`, `SandboxedMCP`, `PodmanMachine`, `PodmanContainer, and `PodmanImage` ([#141](https://github.com/archestra-ai/archestra/issues/141)) ([ecea53b](https://github.com/archestra-ai/archestra/commit/ecea53b8b1af5df9c5728c2fda3a285c1c74a4cb))
* **WIP:** get `podman` sandbox functional ([#142](https://github.com/archestra-ai/archestra/issues/142)) ([5d5d3fd](https://github.com/archestra-ai/archestra/commit/5d5d3fd75a0386b8aa63e5d4d95d0944b5bd11d3))


### Bug Fixes

* Chat streaming fix ([ab5ccd8](https://github.com/archestra-ai/archestra/commit/ab5ccd833876efbb9f8948ae9fcc1a4084477ef3))
* coreect assistant response ([83f6389](https://github.com/archestra-ai/archestra/commit/83f6389a29f466f98f10f7f1f0cd3903106c864d))
* Fix chat initialization ([089a3b0](https://github.com/archestra-ai/archestra/commit/089a3b0da884ca23304d76ca61b7edcce89f1298))
* Fix chat streaming ([#143](https://github.com/archestra-ai/archestra/issues/143)) ([a2bbac3](https://github.com/archestra-ai/archestra/commit/a2bbac3b86c1a01d23412c15975009c262ccc79f))
* Fix import ([#139](https://github.com/archestra-ai/archestra/issues/139)) ([1d21c14](https://github.com/archestra-ai/archestra/commit/1d21c149b89f4652d1f8f724d3ecd59ece9c0cad))
* Fix migrations after resolving merge conflict ([#135](https://github.com/archestra-ai/archestra/issues/135)) ([732832c](https://github.com/archestra-ai/archestra/commit/732832cbbe0d8a0235b68703b509b3f3a5640e16))
* Messages persistance ([ef37c21](https://github.com/archestra-ai/archestra/commit/ef37c212ed2aa14f99e58ae0dd42a8f424d06be7))
* pnpm fix ([#134](https://github.com/archestra-ai/archestra/issues/134)) ([5b842dd](https://github.com/archestra-ai/archestra/commit/5b842dd9447f910774a850834afa5864c16431ea))
* Route llm through backend ([c8a9661](https://github.com/archestra-ai/archestra/commit/c8a966138a1181de4c605c5b510b7da0f7d6cc37))
* streaming works ([a837878](https://github.com/archestra-ai/archestra/commit/a8378783204ac5eb04fe9d5f6eb7da71a7945f5c))
* Switch UI to UIMessage format ([2129598](https://github.com/archestra-ai/archestra/commit/2129598fff81476bb0a033cf73bad5d8bb354ee2))


### Dependencies

* **frontend:** bump @electron/fuses from 1.8.0 to 2.0.0 in /desktop_app ([#122](https://github.com/archestra-ai/archestra/issues/122)) ([7663fba](https://github.com/archestra-ai/archestra/commit/7663fba32104051672359352b78a19c04698459e))
* **frontend:** bump typescript from 5.8.3 to 5.9.2 in /desktop_app in the frontend-dependencies group ([#121](https://github.com/archestra-ai/archestra/issues/121)) ([038ab86](https://github.com/archestra-ai/archestra/commit/038ab86cc3d272a3139c376b72c9a85206a3394d))


### Miscellaneous Chores

* add `getBinaryExecPath` (precursor to setting up `podman`) ([#136](https://github.com/archestra-ai/archestra/issues/136)) ([f08b1f6](https://github.com/archestra-ai/archestra/commit/f08b1f64bf9d4c617270830014a474fbbb02a47d))
* Add db how-to to README.md ([c6e491a](https://github.com/archestra-ai/archestra/commit/c6e491a1bf801f9f156b0035e4b7dd774c3f18b7))
* all tests passing! ([#133](https://github.com/archestra-ai/archestra/issues/133)) ([77b5c2f](https://github.com/archestra-ai/archestra/commit/77b5c2f9499af59eed19c7b0a95abe73c4b56db3))
* Configure drizzle studio ([#126](https://github.com/archestra-ai/archestra/issues/126)) ([ce96d0f](https://github.com/archestra-ai/archestra/commit/ce96d0fd02e27bfd47a08b64ec2af464f88a7c4a))
* configure vercel/ai ([e11ff22](https://github.com/archestra-ai/archestra/commit/e11ff22f32b98173bbdb53f9f78450246c73d26b))
* fix `ollama serve` + make window slightly larger ([7226c5b](https://github.com/archestra-ai/archestra/commit/7226c5b53ed9cccd7f573c718fa49254568e96d7))
* fix `prettier` issues ([9afa634](https://github.com/archestra-ai/archestra/commit/9afa6348026ac34a2f81f2a474ef4d35b585177a))
* Fix chat initialization and route llms though backend ([#137](https://github.com/archestra-ai/archestra/issues/137)) ([e848a50](https://github.com/archestra-ai/archestra/commit/e848a50c5364ac3a266da2d2a15a2aa376270b4b))
* fix drizzle kit command ([d3881dd](https://github.com/archestra-ai/archestra/commit/d3881dda85caf7975f5dfbebe3b1513d4f9a539e))
* get all current tests passing ([#131](https://github.com/archestra-ai/archestra/issues/131)) ([9f6b096](https://github.com/archestra-ai/archestra/commit/9f6b0960616e0bbece13db5b87b32b337cd1f6b7))
* Move UI to new app ([#120](https://github.com/archestra-ai/archestra/issues/120)) ([48b728b](https://github.com/archestra-ai/archestra/commit/48b728b87c3dac6a3b18e8c9395a72c309690948))
* recreate db migrations ([b440ba8](https://github.com/archestra-ai/archestra/commit/b440ba817db2842a28ff3c22f4b1c415026bc994))
* reorg file-structure to `src/ui` + `src/backend` ([#130](https://github.com/archestra-ai/archestra/issues/130)) ([2b7c93c](https://github.com/archestra-ai/archestra/commit/2b7c93c29b734927a4b5dc16e1cd4c1f8e8f6a4b))
* split server code ([#129](https://github.com/archestra-ai/archestra/issues/129)) ([475cd64](https://github.com/archestra-ai/archestra/commit/475cd64f45d81ed89195078a8cac1277941b07e5))
* Switch to fastify ([#128](https://github.com/archestra-ai/archestra/issues/128)) ([19e2680](https://github.com/archestra-ai/archestra/commit/19e2680e71a2d46cdc6d8a76354269aa8d1c4149))
* tweak `jsx` tsconfig setting to `react-jsx` ([4dda33d](https://github.com/archestra-ai/archestra/commit/4dda33d4b67c0db1449b12bf4ccaf0436d8f1fb3))
* **WIP:** setup testing ([#127](https://github.com/archestra-ai/archestra/issues/127)) ([0deca34](https://github.com/archestra-ai/archestra/commit/0deca345b44cebbacd4eaf48886f98d865860aa9))
