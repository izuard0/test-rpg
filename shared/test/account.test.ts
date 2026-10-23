import { describe, expect, it } from "vitest";
import { normalizeId, validateRegistration } from "../src/index.js";

const ok = { role: "mahasiswa" as const, id: "2201010123", fullName: "Siti Aminah", password: "rahasia123", password2: "rahasia123" };

describe("validasi pendaftaran", () => {
  it("menerima data yang sah", () => {
    expect(validateRegistration(ok)).toEqual({});
  });

  it("NIM boleh ditulis dengan spasi atau titik", () => {
    expect(normalizeId("22.0101 0123")).toBe("2201010123");
    expect(validateRegistration({ ...ok, id: "22.0101 0123" })).toEqual({});
  });

  it("menolak NIM berisi huruf dan kata sandi yang tidak sama", () => {
    const e = validateRegistration({ ...ok, id: "A123456", password2: "beda12345" });
    expect(e.id).toMatch(/angka/);
    expect(e.password2).toBeDefined();
  });

  it("menolak kata sandi pendek atau sama dengan NIP", () => {
    expect(validateRegistration({ ...ok, password: "pendek", password2: "pendek" }).password).toBeDefined();
    const nip = "198001012005011001";
    expect(validateRegistration({ ...ok, role: "dosen", id: nip, password: nip, password2: nip }).password).toMatch(/NIP/);
  });

  it("menerima nama dengan apostrof dan tanda hubung, menolak angka", () => {
    expect(validateRegistration({ ...ok, fullName: "Nur'aini Al-Farabi" })).toEqual({});
    expect(validateRegistration({ ...ok, fullName: "Budi 123" }).fullName).toBeDefined();
  });
});
