import {
  forwardRef,
  type ReactNode,
  type SVGProps,
} from "react";

export interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, "title"> {
  size?: number | string;
  title?: string;
  children?: ReactNode;
}

/**
 * Shared 24px icon frame: 1.75 stroke, rounded caps, currentColor.
 * Icons are decorative unless a `title` is supplied.
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(
  { size = 24, title, children, ...rest },
  ref,
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
});

Icon.displayName = "Icon";
