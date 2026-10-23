import Phaser from "phaser";
import "./style.css";
import { LocalAuth, type Account, type AuthService } from "./auth";
import { loadAssembler } from "./char/load";
import { setAssembler } from "./char/textures";
import { WorldScene } from "./scenes/WorldScene";
import { openCreator } from "./ui/creator";
import { showError, showLoading } from "./ui/hud";
import { hideTitle, showTitle } from "./ui/title";
import { mountTouchPad } from "./ui/touch";

// Alur: halaman awal -> masuk/daftar -> buat avatar (bila belum) -> kampus.
// Sesi yang masih aktif di tab ini langsung masuk ke kampus.
async function boot(): Promise<void> {
  const auth: AuthService = new LocalAuth();
  const asm = await loadAssembler();
  setAssembler(asm);
  showLoading(false);

  let account = auth.current() ?? (await showTitle(auth));
  if (!account.character) {
    hideTitle(true);
    account = await new Promise<Account>((resolve) =>
      openCreator(asm, {
        name: account.fullName,
        choice: null,
        required: true,
        onSave: async (choice) => resolve(await auth.saveCharacter(choice)),
      }),
    );
  }
  hideTitle();
  startGame(auth, account);
}

function startGame(auth: AuthService, account: Account): void {
  document.body.classList.add("in-game");
  mountTouchPad();
  const bar = document.getElementById("account")!;
  bar.hidden = false;
  bar.querySelector(".acc-name")!.textContent = account.fullName;
  bar.querySelector<HTMLButtonElement>(".logout")!.onclick = () => {
    auth.logout();
    location.reload();
  };

  showLoading(true);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    backgroundColor: "#0e1522",
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    input: { keyboard: { target: window } },
    // Scene dijalankan setelah registry terisi.
    scene: [],
  });
  game.registry.set("auth", auth);
  game.registry.set("account", account);
  game.scene.add("world", WorldScene, true);
}

boot().catch((err: unknown) => {
  console.error(err);
  showError(`Gagal memulai. ${err instanceof Error ? err.message : ""}`);
});
