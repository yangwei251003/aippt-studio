/* UI interaction reference: gharsh11032000 / Uiverse. MIT; see licenses/uiverse/LICENSE.
 * Local application styling and React integration; not claimed as solely original. */
"use client";

import Link from "next/link";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type PointerEvent,
} from "react";
import styles from "./specular-action.module.css";

function updateSpecularPosition(event: PointerEvent<HTMLElement>) {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
  const angle = Math.atan2(y - rect.height / 2, x - rect.width / 2) * (180 / Math.PI) + 90;
  element.style.setProperty("--specular-x", `${x}px`);
  element.style.setProperty("--specular-y", `${y}px`);
  element.style.setProperty("--specular-angle", `${angle}deg`);
}

export const SpecularButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function SpecularButton(
  { className = "", onPointerMove, onPointerLeave, type = "button", ...props },
  ref,
) {
  return <button
    {...props}
    ref={ref}
    type={type}
    className={`${styles.action} ${className}`}
    onPointerMove={(event) => { updateSpecularPosition(event); onPointerMove?.(event); }}
    onPointerLeave={(event) => {
      event.currentTarget.style.setProperty("--specular-x", "50%");
      event.currentTarget.style.setProperty("--specular-y", "50%");
      onPointerLeave?.(event);
    }}
  />;
});

type SpecularLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

export const SpecularLink = forwardRef<HTMLAnchorElement, SpecularLinkProps>(function SpecularLink(
  { className = "", onPointerMove, onPointerLeave, href, ...props },
  ref,
) {
  return <Link
    {...props}
    ref={ref}
    href={href}
    className={`${styles.action} ${className}`}
    onPointerMove={(event) => { updateSpecularPosition(event); onPointerMove?.(event); }}
    onPointerLeave={(event) => {
      event.currentTarget.style.setProperty("--specular-x", "50%");
      event.currentTarget.style.setProperty("--specular-y", "50%");
      onPointerLeave?.(event);
    }}
  />;
});
