// Dark by default; a light system preference or a saved choice wins. Loaded in <head> so the
// page never flashes the wrong theme. Swagger UI styles itself from `html.dark-mode`.
const root = document.documentElement;
const saved = localStorage.getItem('theme');
const prefersLight = matchMedia('(prefers-color-scheme: light)').matches;
root.classList.toggle('dark-mode', (saved ?? (prefersLight ? 'light' : 'dark')) === 'dark');

document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('[data-theme-toggle]');
  if (!button) return;
  const label = () => {
    const dark = root.classList.contains('dark-mode');
    button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    button.dataset.mode = dark ? 'dark' : 'light';
  };
  label();
  button.addEventListener('click', () => {
    const dark = root.classList.toggle('dark-mode');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    label();
  });
});
