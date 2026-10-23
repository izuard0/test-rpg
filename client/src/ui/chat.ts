// Kotak chat di kiri bawah (docs/RANCANGAN.md bagian 4). Tiga mode: Sekitar, Global,
// Pribadi. Riwayat hanya di memori selama tab terbuka (tidak di localStorage).
//
// Pesan pribadi mahasiswa ke dosen butuh izin: bila belum diizinkan, pesan pertama
// dikirim sebagai permintaan (pmAsk) dan dosen menjawab Terima/Tolak.

import {
  CHAT_MAX_LEN,
  PM_REQUEST_MAX_LEN,
  privateNeedsApproval,
  type ChatMessage,
  type ChatMode,
  type PmState,
  type Role,
  type S2C,
} from "@mita/shared";
import type { GameNet } from "../net/net";
import { esc } from "./panel";

export interface ChatTarget {
  uid: string;
  name: string;
  role: Role;
}

const MODE_LABEL: Record<ChatMode, string> = { sekitar: "Sekitar", global: "Global", pribadi: "Pribadi", kelas: "Kelas" };
const LOG_MAX = 120;

const STATE_TEXT: Record<PmState, string> = {
  pending: "Permintaan terkirim, menunggu persetujuan",
  accepted: "Permintaan diterima. Silakan chat",
  declined: "Permintaan ditolak",
  expired: "Permintaan kedaluwarsa (tidak dijawab 10 menit)",
  closed: "Percakapan ditutup",
  muted: "Sedang tidak menerima permintaan chat",
  offline: "Sudah tidak daring",
};

class ChatBox {
  private root!: HTMLElement;
  private log!: HTMLElement;
  private input!: HTMLInputElement;
  private modeBtn!: HTMLButtonElement;
  private targetEl!: HTMLElement;
  private mode: ChatMode = "sekitar";
  private target?: ChatTarget;
  private net?: GameNet;
  private me = { uid: "", role: "mahasiswa" as Role, name: "" };
  /** Dosen yang sudah mengizinkan saya (mahasiswa) chat pribadi. */
  private readonly approved = new Set<string>();
  private mutedRequests = false;
  /** Pesan yang sudah tampil (riwayat Global dikirim ulang setiap masuk ruang). */
  private readonly seen = new Set<string>();
  private typing = false;
  /** Di ruang kelas "Global" diganti "Kelas", yang hanya ada selama sesi kelas berjalan. */
  private inClassRoom = false;
  private classActive = false;

