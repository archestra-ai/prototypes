import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { PublisherGitHubConfig } from '@electron-forge/publisher-github';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

import config from '@backend/config';

const {
  build: { productName, description, authors, appBundleId, prerelease, draft, github },
} = config;

const forgeConfig: ForgeConfig = {
  packagerConfig: {
    /**
     * Whether to package the application's source code into an archive, using Electron's archive format.
     * Reasons why you may want to enable this feature include mitigating issues around long path names on
     * Windows, slightly speeding up require, and concealing your source code from cursory inspection.
     * When the value is true, it passes the default configuration to the asar module
     * https://electron.github.io/packager/main/interfaces/Options.html#asar
     */
    asar: true,
    /**
     * One or more files to be copied directly into the app's Contents/Resources directory for macOS target
     * platforms, and the resources directory for other target platforms. The resources directory can be
     * referenced in the packaged app via the process.resourcesPath value.
     * https://electron.github.io/packager/main/interfaces/Options.html#extraResource
     */
    extraResource: ['./resources/bin'],
    icon: './icons/icon',
    name: productName,
    appBundleId,
  },
  // https://github.com/WiseLibs/better-sqlite3/issues/1171#issuecomment-2186895668
  rebuildConfig: {
    extraModules: ['better-sqlite3'],
    force: true,
  },
  makers: [
    new MakerSquirrel({
      name: productName,
      authors,
      description,
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({
      options: {
        name: productName,
        productName,
        description,
      },
    }),
    new MakerDeb({
      options: {
        name: productName,
        productName,
        description,
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          // Server process entry point - built separately from main process
          // This creates server-process.js that runs our Fastify server
          // in an isolated Node.js process (not Electron)
          entry: 'src/server-process.ts',
          config: 'vite.server.config.ts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: github.owner,
          name: github.repoName,
        },
        prerelease,
        draft,
      } as PublisherGitHubConfig,
    },
  ],
};

export default forgeConfig;
