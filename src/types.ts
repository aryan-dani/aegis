export type VaultEntry = {
  id: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  folder?: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type EntryInput = {
  url: string;
  username: string;
  password: string;
  notes: string;
  folder?: string | null;
  tags: string[];
};

export type GeneratePasswordOptions = {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
};

export type BreachCheckResult = {
  found: boolean;
  count: number;
};

export type BiometricStatus = {
  available: boolean;
  enrolled: boolean;
  message: string;
};
