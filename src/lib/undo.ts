import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Insert = { table: string; rows: any[] };
export type UndoEntry = {
  id: string;
  label: string;
  at: number;
  inserts: Insert[];
};

const KEY = "undo_stack_v1";
const MAX = 20;
const listeners = new Set<() => void>();

function read(): UndoEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function write(s: UndoEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(s.slice(-MAX)));
  listeners.forEach((l) => l());
}

export function pushUndo(label: string, inserts: Insert[]) {
  const filtered = inserts.filter((i) => i.rows && i.rows.length > 0);
  if (filtered.length === 0) return;
  const stack = read();
  stack.push({ id: crypto.randomUUID(), label, at: Date.now(), inserts: filtered });
  write(stack);
  toast.success(label, {
    action: { label: "Desfazer", onClick: () => undoLast() },
    duration: 8000,
  });
}

export async function undoLast(): Promise<boolean> {
  const stack = read();
  const last = stack.pop();
  if (!last) {
    toast.info("Nada para desfazer");
    return false;
  }
  for (const ins of last.inserts) {
    const { error } = await supabase.from(ins.table as any).insert(ins.rows as any);
    if (error) {
      toast.error(`Falha ao desfazer: ${error.message}`);
      return false;
    }
  }
  write(stack);
  toast.success(`Desfeito: ${last.label}`);
  // Lightweight refresh hook: dispatch a custom event consumers can listen to
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("undo:applied", { detail: last }));
  }
  return true;
}

export function clearUndo() {
  write([]);
}

export function useUndoStack(): UndoEntry[] {
  const [stack, setStack] = useState<UndoEntry[]>(() => read());
  useEffect(() => {
    const cb = () => setStack(read());
    listeners.add(cb);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setStack(read());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(cb);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return stack;
}
