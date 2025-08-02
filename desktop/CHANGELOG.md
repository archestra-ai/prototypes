# Changelog

## [0.0.7](https://github.com/archestra-ai/archestra/compare/desktop-v0.0.6...desktop-v0.0.7) (2025-08-02)


### Bug Fixes

* Fix Ollama host trailing slash in Ollama API requests ([#99](https://github.com/archestra-ai/archestra/issues/99)) ([292968c](https://github.com/archestra-ai/archestra/commit/292968c93a36749f72dd88a6c4401407ba54f369))


### Dependencies

* **backend:** bump the rust-dependencies group in /desktop/src-tauri with 2 updates ([#101](https://github.com/archestra-ai/archestra/issues/101)) ([ac99dbe](https://github.com/archestra-ai/archestra/commit/ac99dbe96f15a15a7b23f077a2625cfc6489fbca))
* **frontend:** bump the frontend-dependencies group in /desktop with 8 updates ([#103](https://github.com/archestra-ai/archestra/issues/103)) ([ef9e866](https://github.com/archestra-ai/archestra/commit/ef9e8664fd8f384999ae83b26415e8054fbe3aec))


### Code Refactoring

* move oauth module to gateway/api + move sandbox module ([#96](https://github.com/archestra-ai/archestra/issues/96)) ([3f92def](https://github.com/archestra-ai/archestra/commit/3f92defdc64086f303c21d01631342a6a55f3e78))
* update `MCPServer` model to use JSON type for `server_config`, remove `MCPServerDefinition` from openapi-spec/frontend + drop `mcp_server.meta` column/references ([#100](https://github.com/archestra-ai/archestra/issues/100)) ([c9895ae](https://github.com/archestra-ai/archestra/commit/c9895ae90c85892d811fc759373190ab9fed669e))


### Miscellaneous Chores

* add comment to OllamaClient.generate_title about using a static model for this ([4875104](https://github.com/archestra-ai/archestra/commit/487510474fe50572a7a36b30a4dfc4f8216affdf))
* chat persistence/UI fully working ([#86](https://github.com/archestra-ai/archestra/issues/86)) ([b11fcb6](https://github.com/archestra-ai/archestra/commit/b11fcb615bd4382d652c553017c0ba5ee8b68725))
* fix (some of the) chat UI styling ([#84](https://github.com/archestra-ai/archestra/issues/84)) ([def9f3a](https://github.com/archestra-ai/archestra/commit/def9f3aa071f5f851e9157654727a82ec7a663b2))
* Fix toolcalls and add fetch mcp server ([#97](https://github.com/archestra-ai/archestra/issues/97)) ([382e1fd](https://github.com/archestra-ai/archestra/commit/382e1fd46d5f3e31e807a5b076d589fe101816de))
* Refactor chat with vercel/ai ([#111](https://github.com/archestra-ai/archestra/issues/111)) ([9e11633](https://github.com/archestra-ai/archestra/commit/9e11633be67bd8cf965540dc2f770f4d05468cfe))
* refactor Tauri events/listeners to use websockets ([#87](https://github.com/archestra-ai/archestra/issues/87)) ([7030e79](https://github.com/archestra-ai/archestra/commit/7030e794aeaf9e648021441da280a12f5c7db7bf))
* rename all references to `interactions` to `messages` (related to chat messages) ([#88](https://github.com/archestra-ai/archestra/issues/88)) ([8078395](https://github.com/archestra-ai/archestra/commit/80783957e37118a3aaa29c9488f6fab4b367d5f5))
* trigger release-please ([a3569c1](https://github.com/archestra-ai/archestra/commit/a3569c1451289f200fece71b1bb7924e89ed7666))

## [0.0.6](https://github.com/archestra-ai/archestra/compare/desktop-v0.0.5...desktop-v0.0.6) (2025-07-26)

### Features

- Chat CRUD + persist chats/messages + LLM-generated chat title ([#65](https://github.com/archestra-ai/archestra/issues/65)) ([666f2f4](https://github.com/archestra-ai/archestra/commit/666f2f43cc5dca23b1fbdf6dccc82f8ff100c0a7))

## [0.0.5](https://github.com/archestra-ai/archestra/compare/desktop-v0.0.4...desktop-v0.0.5) (2025-07-25)

### Miscellaneous Chores

- trigger build ([3735453](https://github.com/archestra-ai/archestra/commit/37354531595270c3c0944fda386861ae1407d54f))
- trigger build ([1a56580](https://github.com/archestra-ai/archestra/commit/1a56580c7c367dbaa41d4c2b04166db3be55b6b2))

## [0.0.4](https://github.com/archestra-ai/archestra/compare/desktop-v0.0.3...desktop-v0.0.4) (2025-07-25)

### Bug Fixes

- CI ([#77](https://github.com/archestra-ai/archestra/issues/77)) ([f3e0e74](https://github.com/archestra-ai/archestra/commit/f3e0e740e48955ae8b074e914f5f9125c05e10f5))

## [0.0.3](https://github.com/archestra-ai/archestra/compare/desktop-v0.0.2...desktop-v0.0.3) (2025-07-25)

### Bug Fixes

- improve Ollama server lifecycle management and app shutdown ([#74](https://github.com/archestra-ai/archestra/issues/74)) ([bb99422](https://github.com/archestra-ai/archestra/commit/bb994224b3d4e643371f3a31a27b1683a895d31e))

## [0.0.2](https://github.com/archestra-ai/archestra/compare/desktop-v0.0.1...desktop-v0.0.2) (2025-07-25)

### Dependencies

- **backend:** bump the rust-dependencies group in /desktop/src-tauri with 2 updates ([#57](https://github.com/archestra-ai/archestra/issues/57)) ([35a4934](https://github.com/archestra-ai/archestra/commit/35a49341716be1fa4eaa816eb0bf36b5b78deb14))
- **frontend:** bump react, react-dom and @types/react in /desktop ([#59](https://github.com/archestra-ai/archestra/issues/59)) ([24fe43a](https://github.com/archestra-ai/archestra/commit/24fe43a85616ce50ea28cb3e9aa70bb44cf85ec3))
- **frontend:** bump the frontend-dependencies group in /desktop with 12 updates ([#58](https://github.com/archestra-ai/archestra/issues/58)) ([eb396b5](https://github.com/archestra-ai/archestra/commit/eb396b5ec61090cf860e3a8c193fcbffe5fe73d8))
- **frontend:** bump vite from 6.3.5 to 7.0.6 in /desktop ([#60](https://github.com/archestra-ai/archestra/issues/60)) ([da0321c](https://github.com/archestra-ai/archestra/commit/da0321c250147b04067cbf4b3ae0da064955051b))

### Miscellaneous Chores

- trigger release ([#72](https://github.com/archestra-ai/archestra/issues/72)) ([48d4315](https://github.com/archestra-ai/archestra/commit/48d4315eddef0ea3449c233591454dde4875a383))
