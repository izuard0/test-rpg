import Phaser from "phaser";
import "./style.css";
import { WorldScene } from "./scenes/WorldScene";
import { mountTouchPad } from "./ui/touch";

mountTouchPad();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0e1522",
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  input: { keyboard: { target: window } },
  scene: [WorldScene],
});
