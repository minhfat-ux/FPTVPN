import { useRef, useState } from "react";

const MAX_HISTORY = 25;

/**
 * Ngăn xếp hoàn tác/làm lại cho các trình soạn thảo trong Studio.
 * `apply` được gọi với trạng thái cần khôi phục.
 */
export function useUndoStack<T>(apply: (next: T) => void) {
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);
  const currentRef = useRef<T | null>(null);

  /** Gọi sau mỗi thay đổi để lưu trạng thái trước đó vào ngăn xếp. */
  const push = (previous: T) => {
    setPast((stack) => [...stack.slice(-(MAX_HISTORY - 1)), previous]);
    setFuture([]);
  };

  const undo = () => {
    const current = currentRef.current;
    if (!past.length) return;
    const previous = past[past.length - 1];
    if (current !== null) setFuture((stack) => [current, ...stack].slice(0, MAX_HISTORY));
    setPast((stack) => stack.slice(0, -1));
    apply(previous);
  };

  const redo = () => {
    const current = currentRef.current;
    if (!future.length) return;
    const target = future[0];
    if (current !== null) setPast((stack) => [...stack.slice(-(MAX_HISTORY - 1)), current]);
    setFuture((stack) => stack.slice(1));
    apply(target);
  };

  const clear = () => {
    setPast([]);
    setFuture([]);
  };

  return { past, future, push, undo, redo, clear, currentRef };
}
