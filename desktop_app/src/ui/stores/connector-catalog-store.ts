import { create } from 'zustand';

import {
  type ArchestraMcpServerManifest,
  getMcpServerCategories,
  searchMcpServerCatalog,
} from '@ui/lib/clients/archestra/catalog/gen';

/**
 * NOTE: ideally should be divisible by 3 to make it look nice in the UI (as we tend to have 3 "columns" of servers)
 */
const CATALOG_PAGE_SIZE = 24;

/**
 * TODO: This is temporary test data. Remove once catalog API returns user_config
 *
 * Right now user_config is in the returned objects, but we haven't yet actually populated
 * any data into user_config in our catalog objects
 */
const TEST_USER_CONFIG: ArchestraMcpServerManifest['user_config'] = {
  allowed_directories: {
    type: 'directory',
    title: 'Allowed Directories',
    description: 'Directories the server can access',
    multiple: true,
    required: true,
    default: ['${HOME}/Desktop'],
  },
  api_key: {
    type: 'string',
    title: 'API Key',
    description: 'Your API key for authentication',
    sensitive: true,
    required: false,
  },
  max_file_size: {
    type: 'number',
    title: 'Maximum File Size (MB)',
    description: 'Maximum file size to process',
    default: 10,
    min: 1,
    max: 100,
  },
};

interface ConnectorCatalogState {
  connectorCatalog: ArchestraMcpServerManifest[];
  loadingConnectorCatalog: boolean;
  errorFetchingConnectorCatalog: string | null;

  connectorCatalogCategories: string[];
  loadingConnectorCatalogCategories: boolean;
  errorFetchingConnectorCatalogCategories: string | null;

  catalogSearchQuery: string;
  catalogSelectedCategory: string;
  catalogHasMore: boolean;
  catalogTotalCount: number;
  catalogOffset: number;
}

interface ConnectorCatalogActions {
  loadConnectorCatalog: (append?: boolean) => Promise<void>;
  loadConnectorCatalogCategories: () => Promise<void>;
  loadMoreCatalogServers: () => Promise<void>;
  setCatalogSearchQuery: (query: string) => void;
  setCatalogSelectedCategory: (category: string) => void;
  resetCatalogSearch: () => void;

  _init: () => void;
}

type ConnectorCatalogStore = ConnectorCatalogState & ConnectorCatalogActions;

export const useConnectorCatalogStore = create<ConnectorCatalogStore>((set, get) => ({
  // State
  connectorCatalog: [],
  loadingConnectorCatalog: false,
  errorFetchingConnectorCatalog: null,
  catalogSearchQuery: '',
  catalogSelectedCategory: 'all',
  catalogHasMore: true,
  catalogTotalCount: 0,
  catalogOffset: 0,

  connectorCatalogCategories: [],
  loadingConnectorCatalogCategories: false,
  errorFetchingConnectorCatalogCategories: null,

  // Actions
  loadConnectorCatalog: async (append = false) => {
    const { catalogSearchQuery, catalogSelectedCategory, catalogOffset } = get();

    try {
      set({
        loadingConnectorCatalog: true,
        errorFetchingConnectorCatalog: null,
      });

      const params: any = {
        limit: CATALOG_PAGE_SIZE,
        offset: append ? catalogOffset : 0,
      };

      if (catalogSearchQuery) {
        params.q = catalogSearchQuery;
      }

      if (catalogSelectedCategory && catalogSelectedCategory !== 'all') {
        params.category = catalogSelectedCategory;
      }

      const { data } = await searchMcpServerCatalog({ query: params });

      if (data) {
        /**
         * NOTE: see the note above about TEST_USER_CONFIG
         * remove this once we have real "user config" data
         */
        const serversWithUserConfig = (data.servers || []).map((server) => ({
          ...server,
          user_config: TEST_USER_CONFIG,
        }));

        set({
          connectorCatalog: append ? [...get().connectorCatalog, ...serversWithUserConfig] : serversWithUserConfig,
          catalogHasMore: data.hasMore || false,
          catalogTotalCount: data.totalCount || 0,
          catalogOffset: append ? get().catalogOffset + CATALOG_PAGE_SIZE : CATALOG_PAGE_SIZE,
        });
      }
    } catch (error) {
      set({ errorFetchingConnectorCatalog: error as string });
    } finally {
      set({ loadingConnectorCatalog: false });
    }
  },

  loadConnectorCatalogCategories: async () => {
    try {
      set({ loadingConnectorCatalogCategories: true, errorFetchingConnectorCatalogCategories: null });
      const { data } = await getMcpServerCategories();
      set({ connectorCatalogCategories: data.categories });
    } catch (error) {
      set({ errorFetchingConnectorCatalogCategories: error as string });
    } finally {
      set({ loadingConnectorCatalogCategories: false });
    }
  },

  loadMoreCatalogServers: async () => {
    const { catalogHasMore, loadingConnectorCatalog } = get();
    if (!catalogHasMore || loadingConnectorCatalog) return;

    await get().loadConnectorCatalog(true);
  },

  setCatalogSearchQuery: (query: string) => {
    set({
      catalogSearchQuery: query,
      catalogOffset: 0,
    });
    get().loadConnectorCatalog();
  },

  setCatalogSelectedCategory: (category: string) => {
    set({
      catalogSelectedCategory: category,
      catalogOffset: 0,
    });
    get().loadConnectorCatalog();
  },

  resetCatalogSearch: () => {
    set({
      catalogSearchQuery: '',
      catalogSelectedCategory: 'all',
      catalogOffset: 0,
      catalogHasMore: true,
    });
    get().loadConnectorCatalog();
  },

  _init: () => {
    const { loadConnectorCatalog, loadConnectorCatalogCategories } = get();

    loadConnectorCatalog();
    loadConnectorCatalogCategories();
  },
}));

/**
 * Initialize data on store creation
 */
useConnectorCatalogStore.getState()._init();
