import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

export function DropdownMenuContent({ className, sideOffset = 8, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-64 rounded-[5px] border border-slate-200 bg-white p-1 shadow-lg outline-none",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, inset, ...props }) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-2 text-sm text-slate-700 outline-none transition focus:bg-slate-50",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuCheckboxItem({ className, children, checked, ...props }) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-[4px] py-2 pl-8 pr-2 text-sm text-slate-700 outline-none transition focus:bg-slate-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }) {
  return <DropdownMenuPrimitive.Label className={cn("px-2 py-1.5 text-xs font-medium text-slate-500", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }) {
  return <DropdownMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-slate-100", className)} {...props} />;
}

export function DropdownIcon() {
  return <ChevronDown className="h-3.5 w-3.5 text-slate-500" />;
}
