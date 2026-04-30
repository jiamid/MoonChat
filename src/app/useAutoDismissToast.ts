import { useEffect, useRef } from "react";

export function useAutoDismissToast({
  error,
  statusMessage,
  onClear,
}: {
  error: string | null;
  statusMessage: string | null;
  onClear: () => void;
}) {
  const toastTimerRef = useRef<number | null>(null);
  const onClearRef = useRef(onClear);

  useEffect(() => {
    onClearRef.current = onClear;
  }, [onClear]);

  useEffect(() => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    if (!error && !statusMessage) {
      return;
    }

    toastTimerRef.current = window.setTimeout(() => {
      onClearRef.current();
      toastTimerRef.current = null;
    }, error ? 5200 : 2600);

    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [error, statusMessage]);
}
