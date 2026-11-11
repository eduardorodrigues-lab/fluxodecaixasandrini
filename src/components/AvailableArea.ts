import { useLayoutEffect, useRef, useState } from "react";

/** Remaining application space, including shell banners and padding; not another 100vh. */
export function useAvailableArea() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);
  useLayoutEffect(() => {
    const measure = () => {
      const top = ref.current?.getBoundingClientRect().top ?? 0;
      setHeight(Math.max(200, window.innerHeight - top - 16));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (ref.current?.parentElement) observer.observe(ref.current.parentElement);
    if (ref.current?.parentElement?.parentElement) observer.observe(ref.current.parentElement.parentElement);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  return { ref, height };
}