import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { undoLast, useUndoStack } from "@/lib/undo";

export function UndoButton() {
  const stack = useUndoStack();
  const last = stack[stack.length - 1];
  const disabled = !last;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => undoLast()}
            className="h-8 gap-1.5"
          >
            <Undo2 className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Desfazer</span>
            {stack.length > 0 && (
              <span className="ml-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {stack.length}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {disabled ? "Nada para desfazer" : `Desfazer: ${last.label}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
