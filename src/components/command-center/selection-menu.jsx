import { cloneElement, isValidElement, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownIcon,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function SelectionMenu({
  children,
  contentClassName,
  emptyText,
  getItemDescription,
  getItemLabel,
  items,
  label,
  onSelect,
  showSelectionIndicator = true,
  tooltipContent,
  triggerLabel,
  value,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipSuppressed, setTooltipSuppressed] = useState(false);

  const clearTooltipSuppression = useCallback(() => {
    setTooltipSuppressed(false);
  }, []);

  const closeTooltip = useCallback(() => {
    setTooltipOpen(false);
  }, []);

  const handleMenuOpenChange = useCallback((nextOpen) => {
    setMenuOpen(nextOpen);
    if (nextOpen) {
      setTooltipOpen(false);
      setTooltipSuppressed(true);
    }
  }, []);

  const handleTooltipOpenChange = useCallback((nextOpen) => {
    if (menuOpen || tooltipSuppressed) {
      setTooltipOpen(false);
      return;
    }
    setTooltipOpen(nextOpen);
  }, [menuOpen, tooltipSuppressed]);

  const handleSelect = useCallback((item) => {
    setTooltipOpen(false);
    setTooltipSuppressed(true);
    onSelect(item);
  }, [onSelect]);

  const triggerChild = useMemo(() => {
    const triggerProps = {
      onBlur: clearTooltipSuppression,
      onPointerDown: closeTooltip,
      onPointerLeave: clearTooltipSuppression,
    };

    if (children && isValidElement(children)) {
      return cloneElement(children, {
        onBlur: (event) => {
          children.props.onBlur?.(event);
          clearTooltipSuppression();
        },
        onPointerDown: (event) => {
          children.props.onPointerDown?.(event);
          closeTooltip();
        },
        onPointerLeave: (event) => {
          children.props.onPointerLeave?.(event);
          clearTooltipSuppression();
        },
      });
    }

    return (
      <Button variant="ghost" size="icon" aria-label={triggerLabel || label} className="h-7 w-7" {...triggerProps}>
        <DropdownIcon />
      </Button>
    );
  }, [children, clearTooltipSuppression, closeTooltip, label, triggerLabel]);

  return (
    <DropdownMenu onOpenChange={handleMenuOpenChange}>
      <Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>{triggerChild}</DropdownMenuTrigger>
        </TooltipTrigger>
        {tooltipContent ? <TooltipContent side="bottom">{tooltipContent}</TooltipContent> : null}
      </Tooltip>
      <DropdownMenuContent align="end" className={contentClassName}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length ? (
          items.map((item) => (
            showSelectionIndicator ? (
              <DropdownMenuCheckboxItem key={item} checked={item === value} onCheckedChange={() => handleSelect(item)}>
                {getItemDescription ? (
                  <div className="grid min-w-[14rem] grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
                    <span className="font-medium">{getItemLabel ? getItemLabel(item) : item}</span>
                    <span className="text-muted-foreground">{getItemDescription(item)}</span>
                  </div>
                ) : (
                  getItemLabel ? getItemLabel(item) : item
                )}
              </DropdownMenuCheckboxItem>
            ) : (
              <DropdownMenuItem key={item} onSelect={() => handleSelect(item)}>
                {getItemDescription ? (
                  <div className="grid min-w-[14rem] grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
                    <span className="font-medium">{getItemLabel ? getItemLabel(item) : item}</span>
                    <span className="text-muted-foreground">{getItemDescription(item)}</span>
                  </div>
                ) : (
                  getItemLabel ? getItemLabel(item) : item
                )}
              </DropdownMenuItem>
            )
          ))
        ) : (
          <div className="px-1 py-1">
            <div className="rounded-md bg-background/70 px-3 py-2.5 text-xs leading-5 text-muted-foreground whitespace-pre-line break-words">
              {emptyText}
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
