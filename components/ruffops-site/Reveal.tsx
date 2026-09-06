"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fade/slide reveal. Starts visible after a short fallback so content never
 * appears "blank" or distorted if IntersectionObserver is delayed.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  id
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const show = () => setVisible(true);
    const fallback = window.setTimeout(show, 900 + delay);

    if (typeof IntersectionObserver === "undefined") {
      show();
      return () => window.clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            window.setTimeout(show, delay);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(node);
    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, [delay]);

  return (
    <div ref={ref} id={id} className={`reveal ${visible ? "is-visible" : ""} ${className}`}>
      {children}
    </div>
  );
}
