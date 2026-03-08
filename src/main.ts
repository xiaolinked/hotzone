import './style.css'
import { inject } from '@vercel/analytics';
import { Game } from './game';

inject();

// Inline CSS for full screen canvas
const style = document.createElement('style');
style.innerHTML = `
  body { margin: 0; overflow: hidden; background: #000; }
  canvas { display: block; touch-action: none; }
`;
document.head.appendChild(style);

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas id="gameCanvas"></canvas>
`;



const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// Audio Unlock Helper
const unlockAudio = () => {
  // Import dynamically or just call ZzFX if we exported it
  // Actually ZzFX is a static class, so we can import it
  import('./audio/ZzFX').then(({ ZzFX }) => {
    ZzFX.play(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0); // Play nothing
  });
  window.removeEventListener('click', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
};

window.addEventListener('click', unlockAudio);
window.addEventListener('keydown', unlockAudio);
