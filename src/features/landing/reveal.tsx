"use client";

import { useEffect, useRef, useState } from "react";

/** Fades/slides its content in when it scrolls into view (CSS in globals.css). */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // "idle" = server/no-JS: visible. "hidden" only once JS runs and the block is off-screen.
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const setShown = (value: boolean) => setState(value ? "shown" : "hidden");
    const rect = node.getBoundingClientRect();
    // Already on screen: no animation, avoids a flash of hidden content.
    if (rect.top < window.innerHeight && rect.bottom > 0) return;
    setShown(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-state={state}
      className={`reveal ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
