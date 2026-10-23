// Hash kata sandi dengan scrypt (bawaan Node, tanpa modul native). Format tersimpan:
// scrypt$N$r$p$garam$hash (base64url), jadi parameter bisa dinaikkan tanpa memutus akun lama.

import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (pw: string, salt: Buffer, len: number, o: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, len, o, (e, k) => (e ? rej(e) : res(k))));

const N = 16384, R = 8, P = 1, LEN = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), want.length, { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(key, want);
}

/** Hash tiruan untuk akun yang tidak ada: waktu respons login sama, NIM terdaftar tidak bocor. */
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString("hex")));

/** Kata sandi sementara dari admin (reset): tanpa huruf yang mirip (0/O, 1/l/I). */
export function tempPassword(len = 10): string {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: len }, () => abc[randomInt(abc.length)]).join("");
}
