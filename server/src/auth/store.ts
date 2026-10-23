// Penyimpanan akun dan sesi login. `PrismaStore` (PostgreSQL) dipakai bila DATABASE_URL
// diatur; tanpa itu `MemoryStore` (hilang saat server mulai ulang), cocok untuk uji/dev.

import type { CharacterChoice, Role } from "@mita/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";

export type AccountStatus = "menunggu" | "disetujui" | "ditolak" | "nonaktif";
export const ACCOUNT_STATUSES: AccountStatus[] = ["menunggu", "disetujui", "ditolak", "nonaktif"];

export interface AccountRecord {
  id: string;
  role: Role;
  loginId: string;
  fullName: string;
  passwordHash: string;
  mustChangePassword: boolean;
  status: AccountStatus;
  character: CharacterChoice | null;
  createdAt: Date;
  reviewedAt: Date | null;
  lastLoginAt: Date | null;
}

export type NewAccount = Pick<AccountRecord, "role" | "loginId" | "fullName" | "passwordHash">;
export type AccountPatch = Partial<Pick<AccountRecord, "status" | "passwordHash" | "mustChangePassword" | "character" | "reviewedAt" | "lastLoginAt">>;

export class DuplicateError extends Error {}

export interface AccountStore {
  /** false = akun hilang saat server mulai ulang (tanpa database). */
  readonly persistent: boolean;
  create(a: NewAccount): Promise<AccountRecord>;
  byLoginId(loginId: string): Promise<AccountRecord | null>;
  byId(id: string): Promise<AccountRecord | null>;
  update(id: string, patch: AccountPatch): Promise<AccountRecord | null>;
  delete(id: string): Promise<void>;
  list(): Promise<AccountRecord[]>;
  createSession(tokenHash: string, accountId: string, expiresAt: Date): Promise<void>;
  /** Akun pemilik sesi yang belum kedaluwarsa. */
  sessionAccount(tokenHash: string, now: Date): Promise<AccountRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteSessionsOf(accountId: string): Promise<void>;
  deleteExpiredSessions(now: Date): Promise<void>;
  close(): Promise<void>;
}

export class MemoryStore implements AccountStore {
  readonly persistent = false;
  private readonly accounts = new Map<string, AccountRecord>();
  private readonly sessions = new Map<string, { accountId: string; expiresAt: Date }>();

  async create(a: NewAccount): Promise<AccountRecord> {
    if ([...this.accounts.values()].some((x) => x.loginId === a.loginId)) throw new DuplicateError();
    const rec: AccountRecord = {
      ...a,
      id: crypto.randomUUID(),
      mustChangePassword: false,
      status: "menunggu",
      character: null,
      createdAt: new Date(),
      reviewedAt: null,
      lastLoginAt: null,
    };
    this.accounts.set(rec.id, rec);
    return { ...rec };
  }
  async byLoginId(loginId: string) {
    const a = [...this.accounts.values()].find((x) => x.loginId === loginId);
    return a ? { ...a } : null;
  }
  async byId(id: string) {
    const a = this.accounts.get(id);
    return a ? { ...a } : null;
  }
  async update(id: string, patch: AccountPatch) {
    const a = this.accounts.get(id);
    if (!a) return null;
    Object.assign(a, patch);
    return { ...a };
  }
  async delete(id: string) {
    this.accounts.delete(id);
    await this.deleteSessionsOf(id);
  }
  async list() {
    return [...this.accounts.values()].map((a) => ({ ...a }));
  }
  async createSession(tokenHash: string, accountId: string, expiresAt: Date) {
    this.sessions.set(tokenHash, { accountId, expiresAt });
  }
  async sessionAccount(tokenHash: string, now: Date) {
    const s = this.sessions.get(tokenHash);
    if (!s || s.expiresAt <= now) return null;
    return this.byId(s.accountId);
  }
  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async deleteSessionsOf(accountId: string) {
    for (const [k, s] of this.sessions) if (s.accountId === accountId) this.sessions.delete(k);
  }
  async deleteExpiredSessions(now: Date) {
    for (const [k, s] of this.sessions) if (s.expiresAt <= now) this.sessions.delete(k);
  }
  async close() {}
}

type Row = Awaited<ReturnType<PrismaClient["account"]["findUnique"]>>;
const fromRow = (r: NonNullable<Row>): AccountRecord => ({ ...r, character: (r.character as CharacterChoice | null) ?? null });
const toData = (p: AccountPatch) => {
  const { character, ...rest } = p;
  return character === undefined ? rest : { ...rest, character: character === null ? Prisma.DbNull : (character as unknown as Prisma.InputJsonValue) };
};

export class PrismaStore implements AccountStore {
  readonly persistent = true;
  private readonly db: PrismaClient;

  constructor(connectionString: string) {
    this.db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }

  async create(a: NewAccount) {
    try {
      return fromRow(await this.db.account.create({ data: a }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DuplicateError();
      throw e;
    }
  }
  async byLoginId(loginId: string) {
    const r = await this.db.account.findUnique({ where: { loginId } });
    return r ? fromRow(r) : null;
  }
  async byId(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = await this.db.account.findUnique({ where: { id } });
    return r ? fromRow(r) : null;
  }
  async update(id: string, patch: AccountPatch) {
    const r = await this.db.account.updateMany({ where: { id }, data: toData(patch) });
    return r.count ? this.byId(id) : null;
  }
  async delete(id: string) {
    await this.db.account.deleteMany({ where: { id } });
  }
  async list() {
    return (await this.db.account.findMany({ orderBy: { createdAt: "desc" } })).map(fromRow);
  }
  async createSession(tokenHash: string, accountId: string, expiresAt: Date) {
    await this.db.session.create({ data: { tokenHash, accountId, expiresAt } });
  }
  async sessionAccount(tokenHash: string, now: Date) {
    const s = await this.db.session.findUnique({ where: { tokenHash }, include: { account: true } });
    return s && s.expiresAt > now ? fromRow(s.account) : null;
  }
  async deleteSession(tokenHash: string) {
    await this.db.session.deleteMany({ where: { tokenHash } });
  }
  async deleteSessionsOf(accountId: string) {
    await this.db.session.deleteMany({ where: { accountId } });
  }
  async deleteExpiredSessions(now: Date) {
    await this.db.session.deleteMany({ where: { expiresAt: { lte: now } } });
  }
  async close() {
    await this.db.$disconnect();
  }
}
