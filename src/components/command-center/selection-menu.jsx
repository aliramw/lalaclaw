import { Button } from "@/components/ui/button";
import {
  DropdownIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SelectionMenu({ children, emptyText, getItemDescription, getItemLabel, items, label, onSelect, tooltipContent, triggerLabel, value }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          {children ? (
            <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
          ) : (
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={triggerLabel || label} className="h-7 w-7">
                <DropdownIcon />
              </Button>
            </DropdownMenuTrigger>
          )}
        </TooltipTrigger>
        {tooltipContent ? <TooltipContent side="bottom">{tooltipContent}</TooltipContent> : null}
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length ? (
          items.map((item) => (
            <DropdownMenuCheckboxItem key={item} checked={item === value} onCheckedChange={() => onSelect(item)}>
              {getItemDescription ? (
                <div className="grid min-w-[14rem] grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
                  <span className="font-medium">{getItemLabel ? getItemLabel(item) : item}</span>
                  <span className="text-muted-foreground">{getItemDescription(item)}</span>
                </div>
              ) : (
                getItemLabel ? getItemLabel(item) : item
              )}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{emptyText}</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
