export interface Repository<T> {
  get(): Promise<T>;
  set(value: T): Promise<void>;
  clear(): Promise<void>;
}

export interface StorageItem<T> {
  schemaVersion: number;
  value: T;
}

export interface StorageAdapter {
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: unknown): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

export const STORAGE_SCHEMA_VERSION = 1;

export function isStorageItem<T>(value: unknown): value is StorageItem<T> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<StorageItem<T>>;
  return typeof candidate.schemaVersion === "number" && "value" in candidate;
}

export function migrateStorageValue<T>(stored: unknown, fallback: T, migration: (legacy: unknown) => T): T {
  if (stored === undefined) {
    return fallback;
  }

  if (!isStorageItem<T>(stored)) {
    return migration(stored);
  }

  if (stored.schemaVersion === STORAGE_SCHEMA_VERSION) {
    return stored.value ?? fallback;
  }

  return migration(stored);
}

export function exampleLegacyProfileMigration(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return { name: "", email: "" };
  }

  const record = value as Record<string, unknown>;

  return {
    name: typeof record.name === "string" ? record.name : "",
    email: typeof record.email === "string" ? record.email : "",
  };
}

export class FakeStorage implements StorageAdapter {
  private readonly values = new Map<string, unknown>();

  async getItem(key: string): Promise<unknown> {
    return this.values.get(key);
  }

  async setItem(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  async clear(): Promise<void> {
    this.values.clear();
  }
}

declare const chrome:
  | {
      storage?: {
        local?: {
          get: (keys: string | string[] | Record<string, unknown>) => Promise<Record<string, unknown>>;
          set: (items: Record<string, unknown>) => Promise<void>;
          remove: (keys: string | string[]) => Promise<void>;
          clear: () => Promise<void>;
        };
      };
    }
  | undefined;

export function createChromeStorageAdapter(): StorageAdapter {
  if (typeof chrome === "undefined" || chrome.storage?.local == null) {
    return new FakeStorage();
  }

  const localStorage = chrome.storage.local;

  return {
    async getItem(key: string): Promise<unknown> {
      const result = await localStorage.get(key);
      return Object.prototype.hasOwnProperty.call(result, key) ? result[key] : undefined;
    },
    async setItem(key: string, value: unknown): Promise<void> {
      await localStorage.set({ [key]: value });
    },
    async removeItem(key: string): Promise<void> {
      await localStorage.remove(key);
    },
    async clear(): Promise<void> {
      await localStorage.clear();
    },
  };
}

export class ChromeStorageRepository<T> implements Repository<T> {
  private readonly adapter: StorageAdapter;

  constructor(
    private readonly key: string,
    private readonly fallbackValue: T,
    private readonly validator: (value: unknown) => value is T,
    private readonly migration: (legacy: unknown) => T = () => fallbackValue,
    adapter: StorageAdapter = createChromeStorageAdapter(),
  ) {
    this.adapter = adapter;
  }

  async get(): Promise<T> {
    const stored = await this.adapter.getItem(this.key);
    const nextValue = migrateStorageValue(stored, this.fallbackValue, this.migration);

    if (!this.validator(nextValue)) {
      console.warn(`Invalid storage payload for ${this.key}; using fallback.`);
      return this.fallbackValue;
    }

    return nextValue;
  }

  async set(value: T): Promise<void> {
    const payload: StorageItem<T> = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      value,
    };

    await this.adapter.setItem(this.key, payload);
  }

  async clear(): Promise<void> {
    await this.adapter.removeItem(this.key);
  }
}

export function createRepository<T>(
  key: string,
  fallbackValue: T,
  validator: (value: unknown) => value is T,
  migration: (legacy: unknown) => T = () => fallbackValue,
  adapter: StorageAdapter = createChromeStorageAdapter(),
): Repository<T> {
  return new ChromeStorageRepository(key, fallbackValue, validator, migration, adapter);
}
