import { Game } from './core/Game';

const container = document.getElementById('app')!;
const game = new Game(container);
game.start();

if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;

// Hot reload sırasında eski oyunu temizle
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