  mount(): void {
    if (this.root) return;
    this.root = document.createElement("section");
    this.root.id = "chat";
    this.root.setAttribute("aria-label", "Chat");
    this.root.innerHTML = `
      <header><span class="title">Chat</span><span class="status"></span>
        <button type="button" class="mute" hidden title="Sementara tidak menerima permintaan chat dari mahasiswa">🔕 Bisukan permintaan</button>
        <button type="button" class="fold" title="Kecilkan / besarkan">▾</button></header>
      <div class="log" role="log" aria-live="polite"></div>
      <div class="target" hidden></div>
      <form class="row">
        <button type="button" class="mode" title="Ganti mode (Tab)"></button>
        <input maxlength="${CHAT_MAX_LEN}" placeholder="Tekan Enter untuk mengetik…" autocomplete="off" enterkeyhint="send" />
      </form>`;
    document.getElementById("ui")!.append(this.root);
    const toggle = document.createElement("button");
    toggle.id = "chat-toggle";
    toggle.type = "button";
    toggle.textContent = "💬";
    toggle.setAttribute("aria-label", "Buka chat");
    toggle.onclick = () => this.root.classList.toggle("open");
    document.getElementById("ui")!.append(toggle);
    this.log = this.root.querySelector(".log")!;
    this.input = this.root.querySelector("input")!;
    this.modeBtn = this.root.querySelector(".mode")!;
    this.targetEl = this.root.querySelector(".target")!;

    this.modeBtn.onclick = () => this.cycleMode();
    this.root.querySelector<HTMLButtonElement>(".fold")!.onclick = () => this.root.classList.toggle("folded");
    this.root.querySelector<HTMLButtonElement>(".mute")!.onclick = (e) => {
      this.mutedRequests = !this.mutedRequests;
      (e.currentTarget as HTMLButtonElement).classList.toggle("on", this.mutedRequests);
      (e.currentTarget as HTMLButtonElement).textContent = this.mutedRequests ? "🔔 Terima permintaan" : "🔕 Bisukan permintaan";
      this.net?.send("pmMute", { muted: this.mutedRequests });
      this.system(this.mutedRequests ? "Permintaan chat dari mahasiswa dibisukan." : "Permintaan chat dari mahasiswa diterima lagi.");
    };
    this.root.querySelector("form")!.onsubmit = (e) => {
      e.preventDefault();
      this.submit();
    };
    this.input.addEventListener("focus", () => (this.typing = true));
    this.input.addEventListener("blur", () => (this.typing = false));
    this.input.addEventListener("keydown", (e) => {
      // Tombol game tidak boleh bergerak saat mengetik.
      e.stopPropagation();
      if (e.key === "Escape") this.input.blur();
      if (e.key === "Tab") {
        e.preventDefault();
        this.cycleMode();
      }
    });
    addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || this.typing || document.querySelector(".backdrop") || !this.net?.connected) return;
      e.preventDefault();
      this.root.classList.remove("folded");
      this.input.focus();
    });
    this.renderMode();
  }

  /** Dipanggil setiap masuk ruang. */
  attach(net: GameNet, me: { uid: string; role: Role; name: string }, history: ChatMessage[]): void {
    this.mount();
    this.net = net;
    this.me = me;
    this.root.hidden = false;
    this.root.classList.remove("offline");
    this.root.querySelector<HTMLButtonElement>(".mute")!.hidden = me.role !== "dosen";
    this.setStatus("");
    for (const m of history.slice(-15)) this.message(m);
  }

  offline(reason: string): void {
    this.mount();
    this.net = undefined;
    this.root.classList.add("offline");
    this.setStatus("mode sendiri");
    this.system(reason);
  }

  isTyping(): boolean {
    return this.typing;
  }

  private setStatus(text: string): void {
    this.root.querySelector(".status")!.textContent = text;
  }

  private modes(): ChatMode[] {
    if (this.inClassRoom) return this.classActive ? ["kelas", "sekitar", "pribadi"] : ["sekitar", "pribadi"];
    return ["sekitar", "global", "pribadi"];
  }

  /** Dipanggil saat masuk ruang dan saat sesi kelas mulai/selesai. */
  setClassContext(inClassRoom: boolean, classActive: boolean): void {
    this.mount();
    const opened = inClassRoom && classActive && !(this.inClassRoom && this.classActive);
    this.inClassRoom = inClassRoom;
    this.classActive = classActive;
    // Sesi dimulai: langsung ke mode Kelas. Sesi selesai / keluar kelas: kembali ke Sekitar.
    if (opened) this.setMode("kelas");
    else if (!this.modes().includes(this.mode)) this.setMode("sekitar");
    else this.renderMode();
  }

  private cycleMode(): void {
    const modes = this.modes();
    this.setMode(modes[(modes.indexOf(this.mode) + 1) % modes.length]);
    if (this.mode === "pribadi" && !this.target) void this.pickTarget();
  }

  setMode(mode: ChatMode): void {
    this.mode = mode;
    this.renderMode();
  }

  private renderMode(): void {
    this.modeBtn.textContent = `${MODE_LABEL[this.mode]} ▾`;
    this.modeBtn.dataset.mode = this.mode;
    this.targetEl.hidden = this.mode !== "pribadi";
    if (this.mode !== "pribadi") return;
    if (!this.target) {
      this.targetEl.innerHTML = `<button type="button" class="pick">Pilih penerima…</button>`;
      this.targetEl.querySelector<HTMLButtonElement>(".pick")!.onclick = () => void this.pickTarget();
      this.input.placeholder = "Pilih penerima dulu (klik karakternya atau /w)";
      return;
    }
    const needAsk = this.needsRequest(this.target);
    this.targetEl.innerHTML = `<span>🔒 ke <b>${esc(this.target.name)}</b>${this.target.role === "dosen" ? " · dosen" : ""}</span>
      ${needAsk ? `<small>pesan pertama dikirim sebagai permintaan izin</small>` : ""}
      <button type="button" class="change" title="Ganti penerima">ganti</button>
      ${this.canClose(this.target) ? `<button type="button" class="close-pm" title="Tutup percakapan">tutup</button>` : ""}`;
    this.targetEl.querySelector<HTMLButtonElement>(".change")!.onclick = () => void this.pickTarget();
    this.targetEl.querySelector<HTMLButtonElement>(".close-pm")?.addEventListener("click", () => {
      if (this.target) this.net?.send("pmClose", { peer: this.target.uid });
    });
    this.input.placeholder = needAsk ? `Pesan pembuka untuk ${this.target.name} (maks. ${PM_REQUEST_MAX_LEN} karakter)` : `Pesan pribadi untuk ${this.target.name}`;
    this.input.maxLength = needAsk ? PM_REQUEST_MAX_LEN : CHAT_MAX_LEN;
  }

  private needsRequest(t: ChatTarget): boolean {
    return privateNeedsApproval(this.me.role, t.role) && !this.approved.has(t.uid);
  }

  private canClose(t: ChatTarget): boolean {
    return this.me.role === "dosen" && t.role === "mahasiswa";
  }

  /** Memilih penerima pesan pribadi (klik karakter memanggil ini dengan target langsung). */
  setTarget(t: ChatTarget): void {
    if (t.uid === this.me.uid) return;
    this.mount();
    this.target = t;
    this.setMode("pribadi");
    this.root.classList.remove("folded");
    this.input.focus();
  }

  private pickerCallback?: (players: S2C["directory"]["players"]) => void;

  private async pickTarget(): Promise<void> {
    if (!this.net?.connected) return;
    const players = await new Promise<S2C["directory"]["players"]>((resolve) => {
      this.pickerCallback = resolve;
      this.net!.send("directory", {});
    });
    const others = players.filter((p) => p.uid !== this.me.uid);
    const box = document.createElement("div");
    box.className = "picker";
    box.innerHTML = `<input placeholder="Cari nama…" /><div class="list"></div>`;
    const list = box.querySelector<HTMLElement>(".list")!;
    const search = box.querySelector<HTMLInputElement>("input")!;
    const render = () => {
      const q = search.value.toLowerCase();
      list.replaceChildren(
        ...others
          .filter((p) => p.name.toLowerCase().includes(q))
          .slice(0, 50)
          .map((p) => {
            const b = document.createElement("button");
            b.type = "button";
            b.innerHTML = `<b>${esc(p.name)}</b>${p.role === "dosen" ? " <i>dosen</i>" : ""}<small>${esc(p.place)}</small>`;
            b.onclick = () => {
              box.remove();
              this.setTarget({ uid: p.uid, name: p.name, role: p.role });
            };
            return b;
          }),
      );
      if (!list.children.length) list.innerHTML = `<p class="muted">Tidak ada pemain lain yang daring.</p>`;
    };
    search.addEventListener("input", render);
    search.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") box.remove();
    });
    render();
    this.root.querySelector(".picker")?.remove();
    this.root.append(box);
    search.focus();
  }

  directory(players: S2C["directory"]["players"]): void {
    this.pickerCallback?.(players);
    this.pickerCallback = undefined;
  }

  private submit(): void {
    const text = this.input.value.trim();
    if (!text) {
      this.input.blur();
      return;
    }
    if (text === "/w" || text.startsWith("/w ")) {
      this.input.value = "";
      void this.pickTarget();
      return;
    }
    if (!this.net?.connected) return;
    if (this.mode === "pribadi") {
      if (!this.target) return void this.pickTarget();
      if (this.needsRequest(this.target)) {
        this.net.send("pmAsk", { to: this.target.uid, text: text.slice(0, PM_REQUEST_MAX_LEN) });
      } else this.net.send("chat", { mode: "pribadi", text, to: this.target.uid });
    } else this.net.send("chat", { mode: this.mode, text });
    this.input.value = "";
    // Seperti di game umumnya: Enter mengirim lalu kembali ke permainan (Enter lagi untuk mengetik).
    this.input.blur();
  }

  // ----- pesan masuk -----

  message(m: ChatMessage): void {
    const id = `${m.at}|${m.fromUid}|${m.mode}|${m.text}`;
    if (this.seen.has(id)) return;
    this.seen.add(id);
    if (m.mode === "pribadi" && m.fromRole === "dosen" && this.me.role === "mahasiswa") this.approved.add(m.fromUid);
    const el = document.createElement("p");
    el.className = `msg ${m.mode}`;
    const who = `<b class="${m.fromRole === "dosen" ? "dosen" : ""}">${esc(m.fromName)}</b>`;
    const time = new Date(m.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    let head = who;
    if (m.mode === "global") head = `<span class="tag">Global</span> ${who}`;
    if (m.mode === "kelas") head = `<span class="tag">Kelas</span> ${who}`;
    if (m.mode === "pribadi") {
      const mine = m.fromUid === this.me.uid;
      head = `<span class="tag">🔒</span> ${mine ? `kamu → <b>${esc(m.toName ?? "")}</b>` : `${who} → kamu`}`;
      if (!mine && !this.target) this.target = { uid: m.fromUid, name: m.fromName, role: m.fromRole };
    }
    el.innerHTML = `<time>${time}</time> ${head}: ${esc(m.text)}`;
    if (m.mode === "pribadi" && m.fromUid !== this.me.uid) {
      el.title = "Klik untuk membalas";
      el.onclick = () => this.setTarget({ uid: m.fromUid, name: m.fromName, role: m.fromRole });
    }
    this.append(el);
  }

  system(text: string): void {
    const el = document.createElement("p");
    el.className = "msg system";
    el.textContent = text;
    this.append(el);
  }

  pmRequest(r: S2C["pmRequest"]): void {
    const el = document.createElement("div");
    el.className = "msg request";
    el.innerHTML = `<p><b>${esc(r.fromName)}</b> ingin chat pribadi:</p><q>${esc(r.text)}</q>
      <div><button type="button" class="ok">Terima</button><button type="button" class="no">Tolak</button></div>`;
    const done = (accept: boolean) => {
      this.net?.send("pmAnswer", { from: r.from, accept });
      el.querySelector("div")!.innerHTML = accept ? "<i>diterima</i>" : "<i>ditolak</i>";
      if (accept) this.setTarget({ uid: r.from, name: r.fromName, role: "mahasiswa" });
    };
    el.querySelector<HTMLButtonElement>(".ok")!.onclick = () => done(true);
    el.querySelector<HTMLButtonElement>(".no")!.onclick = () => done(false);
    this.root.classList.remove("folded");
    this.append(el);
  }

  pmStatus(s: S2C["pmStatus"]): void {
    if (s.state === "accepted") this.approved.add(s.peer);
    if (["declined", "expired", "closed", "offline"].includes(s.state)) this.approved.delete(s.peer);
    this.system(`${s.peerName ? `${s.peerName}: ` : ""}${STATE_TEXT[s.state]}.`);
    if (this.target?.uid === s.peer) this.renderMode();
  }

  private append(el: HTMLElement): void {
    const stick = this.log.scrollTop + this.log.clientHeight >= this.log.scrollHeight - 8;
    this.log.append(el);
    while (this.log.children.length > LOG_MAX) this.log.firstElementChild!.remove();
    if (stick) this.log.scrollTop = this.log.scrollHeight;
  }
}

export const chat = new ChatBox();
