import type { SVGProps } from "react";

// Ayni's own icons (board 06), where lucide has nothing close enough: the five category icons, an
// "Otros" icon in the same style. 24 px grid, 20 px live area, 2 px stroke, round
// caps and joins, currentColor, the same stroke as the logo. Simple shapes that read at 16 px and in
// black and white on the printed poster.

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function icon(d: string, name: string) {
  function Icon({ className = "size-6", ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 ${className}`}
        aria-hidden
        {...rest}
      >
        <path d={d} />
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const MilkIcon = icon("M8 3h8v3l2 3.5V21H6V9.5L8 6z M8 6h8 M6 9.5h12 M10 14h4", "MilkIcon");
export const EggIcon = icon("M12 3c3.6 0 6 5.6 6 10a6 6 0 0 1-12 0c0-4.4 2.4-10 6-10z", "EggIcon");
export const BasketIcon = icon(
  "M3 10h18l-1.6 9a1.5 1.5 0 0 1-1.5 1.2H6.1a1.5 1.5 0 0 1-1.5-1.2z M8 10l2-5 M16 10l-2-5 M9 14v3 M12 14v3 M15 14v3",
  "BasketIcon",
);
export const CoffeeIcon = icon("M4 10h12v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M16 11h1.5a2.5 2.5 0 0 1 0 5H15.5 M8 3.5v3 M12 3.5v3", "CoffeeIcon");
export const ApartmentIcon = icon(
  "M4 21V4h10v17 M14 9h6v12 M2 21h20 M7.5 8h3 M7.5 12h3 M7.5 16h3 M17 13v.01 M17 17v.01",
  "ApartmentIcon",
);
/** Not on the board: a crate in the same style, for the generic category. */
export const CrateIcon = icon("M4 8l8-4 8 4v9l-8 4-8-4z M4 8l8 4 8-4 M12 12v9", "CrateIcon");
