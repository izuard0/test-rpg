// Tampilan kepala layar: nama ruangan/zona, penanda aksi, layar muat, galat.

import type { Zone } from "@mita/shared";

const ZONE_TITLE: Record<string, string> = {
  luar: "Halaman kampus",
  lobi: "Lobi",
  perpustakaan: "Perpustakaan Al-Khawarizmi",
  koridor: "Koridor",
  santai: "Ruang Santai",
  "diskusi-a": "Ruang Diskusi A",
  "diskusi-b": "Ruang Diskusi B",
  "bilik-fokus": "Bilik Fokus",
  "kelas-a": "Lab Lovelace",
  "kelas-b": "Ruang Kolaborasi",
  "kelas-c": "Auditorium Turing",
};

const el = (id: string) => document.getElementById(id)!;

export function setHud(roomTitle: string, zone: Zone | undefined): void {
  const place = zone ? ZONE_TITLE[zone.name] ?? zone.name : roomTitle;
  el("place").textContent = place;
  el("chat-rule").textContent = zone
    ? `Obrolan sekitar: ${zone.chatRadius} petak${zone.chatPublic ? " · publik aktif" : " · ruang tenang"}`
    : "";
}

export function setPrompt(label: string | null): void {
  const p = el("prompt");
  p.hidden = !label;
  if (label) p.innerHTML = `<kbd>E</kbd> ${label.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}`;
}

export function showLoading(on: boolean): void {
  el("loading").hidden = !on;
}

export function showError(msg: string): void {
  showLoading(false);
  const e = el("error");
  e.textContent = msg;
  e.hidden = false;
}
