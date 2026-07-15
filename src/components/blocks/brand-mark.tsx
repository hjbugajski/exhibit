/**
 * The Exhibit mark as inline JSX, colored via `fill-current` so it follows the app theme
 * (data-theme), not the OS. The old `<img src="/favicon.svg">` relied on a prefers-color-scheme
 * style inside the SVG, which iOS Safari evaluates unreliably inside <img> and which can't see
 * the app's forced Light/Dark preference at all. Same path as public/favicon.svg — keep in sync.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="currentColor" viewBox="0 0 32 32">
      <path
        d="M6 2H26A4 4 0 0 1 30 6V26A4 4 0 0 1 26 30H6A4 4 0 0 1 2 26V6A4 4 0 0 1 6 2ZM10 8H22A1 1 0 0 1 23 9V16A1 1 0 0 1 22 17H10A1 1 0 0 1 9 16V9A1 1 0 0 1 10 8Z"
        fillRule="evenodd"
      />
    </svg>
  );
}
